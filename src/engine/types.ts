export type Difficulty = "easy" | "medium" | "detailed" | "extreme" | "custom";
export type PathMode = "multi" | "continuous";
export type ProcessingFocus = "anime" | "lineart" | "photo" | "balanced";
export type ProcessingProfile = ProcessingFocus;
export type ContourKind =
  | "silhouette"
  | "primary-contour"
  | "secondary-contour"
  | "fine-detail"
  | "accent"
  | "facial"
  | "hair"
  | "clothing"
  | "object"
  | "detail";

export interface ProcessingSettings {
  // Four primary normalized precision controls (0–100%)
  detailPreservation: number;    // 0–100%, default 70
  backgroundSuppression: number; // 0–100%, default 75
  minimumSpacing: number;        // 0–100%, default 55
  processingFocus: ProcessingFocus; // default "anime"

  // Compatibility aliases
  profile: ProcessingProfile;
  fineDetail: number;
  minSpacing: number;

  difficulty: Difficulty;
  dotBudget: number;
  contourSensitivity: number;
  lineArtEnhancement: number;
  pathComplexity: number;
  labelSize: number;
  showNumbers: boolean;
  dotSize: number;
  printScale: number;
  pathMode: PathMode;
  closeContours: boolean;
}

export interface Dot {
  id: string;
  x: number;
  y: number;
  index: number;
}

export interface PuzzlePath {
  id: string;
  kind: ContourKind;
  points: Dot[];
  closed: boolean;
  area: number;
  perimeter: number;
  score: number;
}

export interface PuzzleWarning {
  code: "too-few-dots" | "label-overlap" | "no-contours" | "budget-reduced" | "background-noise" | "outside-printable";
  message: string;
  count?: number;
}

export interface PuzzleResult {
  width: number;
  height: number;
  paths: PuzzlePath[];
  suppressedPaths?: PuzzlePath[];
  totalDots: number;
  processingMs: number;
  engine: "opencv";
  warnings: PuzzleWarning[];
  contourCount: number;
}

export interface ImageMetadata {
  name: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
}

export interface WorkerProcessMessage {
  type: "process";
  requestId: string;
  file: File;
  settings: ProcessingSettings;
}

export interface WorkerCancelMessage {
  type: "cancel";
  requestId: string;
}

export type WorkerRequest = WorkerProcessMessage | WorkerCancelMessage;

export interface WorkerProgressMessage {
  type: "progress";
  requestId: string;
  stage: string;
  progress: number;
}

export interface WorkerResultMessage {
  type: "result";
  requestId: string;
  result: PuzzleResult;
}

export interface WorkerErrorMessage {
  type: "error";
  requestId: string;
  message: string;
}

export type WorkerResponse = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;

export interface PrecisionParams {
  blurSigma: number;
  bilateralSigmaColor: number;
  bilateralSigmaSpace: number;
  blackhatThreshold: number;
  cannyLow: number;
  cannyHigh: number;
  adaptiveBlockSize: number;
  adaptiveC: number;
  rdpToleranceEpsilon: number;
  pixelMinSpacing: number;
  cornerCurvatureThreshold: number;
  minContourPerimeter: number;
  suppressionRatio: number;
  detailRatio: number;
  spacingRatio: number;
}

export function validateSettings(input: Partial<ProcessingSettings>): ProcessingSettings {
  const detail = Math.max(
    0,
    Math.min(
      100,
      typeof input.detailPreservation === "number"
        ? Math.round(input.detailPreservation)
        : typeof input.fineDetail === "number"
        ? Math.round(input.fineDetail * 10)
        : 70,
    ),
  );

  const bg = Math.max(
    0,
    Math.min(
      100,
      typeof input.backgroundSuppression === "number"
        ? Math.round(input.backgroundSuppression <= 10 ? input.backgroundSuppression * 10 : input.backgroundSuppression)
        : 75,
    ),
  );

  const spacing = Math.max(
    0,
    Math.min(
      100,
      typeof input.minimumSpacing === "number"
        ? Math.round(input.minimumSpacing)
        : typeof input.minSpacing === "number"
        ? Math.round(((input.minSpacing - 3) / 22) * 100)
        : 55,
    ),
  );

  const validFocuses: ProcessingFocus[] = ["anime", "lineart", "photo", "balanced"];
  let safeFocus: ProcessingFocus = "anime";
  if (input.processingFocus && input.processingFocus !== "anime" && validFocuses.includes(input.processingFocus)) {
    safeFocus = input.processingFocus;
  } else if (input.profile && input.profile !== "anime" && validFocuses.includes(input.profile)) {
    safeFocus = input.profile;
  } else if (input.processingFocus && validFocuses.includes(input.processingFocus)) {
    safeFocus = input.processingFocus;
  } else if (input.profile && validFocuses.includes(input.profile)) {
    safeFocus = input.profile;
  }

  const difficulty = input.difficulty ?? "medium";
  const dotBudget = clampBudget(input.dotBudget ?? 240);
  const contourSensitivity = Math.max(1, Math.min(10, Math.round(input.contourSensitivity ?? 5)));
  const lineArtEnhancement = Math.max(0, Math.min(10, Math.round(input.lineArtEnhancement ?? 4)));
  const pathComplexity = Math.max(1, Math.min(10, Math.round(input.pathComplexity ?? 6)));
  const labelSize = Math.max(6, Math.min(18, Math.round(input.labelSize ?? 9)));
  const dotSize = Math.max(1, Math.min(6, input.dotSize ?? 2.6));
  const printScale = Math.max(70, Math.min(130, Math.round(input.printScale ?? 100)));
  const pathMode = input.pathMode === "continuous" ? "continuous" : "multi";
  const closeContours = input.closeContours !== false;

  return {
    detailPreservation: detail,
    backgroundSuppression: bg,
    minimumSpacing: spacing,
    processingFocus: safeFocus,
    profile: safeFocus,
    fineDetail: Math.max(1, Math.min(10, Math.round(detail / 10))),
    minSpacing: Math.max(2, Math.round(3 + (spacing / 100) * 22)),
    difficulty,
    dotBudget,
    contourSensitivity,
    lineArtEnhancement,
    pathComplexity,
    labelSize,
    showNumbers: input.showNumbers !== false,
    dotSize,
    printScale,
    pathMode,
    closeContours,
  };
}

export function mapSettingsToPrecisionParams(settings: ProcessingSettings): PrecisionParams {
  const detailRatio = Math.max(0, Math.min(1, settings.detailPreservation / 100));
  const suppressionRatio = Math.max(0, Math.min(1, settings.backgroundSuppression / 100));
  const spacingRatio = Math.max(0, Math.min(1, settings.minimumSpacing / 100));

  // Preprocessing blur & bilateral filtering
  const blurSigma = Math.max(0.35, 0.85 - detailRatio * 0.45);
  const bilateralSigmaColor = Math.round(30 + (1 - detailRatio) * 40);
  const bilateralSigmaSpace = Math.round(30 + (1 - detailRatio) * 40);

  // Black Hat threshold: lower threshold at high detail captures fine eyelashes, accessories, hair strands
  const blackhatThreshold = Math.max(10, Math.round(36 - detailRatio * 20 - (settings.contourSensitivity - 5) * 2.0));

  // Canny edge thresholds
  const cannyLow = Math.max(14, Math.round(75 - detailRatio * 35 - (settings.contourSensitivity - 5) * 4.5));
  const cannyHigh = Math.max(cannyLow + 25, Math.round(180 - detailRatio * 45 - (settings.contourSensitivity - 5) * 5.0));

  // Adaptive threshold
  const adaptiveBlockSize = (Math.max(11, Math.min(31, Math.round(15 + detailRatio * 10))) | 1);
  const adaptiveC = Math.max(2, 4 + suppressionRatio * 4 - detailRatio * 2);

  // RDP simplification tolerance: 0% -> 1.6px, 70% -> ~0.795px, 100% -> 0.45px
  const rdpToleranceEpsilon = Math.max(0.40, Math.min(1.60, 1.60 - detailRatio * 1.15));

  // Minimum dot spacing in pixels: 0% -> 3px, 55% -> 15.1px, 100% -> 25px
  const pixelMinSpacing = Math.max(2.5, 3 + spacingRatio * 22);

  // Curvature threshold for corner detection: 0% -> 0.55 rad (~31.5 deg), 70% -> ~0.33 rad (~19 deg), 100% -> 0.23 rad (~13 deg)
  const cornerCurvatureThreshold = Math.max(0.20, 0.55 - detailRatio * 0.32);

  // Minimum perimeter floor for general contours
  const minContourPerimeter = Math.max(7, 6 + suppressionRatio * 20);

  return {
    blurSigma,
    bilateralSigmaColor,
    bilateralSigmaSpace,
    blackhatThreshold,
    cannyLow,
    cannyHigh,
    adaptiveBlockSize,
    adaptiveC,
    rdpToleranceEpsilon,
    pixelMinSpacing,
    cornerCurvatureThreshold,
    minContourPerimeter,
    suppressionRatio,
    detailRatio,
    spacingRatio,
  };
}

export const DEFAULT_SETTINGS: ProcessingSettings = {
  detailPreservation: 70,
  backgroundSuppression: 75,
  minimumSpacing: 55,
  processingFocus: "anime",
  profile: "anime",
  difficulty: "medium",
  dotBudget: 240,
  contourSensitivity: 5,
  fineDetail: 7,
  minSpacing: 15,
  lineArtEnhancement: 4,
  pathComplexity: 6,
  labelSize: 9,
  showNumbers: true,
  dotSize: 2.6,
  printScale: 100,
  pathMode: "multi",
  closeContours: true,
};

export const PROCESSING_PROFILES: Record<ProcessingProfile, { label: string; badge: string; description: string }> = {
  anime: {
    label: "Anime & Manga",
    badge: "Anime",
    description: "Bilateral gradient smoothing with Black Hat morphology to isolate crisp character ink strokes.",
  },
  lineart: {
    label: "Clean Line Art",
    badge: "Line Art",
    description: "Binary centerline skeletonization to trace exact stroke middles without doubling contours.",
  },
  photo: {
    label: "Photograph",
    badge: "Photo",
    description: "Adaptive multi-scale edge filtering with texture noise suppression for realistic subjects.",
  },
  balanced: {
    label: "Balanced",
    badge: "Balanced",
    description: "General-purpose edge extraction and adaptive contour sampling for diverse illustrations.",
  },
};

export const DIFFICULTY_PRESETS: Record<Exclude<Difficulty, "custom">, { label: string; range: string; dots: number }> = {
  easy: { label: "Easy", range: "50–150", dots: 100 },
  medium: { label: "Medium", range: "150–350", dots: 240 },
  detailed: { label: "Detailed", range: "350–700", dots: 500 },
  extreme: { label: "Extreme detail", range: "700–2,000", dots: 1000 },
};

export function clampBudget(value: number): number {
  return Math.max(50, Math.min(2000, Math.round(value)));
}
