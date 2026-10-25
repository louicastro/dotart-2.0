import type { PathMode, PuzzlePath } from "./types";

export interface NumberedPoint {
  pathId: string;
  pathIndex: number;
  dotId: string;
  dotIndex: number;
  label: number;
  isPathStart: boolean;
}

export interface PathSequence {
  pathId: string;
  marker: string;
  closed: boolean;
  firstDotId: string;
  lastDotId: string;
  dotIds: string[];
  breakAfter: boolean;
}

export function pathMarker(index: number): string {
  let value = index + 1;
  let marker = "";
  while (value > 0) {
    value -= 1;
    marker = String.fromCharCode(65 + (value % 26)) + marker;
    value = Math.floor(value / 26);
  }
  return marker;
}

/** The returned list is grouped by original contour; it never makes a cross-path edge. */
export function numberPaths(paths: PuzzlePath[], mode: PathMode): { points: NumberedPoint[]; sequences: PathSequence[] } {
  let global = 1;
  const points: NumberedPoint[] = [];
  const sequences: PathSequence[] = [];
  paths.forEach((path, pathIndex) => {
    const ordered = path.points.slice().sort((a, b) => a.index - b.index);
    const marker = pathMarker(pathIndex);
    const ids: string[] = [];
    ordered.forEach((dot, index) => {
      points.push({
        pathId: path.id,
        pathIndex,
        dotId: dot.id,
        dotIndex: index + 1,
        label: mode === "continuous" ? global++ : index + 1,
        isPathStart: index === 0,
      });
      ids.push(dot.id);
    });
    if (ids.length) {
      sequences.push({
        pathId: path.id,
        marker,
        closed: path.closed,
        firstDotId: ids[0],
        lastDotId: ids[ids.length - 1],
        dotIds: ids,
        breakAfter: pathIndex < paths.length - 1,
      });
    }
  });
  return { points, sequences };
}
