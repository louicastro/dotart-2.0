import type { ContourKind, ProcessingSettings } from "./types";
import type { Point } from "./geometry";

export interface RawContour {
  points: Point[];
  area: number;
  perimeter: number;
  parent: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: "edge" | "adaptive";
  score: number;
  kind: ContourKind;
}

export function contourPathCap(settings: ProcessingSettings): number {
  const targetDotsPerPath = Math.max(6, 14 - settings.pathComplexity * 0.65 - settings.fineDetail * 0.2);
  return Math.max(6, Math.min(350, Math.floor(settings.dotBudget / targetDotsPerPath)));
}

export function classifyContour(contour: RawContour, imageWidth: number, imageHeight: number): ContourKind {
  const cx = (contour.x + contour.width / 2) / imageWidth;
  const cy = (contour.y + contour.height / 2) / imageHeight;
  const relativeArea = (contour.width * contour.height) / (imageWidth * imageHeight);
  const elongated = Math.max(contour.width, contour.height) / Math.max(1, Math.min(contour.width, contour.height));

  // 1. Large silhouette boundary (outer contour of entire subject)
  if (contour.parent < 0 && relativeArea > 0.08 && contour.perimeter > (imageWidth + imageHeight) * 0.14) {
    return "silhouette";
  }
  // 2. Facial features (central face area, delicate to medium features like eyes, nose, mouth)
  if (cy > 0.16 && cy < 0.60 && cx > 0.22 && cx < 0.78 && (contour.perimeter < 350 || relativeArea < 0.08)) {
    return "facial";
  }
  // 3. Hair (upper/middle elongated strands)
  if (cy < 0.68 && elongated > 1.5 && contour.perimeter > 20) {
    return "hair";
  }
  // 4. Large silhouette fallback
  if (contour.parent < 0 && relativeArea > 0.025 && contour.perimeter > (imageWidth + imageHeight) * 0.14) {
    return "silhouette";
  }
  // 5. Clothing (lower body)
  if (cy > 0.50 && contour.perimeter > 30) {
    return relativeArea > 0.035 ? "clothing" : "detail";
  }
  // 6. Peripheral objects
  if (cx < 0.15 || cx > 0.85 || (contour.parent >= 0 && relativeArea > 0.045)) {
    return "object";
  }
  return "detail";
}

export function rankContourCandidates(
  contours: RawContour[],
  width: number,
  height: number,
  settings: ProcessingSettings,
): RawContour[] {
  const diagonal = Math.hypot(width, height);
  const frameArea = width * height;
  const maxSuppression = settings.backgroundSuppression / 10;
  const scored: RawContour[] = [];
  for (const contour of contours) {
    // Suppress canvas frame borders (lines along the extreme edges of the image)
    if (contour.x <= 3 && contour.y <= 3 && contour.width >= width - 6 && contour.height >= height - 6) continue;
    if ((contour.x <= 2 || contour.x + contour.width >= width - 2) && contour.height >= height * 0.82) continue;
    if ((contour.y <= 2 || contour.y + contour.height >= height - 2) && contour.width >= width * 0.82) continue;

    const relativeArea = (contour.width * contour.height) / frameArea;
    const cx = (contour.x + contour.width / 2) / width;
    const cy = (contour.y + contour.height / 2) / height;
    const centrality = Math.max(0, 1 - Math.hypot((cx - 0.5) * 1.5, (cy - 0.46) * 1.3));

    contour.kind = classifyContour(contour, width, height);

    // Minimum perimeter threshold: delicate facial features are allowed down to 7px,
    // while distant background noise is suppressed
    const minLength = contour.kind === "facial" ? 7 : Math.max(10, 10 + settings.backgroundSuppression * 2.2);
    if (contour.perimeter < minLength) continue;
    if (relativeArea < 0.000012 + maxSuppression * 0.000025 && centrality < 0.62 && contour.kind !== "facial") continue;
    if (relativeArea > 0.94 && contour.parent < 0) continue;

    const lineArtBoost = settings.lineArtEnhancement / 10;
    const detailBoost = settings.fineDetail / 10;
    const parentBoost = contour.parent >= 0 ? 1.15 : 1;
    const sourceBoost = contour.source === "edge" ? 1.25 : 0.88;
    const sizeSignal = Math.min(12, (Math.sqrt(Math.max(0, contour.area)) / Math.max(1, diagonal)) * 30);

    const semanticBoost = contour.kind === "facial" ? 2.5 + detailBoost * 0.7
      : contour.kind === "hair" ? 1.8 + lineArtBoost * 0.5
      : contour.kind === "silhouette" ? 1.5
      : contour.kind === "clothing" ? 1.35
      : 1;

    const peripheralPenalty = (cx < 0.035 || cx > 0.965 || cy < 0.025 || cy > 0.975) ? 0.68 : 1;
    const backgroundPenalty = relativeArea < 0.0008 && centrality < 0.45 ? 1 - maxSuppression * 0.55 : 1;

    contour.score = (Math.sqrt(contour.perimeter) * 2.2 + sizeSignal + centrality * 10)
      * parentBoost * sourceBoost * semanticBoost * peripheralPenalty * backgroundPenalty
      * (1 + lineArtBoost * 0.1);
    scored.push(contour);
  }
  return scored.sort((a, b) => b.score - a.score);
}

function rectangleOverlap(a: RawContour, b: RawContour): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export function deduplicateContours(contours: RawContour[]): RawContour[] {
  const accepted: RawContour[] = [];
  for (const contour of contours) {
    const duplicate = accepted.some((previous) => rectangleOverlap(previous, contour) > 0.91
      && Math.abs(previous.perimeter - contour.perimeter) / Math.max(previous.perimeter, contour.perimeter) < 0.18);
    if (!duplicate) accepted.push(contour);
  }
  return accepted;
}
