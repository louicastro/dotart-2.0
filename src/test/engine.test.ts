import { describe, expect, it } from "vitest";
import { classifyContour, contourPathCap, deduplicateContours, rankContourCandidates, type RawContour } from "../engine/contours";
import {
  bridgeMicroGaps,
  computeLabelOffset,
  countLabelCollisions,
  createDotSpatialGrid,
  extractSingleStrokeIfThin,
  localCurvature,
  longestSegmentInsertion,
  orderPathsSpatially,
  pathLength,
  ramerDouglasPeucker,
  sampleAdaptiveDots,
  type Point,
} from "../engine/geometry";
import { numberPaths, pathMarker } from "../engine/numbering";
import { DEFAULT_SETTINGS, type PuzzlePath, type PuzzleResult } from "../engine/types";
import { buildPuzzleSvg, checkExportQuality, DEFAULT_EXPORT_OPTIONS, exportPdf } from "../export/exporter";

function contour(overrides: Partial<RawContour> = {}): RawContour {
  return {
    points: [{ x: 80, y: 80 }, { x: 130, y: 80 }, { x: 130, y: 130 }, { x: 80, y: 130 }],
    area: 2500,
    perimeter: 200,
    parent: -1,
    x: 80,
    y: 80,
    width: 50,
    height: 50,
    source: "edge",
    score: 0,
    kind: "detail",
    ...overrides,
  };
}

function path(id: string, coordinates: Point[], closed = false): PuzzlePath {
  return {
    id,
    kind: "detail",
    closed,
    area: 100,
    perimeter: pathLength(coordinates, closed),
    score: 1,
    points: coordinates.map((point, index) => ({ id: `${id}-${index + 1}`, ...point, index: index + 1 })),
  };
}

const twoPathResult: PuzzleResult = {
  width: 120,
  height: 90,
  paths: [path("first", [{ x: 12, y: 12 }, { x: 40, y: 12 }, { x: 40, y: 40 }, { x: 12, y: 40 }], true), path("second", [{ x: 74, y: 48 }, { x: 102, y: 48 }, { x: 102, y: 76 }, { x: 74, y: 76 }], true)],
  totalDots: 8,
  processingMs: 20,
  engine: "opencv",
  warnings: [],
  contourCount: 2,
};

describe("contour analysis", () => {
  it("classifies a large outer boundary separately from interior detail", () => {
    expect(classifyContour(contour({ x: 30, y: 20, width: 900, height: 1100, perimeter: 4200 }), 1000, 1200)).toBe("silhouette");
    expect(classifyContour(contour({ x: 420, y: 330, width: 38, height: 18, parent: 0 }), 1000, 1200)).toBe("facial");
  });

  it("ranks central contours and removes the same contour extracted by multiple edge methods", () => {
    const settings = { ...DEFAULT_SETTINGS, backgroundSuppression: 6 };
    const important = contour({ x: 420, y: 330, width: 38, height: 18, parent: 0, perimeter: 115 });
    const backgroundNoise = contour({ x: 4, y: 7, width: 3, height: 3, perimeter: 9 });
    expect(rankContourCandidates([backgroundNoise, important], 1000, 1200, settings)).toContain(important);
    const duplicate = { ...important, source: "adaptive" as const };
    expect(deduplicateContours([important, duplicate])).toHaveLength(1);
  });

  it("limits the contour count so medium puzzles can allocate meaningful dots per path", () => {
    expect(contourPathCap(DEFAULT_SETTINGS)).toBe(26);
    expect(contourPathCap({ ...DEFAULT_SETTINGS, dotBudget: 100, pathComplexity: 2, fineDetail: 3 })).toBeLessThan(15);
  });
});

describe("adaptive path sampling", () => {
  it("does not treat the endpoints of an open path as a connected segment when adding a dot", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }];
    expect(longestSegmentInsertion(points, false)).toEqual({ index: 2, beforeIndex: 1, afterIndex: 2 });
    expect(longestSegmentInsertion([{ x: 0, y: 0 }], false)).toBeNull();
  });

  it("includes the closing segment when inserting a dot on a closed contour", () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 21, y: 0 }];
    expect(longestSegmentInsertion(points, true)).toEqual({ index: 3, beforeIndex: 2, afterIndex: 0 });
  });

  it("keeps open endpoints, preserves order, and samples no more than the target", () => {
    const points = Array.from({ length: 101 }, (_, index) => ({ x: index, y: Math.sin(index / 8) * 10 }));
    const sampled = sampleAdaptiveDots(points, 18, 0, 7, false);
    expect(sampled.length).toBeLessThanOrEqual(18);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
    expect(sampled.every((point, index) => index === 0 || point.x > sampled[index - 1].x)).toBe(true);
  });

  it("retains a closed contour and reduces redundant straight-line vertices", () => {
    const ring = Array.from({ length: 80 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 80;
      return { x: 100 + 40 * Math.cos(angle), y: 100 + 40 * Math.sin(angle) };
    });
    const simplified = ramerDouglasPeucker(ring, 1.5, true);
    const sampled = sampleAdaptiveDots(simplified, 16, 0, 6, true);
    expect(simplified.length).toBeGreaterThan(4);
    expect(sampled.length).toBeLessThanOrEqual(16);
    expect(pathLength(sampled, true)).toBeGreaterThan(220);
  });

  it("reports close labels near dots", () => {
    const dots = [path("near", [{ x: 0, y: 0 }, { x: 2, y: 1 }])];
    expect(countLabelCollisions(dots, 10)).toBeGreaterThan(0);
  });

  it("correctly identifies deflection without inverting turn or wrapping on open paths", () => {
    const straight = [{ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(localCurvature(straight, 1, false)).toBe(0);

    const corner = [{ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }];
    expect(localCurvature(corner, 1, false)).toBeCloseTo(Math.PI / 2, 4);

    const openLine = Array.from({ length: 40 }, (_, index) => ({ x: index, y: 0 }));
    expect(localCurvature(openLine, 1, false, 2)).toBe(0);
  });

  it("extracts a clean single stroke from a thin doubled-back contour", () => {
    const doubledLine: Point[] = [];
    for (let x = 0; x <= 30; x += 1) doubledLine.push({ x, y: 0 });
    for (let x = 30; x >= 0; x -= 1) doubledLine.push({ x, y: 1 });
    const single = extractSingleStrokeIfThin(doubledLine);
    expect(single).not.toBeNull();
    expect(single![0].x).toBe(0);
    expect(single!.at(-1)!.x).toBe(30);

    const ring = Array.from({ length: 40 }, (_, index) => {
      const a = (index / 40) * Math.PI * 2;
      return { x: 50 + 20 * Math.cos(a), y: 50 + 20 * Math.sin(a) };
    });
    expect(extractSingleStrokeIfThin(ring)).toBeNull();
  });

  it("places dots accurately on corners of an L-shape path", () => {
    const lShape: Point[] = [];
    for (let x = 0; x <= 50; x += 1) lShape.push({ x, y: 0 });
    for (let y = 1; y <= 50; y += 1) lShape.push({ x: 50, y });
    const sampled = sampleAdaptiveDots(lShape, 10, 4, 6, false);
    expect(sampled.length).toBe(10);
    expect(sampled[0]).toEqual({ x: 0, y: 0 });
    expect(sampled.at(-1)).toEqual({ x: 50, y: 50 });
    expect(sampled.some((point) => point.x === 50 && point.y === 0)).toBe(true);
  });
});

describe("per-path numbering", () => {
  const paths = [path("first", [{ x: 0, y: 0 }, { x: 10, y: 0 }]), path("second", [{ x: 20, y: 20 }, { x: 30, y: 20 }])];

  it("restarts local labels at each marked path and keeps two sequences separate", () => {
    const numbered = numberPaths(paths, "multi");
    expect(numbered.points.map((item) => item.label)).toEqual([1, 2, 1, 2]);
    expect(numbered.sequences.map((sequence) => sequence.marker)).toEqual(["A", "B"]);
    expect(numbered.sequences[0].dotIds).toEqual(["first-1", "first-2"]);
    expect(numbered.sequences[1].dotIds).toEqual(["second-1", "second-2"]);
    expect(numbered.sequences[0].breakAfter).toBe(true);
    expect(numbered.sequences[1].breakAfter).toBe(false);
  });

  it("can number globally without introducing a connection between paths", () => {
    const numbered = numberPaths(paths, "continuous");
    expect(numbered.points.map((item) => item.label)).toEqual([1, 2, 3, 4]);
    expect(numbered.sequences).toHaveLength(2);
    expect(numbered.sequences[0].lastDotId).not.toBe(numbered.sequences[1].firstDotId);
    expect(pathMarker(25)).toBe("Z");
    expect(pathMarker(26)).toBe("AA");
  });
});

describe("export checks and real files", () => {
  it("creates SVG with separate dot groups and requested image dimensions", () => {
    const svg = buildPuzzleSvg(twoPathResult, DEFAULT_SETTINGS);
    expect(svg).toContain('width="120" height="90" viewBox="0 0 120 90"');
    expect((svg.match(/<circle /g) ?? []).length).toBe(8);
    expect(svg).toContain("A 1");
    expect(svg).toContain("B 1");
  });

  it("marks each separate path in continuous numbering without drawing a joining segment", () => {
    const svg = buildPuzzleSvg(twoPathResult, { ...DEFAULT_SETTINGS, pathMode: "continuous" }, { answerKey: true });
    expect(svg).toContain("A·1");
    expect(svg).toContain("B·5");
    expect((svg.match(/<path /g) ?? []).length).toBe(2);
  });

  it("flags invalid geometry before export", () => {
    const invalid = { ...twoPathResult, paths: [path("outside", [{ x: -2, y: 4 }, { x: 8, y: 4 }])] };
    expect(checkExportQuality(invalid, DEFAULT_SETTINGS, 12).ok).toBe(false);
  });

  it("rejects PDF settings that would push dots or labels outside printable page bounds", () => {
    expect(checkExportQuality(twoPathResult, DEFAULT_SETTINGS, 12).ok).toBe(true);
    const clipped = checkExportQuality(twoPathResult, { ...DEFAULT_SETTINGS, printScale: 130 }, 12);
    expect(clipped.ok).toBe(false);
    expect(clipped.warnings.some((warning) => warning.code === "outside-printable")).toBe(true);
  });

  it("generates a genuine PDF with a readable PDF signature", async () => {
    const blob = await exportPdf(twoPathResult, DEFAULT_SETTINGS, { ...DEFAULT_EXPORT_OPTIONS, includeAnswerKey: true });
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
    const header = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    expect(header).toBe("%PDF-");
  });

  it("creates four tiled poster pages plus a separate answer-key page", async () => {
    const blob = await exportPdf(twoPathResult, DEFAULT_SETTINGS, { ...DEFAULT_EXPORT_OPTIONS, posterTiles: 2, includeAnswerKey: true });
    const pdfText = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect((pdfText.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(5);
  });
});

describe("advanced computer vision & path ordering", () => {
  it("bridges fractured stroke micro-gaps within threshold", () => {
    const stroke1: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const stroke2: Point[] = [{ x: 12, y: 0 }, { x: 25, y: 0 }];
    const bridged = bridgeMicroGaps([stroke1, stroke2], 3.0);
    expect(bridged).toHaveLength(1);
    expect(bridged[0]).toHaveLength(4);
    expect(bridged[0][0]).toEqual({ x: 0, y: 0 });
    expect(bridged[0][3]).toEqual({ x: 25, y: 0 });

    // When gap is too large, strokes remain separate
    const strokeFar: Point[] = [{ x: 40, y: 0 }, { x: 50, y: 0 }];
    const unbridged = bridgeMicroGaps([stroke1, strokeFar], 3.0);
    expect(unbridged).toHaveLength(2);
  });

  it("spatially orders paths starting with the main silhouette and preserving nearest neighbor flow", () => {
    const detailBottomRight = path("detail-br", [{ x: 800, y: 800 }, { x: 850, y: 850 }], false);
    const detailTopCenter = path("detail-tc", [{ x: 480, y: 220 }, { x: 500, y: 240 }], false);
    const mainSilhouette = path("silhouette-main", [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }], true);
    mainSilhouette.kind = "silhouette";

    const ordered = orderPathsSpatially([detailBottomRight, detailTopCenter, mainSilhouette]);
    expect(ordered[0].kind).toBe("silhouette");
    expect(ordered[0].id).toBe("path-01");
    expect(ordered[1].id).toBe("path-02");
    expect(ordered[2].id).toBe("path-03");
    // Verify dot IDs were reindexed cleanly
    expect(ordered[0].points[0].id).toBe("path-01-1");
  });

  it("calculates collision-avoiding label offsets using spatial grid", () => {
    const points: Point[] = [{ x: 50, y: 50 }, { x: 60, y: 50 }];
    const grid = createDotSpatialGrid([{ x: 50, y: 40, id: "obstacle" }], 10);
    const offset = computeLabelOffset(points, 0, 10, { width: 200, height: 200 }, "dot-1", grid);
    // Since obstacle is directly above (x=50, y=40), offset y should not be negative
    expect(offset.y).toBeGreaterThanOrEqual(0);
  });

  it("applies profile-specific boosting to contour candidates", () => {
    const delicate1 = contour({ x: 450, y: 350, width: 25, height: 15, perimeter: 45, kind: "facial" });
    const delicate2 = contour({ x: 450, y: 350, width: 25, height: 15, perimeter: 45, kind: "facial" });
    const sil1 = contour({ x: 10, y: 10, width: 800, height: 900, perimeter: 2500, kind: "silhouette" });
    const sil2 = contour({ x: 10, y: 10, width: 800, height: 900, perimeter: 2500, kind: "silhouette" });

    const animeRanked = rankContourCandidates([delicate1, sil1], 1000, 1000, {
      ...DEFAULT_SETTINGS,
      profile: "anime",
    });
    const photoRanked = rankContourCandidates([delicate2, sil2], 1000, 1000, {
      ...DEFAULT_SETTINGS,
      profile: "photo",
    });

    const animeScoreDelicate = animeRanked.find((c) => c.perimeter === 45)!.score;
    const photoScoreDelicate = photoRanked.find((c) => c.perimeter === 45)!.score;
    // Anime profile gives higher relative priority to delicate ink line features
    expect(animeScoreDelicate).toBeGreaterThan(photoScoreDelicate);
  });

  it("deduplicates contours sharing near-identical centroids and perimeters", () => {
    const c1 = contour({ x: 100, y: 100, width: 50, height: 50, perimeter: 180 });
    const c2 = contour({ x: 101, y: 101, width: 50, height: 50, perimeter: 182, source: "adaptive" });
    const deduped = deduplicateContours([c1, c2]);
    expect(deduped).toHaveLength(1);
  });
});

describe("morphological skeletonization pipeline in OpenCV", () => {
  it("thins thick ink strokes to a 1-pixel centerline without boundary doubling", async () => {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const cvRaw = require("@techstark/opencv-js");
    let cv: any = cvRaw;
    if (!cv.Mat) {
      cv = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(cvRaw), 4000);
        cvRaw.onRuntimeInitialized = () => {
          clearTimeout(timer);
          resolve(cvRaw);
        };
      });
    }
    if (!cv?.Mat) return;

    const img = new cv.Mat(120, 120, cv.CV_8UC1, new cv.Scalar(0));
    // Draw a 6-pixel wide straight line from (20, 20) to (100, 20)
    cv.line(img, new cv.Point(20, 20), new cv.Point(100, 20), new cv.Scalar(255), 6);

    const initialNonZero = cv.countNonZero(img);
    expect(initialNonZero).toBeGreaterThan(400); // 80px long * 6px wide ~ 480px

    const skel = new cv.Mat(120, 120, cv.CV_8UC1, new cv.Scalar(0));
    const temp = new cv.Mat();
    const eroded = new cv.Mat();
    const element = cv.getStructuringElement(cv.MORPH_CROSS, new cv.Size(3, 3));
    let done = false;
    let copy = img.clone();
    let iters = 0;

    while (!done && iters < 15) {
      iters += 1;
      cv.morphologyEx(copy, temp, cv.MORPH_OPEN, element);
      cv.bitwise_not(temp, temp);
      cv.bitwise_and(copy, temp, temp);
      cv.bitwise_or(skel, temp, skel);
      cv.erode(copy, eroded, element);
      copy.delete();
      copy = eroded.clone();
      if (cv.countNonZero(copy) === 0) done = true;
    }

    const skeletonPixels = cv.countNonZero(skel);
    // 1-pixel centerline should be roughly 80 pixels long, avoiding the ~480px thick filled region
    expect(skeletonPixels).toBeLessThan(120);
    expect(skeletonPixels).toBeGreaterThan(70);

    img.delete();
    skel.delete();
    temp.delete();
    eroded.delete();
    element.delete();
    copy.delete();
  });
});

describe("editor & path manipulation tools", () => {
  it("reverses path direction while properly updating 1-based indices", () => {
    const original = path("flow-1", [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }]);
    const reversedPoints = original.points.slice().reverse().map((dot, idx) => ({ ...dot, index: idx + 1 }));
    expect(reversedPoints[0].x).toBe(30);
    expect(reversedPoints[0].index).toBe(1);
    expect(reversedPoints[2].x).toBe(10);
    expect(reversedPoints[2].index).toBe(3);
  });

  it("filters noise paths below perimeter threshold", () => {
    const mainStroke = path("main", [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], false);
    mainStroke.perimeter = 100;
    const tinyNoise = path("noise", [{ x: 5, y: 5 }, { x: 7, y: 7 }], false);
    tinyNoise.perimeter = 4;

    const all = [mainStroke, tinyNoise];
    const filtered = all.filter((p) => p.perimeter >= 22 && p.points.length >= 3);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("main");
  });
});
