import type {
  ProcessingSettings,
  PuzzlePath,
  PuzzleResult,
  PuzzleWarning,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import { createDots, extractSingleStrokeIfThin, pathLength, ramerDouglasPeucker, sampleAdaptiveDots, type Point } from "./geometry";
import { contourPathCap, deduplicateContours, rankContourCandidates, type RawContour } from "./contours";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const cancelled = new Set<string>();
let cvPromise: Promise<any> | undefined;

function send(message: WorkerResponse): void {
  workerScope.postMessage(message);
}

function progress(requestId: string, stage: string, value: number): void {
  send({ type: "progress", requestId, stage, progress: value });
}

function yieldToWorker(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function loadCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const imported = await import("@techstark/opencv-js");
      let cv: any = imported.default;
      if (cv instanceof Promise) cv = await cv;
      if (cv?.Mat) return cv;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("OpenCV.js did not finish initializing.")), 45_000);
        const previous = cv?.onRuntimeInitialized;
        if (!cv) {
          clearTimeout(timer);
          reject(new Error("OpenCV.js module could not be loaded."));
          return;
        }
        cv.onRuntimeInitialized = () => {
          clearTimeout(timer);
          if (typeof previous === "function") previous();
          resolve();
        };
      });
      return cv;
    })();
  }
  return cvPromise;
}

function collectContours(cv: any, source: any, sourceType: "edge" | "adaptive"): RawContour[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const image = source.clone();
  try {
    cv.findContours(image, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_NONE);
    const result: RawContour[] = [];
    const maxRawContours = Math.min(contours.size(), 6000);
    const hierarchyData = hierarchy.data32S as Int32Array;
    for (let i = 0; i < maxRawContours; i += 1) {
      const contour = contours.get(i);
      try {
        const pointData = contour.data32S as Int32Array;
        const count = Math.floor(pointData.length / 2);
        if (count < 5) continue;
        const points: Point[] = [];
        const stride = Math.max(1, Math.floor(count / 18_000));
        for (let j = 0; j < count; j += stride) points.push({ x: pointData[j * 2], y: pointData[j * 2 + 1] });
        const rect = cv.boundingRect(contour);
        const perimeter = cv.arcLength(contour, true);
        const area = Math.abs(cv.contourArea(contour));
        if (points.length < 5 || perimeter < 10) continue;
        const parent = hierarchyData.length >= (i + 1) * 4 ? hierarchyData[i * 4 + 3] : -1;
        result.push({
          points,
          area,
          perimeter,
          parent,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          source: sourceType,
          score: 0,
          kind: "detail",
        });
      } finally {
        contour.delete();
      }
    }
    return result;
  } finally {
    image.delete();
    hierarchy.delete();
    contours.delete();
  }
}

function buildPuzzle(
  contours: RawContour[],
  width: number,
  height: number,
  settings: ProcessingSettings,
  processingMs: number,
): PuzzleResult {
  const ranked = deduplicateContours(rankContourCandidates(contours, width, height, settings));
  const pathCap = contourPathCap(settings);
  const minDots = settings.closeContours ? 6 : 2;
  const viable = ranked.filter((contour) => {
    const closed = settings.closeContours && contour.points.length >= 6 && contour.area > Math.max(8, contour.perimeter * 0.06);
    return contour.points.length >= (closed ? 6 : 2);
  });
  const usable = viable.slice(0, Math.min(pathCap, Math.floor(settings.dotBudget / minDots) + 1));
  const weights = usable.map((contour) => Math.max(0.2, Math.sqrt(contour.perimeter) * Math.sqrt(Math.max(0.1, contour.score))));
  const sumWeights = weights.reduce((total, value) => total + value, 0) || 1;
  const pathTargets = usable.map((_, index) => Math.max(minDots, Math.floor(settings.dotBudget * weights[index] / sumWeights)));
  let assigned = pathTargets.reduce((sum, value) => sum + value, 0);
  for (let i = 0; assigned < settings.dotBudget && usable.length; i = (i + 1) % usable.length) {
    pathTargets[i] += 1;
    assigned += 1;
  }
  const paths: PuzzlePath[] = [];
  usable.forEach((contour, index) => {
    // Detect if this contour is an open stroke doubled-back around a 1-2px edge line
    const unrolled = extractSingleStrokeIfThin(contour.points);
    const strokePoints = unrolled || contour.points;
    const isClosed = !unrolled && settings.closeContours && contour.points.length >= 6 && contour.area > Math.max(8, contour.perimeter * 0.06);

    const length = pathLength(strokePoints, isClosed);
    if (length < 9) return;
    const target = Math.min(pathTargets[index], settings.dotBudget, strokePoints.length);

    // Fine-grained smoothing tolerance removes 1px staircase raster quantization
    // while faithfully preserving all true curves, corners, and contours
    const epsilon = Math.max(0.4, Math.min(1.4, 0.45 + (10 - settings.fineDetail) * 0.08));
    let simplified = ramerDouglasPeucker(strokePoints, epsilon, isClosed);
    const minimum = isClosed ? 6 : 2;
    if (simplified.length < minimum) simplified = strokePoints;

    const sampled = sampleAdaptiveDots(
      simplified,
      Math.max(minimum, target),
      settings.minSpacing * (1.08 - settings.fineDetail * 0.025),
      settings.fineDetail,
      isClosed,
    );
    if (sampled.length < minimum) return;
    const id = `path-${String(paths.length + 1).padStart(2, "0")}`;
    paths.push({
      id,
      kind: contour.kind,
      points: createDots(id, sampled),
      closed: isClosed,
      area: isClosed ? contour.area : 0,
      perimeter: isClosed ? contour.perimeter : length,
      score: contour.score,
    });
  });

  const totalDots = paths.reduce((sum, path) => sum + path.points.length, 0);
  const warnings: PuzzleWarning[] = [];
  if (paths.length === 0) warnings.push({ code: "no-contours", message: "No clear contours were found. Try raising sensitivity or detail." });
  const shortPaths = paths.filter((path) => path.points.length < (path.closed ? 6 : 2)).length;
  if (shortPaths) warnings.push({ code: "too-few-dots", message: `${shortPaths} path${shortPaths === 1 ? "" : "s"} have too few dots to follow.`, count: shortPaths });
  if (totalDots < settings.dotBudget * 0.55 && paths.length > 0) {
    warnings.push({ code: "budget-reduced", message: `The contour structure supports ${totalDots} well-spaced dots within the current settings.`, count: totalDots });
  }
  if (ranked.length > paths.length * 2) {
    warnings.push({ code: "background-noise", message: `${ranked.length - paths.length} low-priority contour candidates were suppressed.`, count: ranked.length - paths.length });
  }
  return { width, height, paths, totalDots, processingMs, engine: "opencv", warnings, contourCount: ranked.length };
}

async function runProcess(request: Extract<WorkerRequest, { type: "process" }>): Promise<void> {
  const started = performance.now();
  const { requestId, file, settings } = request;
  try {
    if (cancelled.has(requestId)) return;
    progress(requestId, "Preparing image", 0.04);
    await yieldToWorker();
    if (cancelled.has(requestId)) return;
    const cv = await loadCv();
    progress(requestId, "Decoding image", 0.13);
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("This browser could not prepare the image for processing.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      if (cancelled.has(requestId)) return;
      progress(requestId, "Normalizing contrast", 0.28);
      await yieldToWorker();
      const source = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const denoised = new cv.Mat();
      const edgeFine = new cv.Mat();
      const adaptive = new cv.Mat();
      const combinedEdges = new cv.Mat();
      try {
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);

        // 1. Denoising: gentle Gaussian smoothing preserves sharp line-art edges
        const blurSigma = Math.max(0.4, 0.75 - settings.lineArtEnhancement * 0.04);
        cv.GaussianBlur(gray, denoised, new cv.Size(3, 3), blurSigma, blurSigma, cv.BORDER_DEFAULT);

        // 2. Black Hat morphology isolates dark ink lines (eyes, eyelashes, hair, chin, clothing lines)
        // from flat skin tones, cel shading, and soft color gradients
        const lineKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
        const blackhat = new cv.Mat();
        cv.morphologyEx(denoised, blackhat, cv.MORPH_BLACKHAT, lineKernel);
        lineKernel.delete();

        const lineMask = new cv.Mat();
        const lineThreshold = Math.max(14, 40 - settings.contourSensitivity * 2.6 - settings.fineDetail * 1.3);
        cv.threshold(blackhat, lineMask, lineThreshold, 255, cv.THRESH_BINARY);
        blackhat.delete();

        // 3. Clean Canny edges for outer boundaries and silhouettes without edge-shifting coarse blurs
        const low = Math.max(16, 95 - settings.contourSensitivity * 6.5 - settings.fineDetail * 1.5);
        const high = Math.max(low + 24, 195 - settings.contourSensitivity * 7.5);
        cv.Canny(denoised, edgeFine, low, high, 3, true);

        // 4. Combine line art ink strokes with clean silhouette edges
        cv.bitwise_or(lineMask, edgeFine, combinedEdges);
        lineMask.delete();

        // 5. Adaptive threshold used to capture secondary details, cleaned to avoid cel-shading noise
        const block = Math.max(11, Math.min(31, 15 + 2 * Math.round(settings.fineDetail / 3))) | 1;
        const constant = 5 + settings.backgroundSuppression * 0.45 - settings.contourSensitivity * 0.2;
        cv.adaptiveThreshold(denoised, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, block, constant);
        const cleanKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        const adaptiveClean = new cv.Mat();
        cv.morphologyEx(adaptive, adaptiveClean, cv.MORPH_OPEN, cleanKernel);
        cleanKernel.delete();

        if (cancelled.has(requestId)) return;
        progress(requestId, "Following contour paths", 0.57);
        await yieldToWorker();
        const raw = [
          ...collectContours(cv, combinedEdges, "edge"),
          ...collectContours(cv, adaptiveClean, "adaptive"),
        ];
        adaptiveClean.delete();
        if (cancelled.has(requestId)) return;
        progress(requestId, "Placing numbered dots", 0.77);
        await yieldToWorker();
        const result = buildPuzzle(raw, width, height, settings, Math.round(performance.now() - started));
        progress(requestId, "Checking path quality", 0.94);
        await yieldToWorker();
        if (!cancelled.has(requestId)) send({ type: "result", requestId, result });
      } finally {
        source.delete();
        gray.delete();
        denoised.delete();
        edgeFine.delete();
        adaptive.delete();
        combinedEdges.delete();
      }
    } finally {
      bitmap.close();
    }
  } catch (error) {
    if (!cancelled.has(requestId)) {
      const message = error instanceof Error ? error.message : "Image processing could not complete.";
      send({ type: "error", requestId, message });
    }
  } finally {
    cancelled.delete(requestId);
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.requestId);
    return;
  }
  void runProcess(request);
};
