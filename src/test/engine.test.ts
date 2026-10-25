import { describe, expect, it } from "vitest";
import { classifyContour, contourPathCap, deduplicateContours, rankContourCandidates, type RawContour } from "../engine/contours";
import { countLabelCollisions, extractSingleStrokeIfThin, localCurvature, longestSegmentInsertion, pathLength, ramerDouglasPeucker, sampleAdaptiveDots, type Point } from "../engine/geometry";
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
