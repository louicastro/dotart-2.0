export type Difficulty = "easy" | "medium" | "detailed" | "extreme" | "custom";
export type PathMode = "multi" | "continuous";
export type ProcessingProfile = "anime" | "lineart" | "photo" | "balanced";
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
  profile: ProcessingProfile;
  difficulty: Difficulty;
  dotBudget: number;
  contourSensitivity: number;
  fineDetail: number;
  minSpacing: number;
  backgroundSuppression: number;
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

export const DEFAULT_SETTINGS: ProcessingSettings = {
  profile: "anime",
  difficulty: "medium",
  dotBudget: 240,
  contourSensitivity: 5,
  fineDetail: 6,
  minSpacing: 10,
  backgroundSuppression: 5,
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
