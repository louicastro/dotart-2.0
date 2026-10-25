import type { Dot, PuzzlePath } from "./types";

export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(points: Point[], closed = false): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  if (closed) total += distance(points[points.length - 1], points[0]);
  return total;
}

export interface SegmentInsertion {
  index: number;
  beforeIndex: number;
  afterIndex: number;
}

export function longestSegmentInsertion(points: Point[], closed = false): SegmentInsertion | null {
  if (points.length < 2) return null;
  const segmentCount = closed ? points.length : points.length - 1;
  let longest = -1;
  let best: SegmentInsertion | null = null;
  for (let beforeIndex = 0; beforeIndex < segmentCount; beforeIndex += 1) {
    const afterIndex = closed ? (beforeIndex + 1) % points.length : beforeIndex + 1;
    const segmentLength = distance(points[beforeIndex], points[afterIndex]);
    if (segmentLength > longest) {
      longest = segmentLength;
      best = { index: afterIndex === 0 ? points.length : afterIndex, beforeIndex, afterIndex };
    }
  }
  return best;
}

function pointLineDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = tolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = pointLineDistance(points[i], points[first], points[last]);
      if (d > farthest) {
        farthest = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

export function ramerDouglasPeucker(points: Point[], tolerance: number, closed = false): Point[] {
  if (points.length <= (closed ? 4 : 2)) return points.slice();
  if (!closed) return simplifyOpen(points, Math.max(0, tolerance));
  const loop = points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y
    ? points.slice(0, -1)
    : points;
  if (loop.length <= 4) return loop.slice();
  let split = 1;
  let maxDistance = 0;
  for (let i = 1; i < loop.length; i += 1) {
    const d = distance(loop[0], loop[i]);
    if (d > maxDistance) {
      maxDistance = d;
      split = i;
    }
  }
  const firstHalf = loop.slice(0, split + 1);
  const secondHalf = [...loop.slice(split), loop[0]];
  const a = simplifyOpen(firstHalf, Math.max(0, tolerance));
  const b = simplifyOpen(secondHalf, Math.max(0, tolerance));
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Detects if an open line-art stroke was traced as a doubled-back 1-2px loop by OpenCV findContours.
 * If so, extracts the clean single stroke from endpoint to endpoint along the centerline.
 */
export function extractSingleStrokeIfThin(pts: Point[]): Point[] | null {
  const n = pts.length;
  if (n < 12) return null;

  const k = Math.max(2, Math.min(6, Math.floor(n / 25)));
  function deflection(i: number): number {
    const prev = pts[(i - k + n) % n];
    const curr = pts[i];
    const next = pts[(i + k) % n];
    const inA = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const outA = Math.atan2(next.y - curr.y, next.x - curr.x);
    let t = Math.abs(outA - inA);
    if (t > Math.PI) t = Math.PI * 2 - t;
    return t;
  }

  // Find turnaround candidates where deflection > 2.0 rad (~115 deg)
  const turnCandidates: Array<{ i: number; d: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const d = deflection(i);
    if (d > 2.0) turnCandidates.push({ i, d });
  }
  if (turnCandidates.length < 2) return null;

  // Group nearby indices into clusters
  const clusters: Array<Array<{ i: number; d: number }>> = [];
  let currentCluster = [turnCandidates[0]];
  for (let c = 1; c < turnCandidates.length; c += 1) {
    if (turnCandidates[c].i - turnCandidates[c - 1].i <= k * 2) {
      currentCluster.push(turnCandidates[c]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [turnCandidates[c]];
    }
  }
  clusters.push(currentCluster);

  // Check wrap-around
  if (clusters.length > 1) {
    const first = clusters[0][0].i;
    const last = clusters[clusters.length - 1].at(-1)!.i;
    if (first + n - last <= k * 2) {
      clusters[0].push(...clusters.pop()!);
    }
  }

  // Exactly two turnaround tips identify a single stroke doubled back
  if (clusters.length !== 2) return null;

  const peak1 = clusters[0].reduce((best, cur) => (cur.d > best.d ? cur : best)).i;
  const peak2 = clusters[1].reduce((best, cur) => (cur.d > best.d ? cur : best)).i;
  const idx1 = Math.min(peak1, peak2);
  const idx2 = Math.max(peak1, peak2);
  const len1 = idx2 - idx1;
  const len2 = n - len1;
  if (len1 < n * 0.2 || len2 < n * 0.2) return null;

  // Centerline averaging between forward and return paths ensures dots sit
  // precisely in the center of the ink stroke rather than hugging one side
  const stroke: Point[] = [];
  for (let s = 0; s <= len1; s += 1) {
    const f = idx1 + s;
    const r = (idx1 - Math.round((s / len1) * len2) + n) % n;
    stroke.push({
      x: (pts[f].x + pts[r].x) / 2,
      y: (pts[f].y + pts[r].y) / 2,
    });
  }
  return stroke;
}

export function localCurvature(points: Point[], index: number, closed: boolean, step = 1): number {
  const count = points.length;
  if (!closed && (index === 0 || index === count - 1)) return Math.PI;
  if (count < 3) return 0;
  const k = Math.max(1, Math.min(step, Math.floor((count - 1) / 2)));
  const prevIdx = closed ? (index - k + count) % count : Math.max(0, index - k);
  const nextIdx = closed ? (index + k) % count : Math.min(count - 1, index + k);
  const previous = points[prevIdx];
  const current = points[index];
  const next = points[nextIdx];
  const inAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
  const outAngle = Math.atan2(next.y - current.y, next.x - current.x);
  let turn = Math.abs(outAngle - inAngle);
  if (turn > Math.PI) turn = Math.PI * 2 - turn;
  return turn;
}

function nearestIndexAtDistance(cumulative: number[], target: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] < target) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return 0;
  return Math.abs(cumulative[low] - target) < Math.abs(cumulative[low - 1] - target) ? low : low - 1;
}

/**
 * Samples a contour in its original order. Uniform arc-length seeds preserve the overall
 * silhouette while high-curvature vertices get first claim on spare budget.
 */
export function sampleAdaptiveDots(
  rawPoints: Point[],
  targetCount: number,
  minSpacing: number,
  fineDetail: number,
  closed: boolean,
  cornerThresholdOverride?: number,
): Point[] {
  const points: Point[] = [];
  for (const point of rawPoints) {
    if (!points.length || distance(points[points.length - 1], point) > 0.01) points.push(point);
  }
  if (closed && points.length > 2 && distance(points[0], points[points.length - 1]) < 0.01) points.pop();
  const minimum = closed ? 4 : 2;
  if (points.length <= minimum) return points.slice();

  const total = pathLength(points, closed);
  const target = Math.max(minimum, Math.min(points.length, Math.round(targetCount)));
  const cumulative = new Array<number>(points.length);
  cumulative[0] = 0;
  for (let i = 1; i < points.length; i += 1) cumulative[i] = cumulative[i - 1] + distance(points[i - 1], points[i]);

  const step = Math.max(1, Math.min(6, Math.floor(points.length / 25)));

  const uniform = new Set<number>();
  const seedCount = closed ? target : Math.max(2, target);
  for (let i = 0; i < seedCount; i += 1) {
    const along = closed ? (i / seedCount) * total : (i / Math.max(1, seedCount - 1)) * total;
    uniform.add(nearestIndexAtDistance(cumulative, along));
  }
  if (!closed) {
    uniform.add(0);
    uniform.add(points.length - 1);
  }

  const corners: Array<{ index: number; score: number }> = [];
  const cornerThreshold = typeof cornerThresholdOverride === "number"
    ? cornerThresholdOverride
    : 0.30 + (10 - Math.max(0, Math.min(10, fineDetail))) * 0.05;

  for (let i = closed ? 0 : 1; i < (closed ? points.length : points.length - 1); i += 1) {
    const score = localCurvature(points, i, closed, step);
    if (score >= cornerThreshold) {
      const prevScore = localCurvature(points, closed ? (i - 1 + points.length) % points.length : Math.max(0, i - 1), closed, step);
      const nextScore = localCurvature(points, closed ? (i + 1) % points.length : Math.min(points.length - 1, i + 1), closed, step);
      if (score >= prevScore && score >= nextScore) {
        corners.push({ index: i, score });
      }
    }
  }
  corners.sort((a, b) => b.score - a.score);

  const candidates = new Set(uniform);
  const cornerLimit = Math.max(0, Math.floor(target * (0.35 + (fineDetail / 10) * 0.45)));
  for (const corner of corners.slice(0, cornerLimit)) candidates.add(corner.index);

  const importance = (index: number) => {
    const curvature = localCurvature(points, index, closed, step);
    return curvature * 2.0 + (uniform.has(index) ? 0.35 : 0) + (!closed && (index === 0 || index === points.length - 1) ? 100 : 0);
  };
  const chosen = Array.from(candidates).sort((a, b) => importance(b) - importance(a));
  const spacing = Math.max(0, minSpacing);
  const selected: number[] = [];
  for (const index of chosen) {
    if (selected.length >= target) break;
    const isProtectedLandmark = (!closed && (index === 0 || index === points.length - 1))
      || (localCurvature(points, index, closed, step) > 1.15);
    const farEnough = selected.every((existing) => {
      const direct = distance(points[index], points[existing]);
      const wrap = closed ? Math.min(direct, Math.max(0, total - Math.abs(cumulative[index] - cumulative[existing]))) : direct;
      return wrap >= spacing || isProtectedLandmark;
    });
    if (farEnough || selected.length < minimum) selected.push(index);
  }

  // Fill unused capacity by repeatedly bisecting the longest remaining contour interval.
  while (selected.length < target) {
    const sorted = selected.slice().sort((a, b) => a - b);
    let bestIndex = -1;
    let bestGap = 0;
    const end = closed ? sorted.length : Math.max(0, sorted.length - 1);
    for (let i = 0; i < end; i += 1) {
      const left = sorted[i];
      const right = i === sorted.length - 1 ? sorted[0] : sorted[i + 1];
      let gap = Math.abs(cumulative[right] - cumulative[left]);
      if (i === sorted.length - 1) gap = total - cumulative[left] + cumulative[right];
      if (gap > bestGap) {
        bestGap = gap;
        bestIndex = nearestIndexAtDistance(cumulative, cumulative[left] + gap / 2);
      }
    }
    if (!closed && sorted.length === 1) bestIndex = nearestIndexAtDistance(cumulative, total / 2);
    if (bestIndex < 0 || selected.includes(bestIndex) || bestGap <= spacing * 0.95) break;
    selected.push(bestIndex);
  }

  if (!closed) {
    selected.push(0, points.length - 1);
  }
  const unique = Array.from(new Set(selected)).sort((a, b) => a - b);
  return unique.map((index) => points[index]);
}

export function createDots(pathId: string, points: Point[]): Dot[] {
  return points.map((point, index) => ({ id: `${pathId}-${index + 1}`, x: point.x, y: point.y, index: index + 1 }));
}

export function countLabelCollisions(paths: Array<{ points: Dot[] }>, labelSize: number): number {
  const dots = paths.flatMap((path) => path.points);
  const radius = Math.max(8, labelSize * 1.35);
  let collisions = 0;
  for (let i = 0; i < dots.length; i += 1) {
    for (let j = i + 1; j < dots.length; j += 1) {
      if (Math.abs(dots[i].x - dots[j].x) > radius * 2 || Math.abs(dots[i].y - dots[j].y) > radius * 2) continue;
      if (distance(dots[i], dots[j]) < radius) collisions += 1;
    }
  }
  return collisions;
}

/**
 * Connects micro-fractured open stroke segments whose endpoints are within a small distance
 * without creating self-intersections or false joins.
 */
export function bridgeMicroGaps(strokes: Point[][], maxGap = 5): Point[][] {
  if (strokes.length <= 1) return strokes;
  const pool = strokes.map((s) => s.slice());
  let mergedAny = true;

  while (mergedAny) {
    mergedAny = false;
    outerLoop:
    for (let i = 0; i < pool.length; i += 1) {
      const s1 = pool[i];
      if (s1.length < 2) continue;
      const end1 = s1[s1.length - 1];
      const start1 = s1[0];

      for (let j = i + 1; j < pool.length; j += 1) {
        const s2 = pool[j];
        if (s2.length < 2) continue;
        const start2 = s2[0];
        const end2 = s2[s2.length - 1];

        // End of s1 to start of s2
        if (distance(end1, start2) <= maxGap) {
          pool[i] = s1.concat(s2);
          pool.splice(j, 1);
          mergedAny = true;
          break outerLoop;
        }
        // End of s1 to end of s2 (reversed)
        if (distance(end1, end2) <= maxGap) {
          pool[i] = s1.concat(s2.slice().reverse());
          pool.splice(j, 1);
          mergedAny = true;
          break outerLoop;
        }
        // Start of s1 to end of s2
        if (distance(start1, end2) <= maxGap) {
          pool[i] = s2.concat(s1);
          pool.splice(j, 1);
          mergedAny = true;
          break outerLoop;
        }
        // Start of s1 to start of s2 (reversed)
        if (distance(start1, start2) <= maxGap) {
          pool[i] = s2.slice().reverse().concat(s1);
          pool.splice(j, 1);
          mergedAny = true;
          break outerLoop;
        }
      }
    }
  }

  return pool;
}

/**
 * Orders puzzle paths in a spatially coherent sequence (starting with the main silhouette
 * or largest feature, then visiting nearest adjacent paths) to ensure natural eye flow.
 */
export function orderPathsSpatially(paths: PuzzlePath[]): PuzzlePath[] {
  if (paths.length <= 1) return paths;

  let startIndex = paths.findIndex((p) => p.kind === "silhouette");
  if (startIndex < 0) {
    startIndex = 0;
    let maxArea = -1;
    paths.forEach((p, idx) => {
      if (p.perimeter > maxArea) {
        maxArea = p.perimeter;
        startIndex = idx;
      }
    });
  }

  const unvisited = paths.slice();
  const [first] = unvisited.splice(startIndex, 1);
  const ordered: PuzzlePath[] = [first];

  const getCentroid = (p: PuzzlePath): Point => {
    if (!p.points.length) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const pt of p.points) {
      sx += pt.x;
      sy += pt.y;
    }
    return { x: sx / p.points.length, y: sy / p.points.length };
  };

  while (unvisited.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastPoint = last.points[last.points.length - 1] ?? getCentroid(last);
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < unvisited.length; i += 1) {
      const cand = unvisited[i];
      const candStart = cand.points[0] ?? getCentroid(cand);
      const candEnd = cand.points[cand.points.length - 1] ?? candStart;
      const d = Math.min(
        distance(lastPoint, candStart),
        distance(lastPoint, candEnd),
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const [nextPath] = unvisited.splice(bestIdx, 1);
    ordered.push(nextPath);
  }

  return ordered.map((path, idx) => {
    const id = `path-${String(idx + 1).padStart(2, "0")}`;
    return {
      ...path,
      id,
      points: path.points.map((dot, dIdx) => ({
        ...dot,
        id: `${id}-${dIdx + 1}`,
        index: dIdx + 1,
      })),
    };
  });
}

export interface DotSpatialGrid {
  cellSize: number;
  cells: Map<string, Array<{ x: number; y: number; id: string }>>;
}

export function createDotSpatialGrid(
  dots: Array<{ x: number; y: number; id: string }>,
  labelSize: number,
): DotSpatialGrid {
  const cellSize = Math.max(8, labelSize * 1.4);
  const cells = new Map<string, Array<{ x: number; y: number; id: string }>>();
  for (const dot of dots) {
    const key = `${Math.floor(dot.x / cellSize)}:${Math.floor(dot.y / cellSize)}`;
    const list = cells.get(key);
    if (list) list.push(dot);
    else cells.set(key, [dot]);
  }
  return { cellSize, cells };
}

export function dotsNearGrid(
  grid: DotSpatialGrid,
  x: number,
  y: number,
  radius: number,
): Array<{ x: number; y: number; id: string }> {
  const result: Array<{ x: number; y: number; id: string }> = [];
  const minX = Math.floor((x - radius) / grid.cellSize);
  const maxX = Math.floor((x + radius) / grid.cellSize);
  const minY = Math.floor((y - radius) / grid.cellSize);
  const maxY = Math.floor((y + radius) / grid.cellSize);
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      const cell = grid.cells.get(`${cellX}:${cellY}`);
      if (cell) result.push(...cell);
    }
  }
  return result;
}

export function computeLabelOffset(
  points: Point[],
  pointIndex: number,
  labelSize: number,
  bounds: { width: number; height: number },
  currentId?: string,
  grid?: DotSpatialGrid,
): { x: number; y: number } {
  const current = points[pointIndex];
  const previous = points[(pointIndex - 1 + points.length) % points.length];
  const next = points[(pointIndex + 1) % points.length];
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const normalX = dy / magnitude;
  const normalY = -dx / magnitude;
  const candidates = [
    { x: normalX, y: normalY },
    { x: -normalX, y: -normalY },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: normalX + 0.7, y: normalY - 0.7 },
    { x: normalX - 0.7, y: normalY + 0.7 },
  ];
  const step = labelSize + 5;
  const clearanceRadius = Math.max(8, labelSize * 1.4);
  let best = candidates[0];
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const length = Math.hypot(candidate.x, candidate.y) || 1;
    const x = current.x + (candidate.x / length) * step;
    const y = current.y + (candidate.y / length) * step;
    const pageMargin = Math.min(x, y, bounds.width - x, bounds.height - y);
    let nearbyDotPenalty = 0;
    if (grid) {
      for (const otherDot of dotsNearGrid(grid, x, y, clearanceRadius)) {
        if (otherDot.id === currentId) continue;
        const separation = Math.hypot(otherDot.x - x, otherDot.y - y);
        if (separation < clearanceRadius) {
          nearbyDotPenalty += (clearanceRadius - separation) / clearanceRadius;
        }
      }
    }
    const edgePadding = labelSize * 0.55;
    const edgePenalty = Math.max(0, edgePadding - pageMargin) * 8;
    const score = nearbyDotPenalty * 100 + edgePenalty - Math.min(pageMargin, clearanceRadius * 4) * 0.01;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  const norm = Math.hypot(best.x, best.y) || 1;
  return { x: (best.x / norm) * step, y: (best.y / norm) * step };
}
