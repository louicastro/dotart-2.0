import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mapSettingsToPrecisionParams,
  validateSettings,
  type ProcessingSettings,
} from "../engine/types";
import { sampleAdaptiveDots, type Point } from "../engine/geometry";
import { rankContourCandidates, type RawContour } from "../engine/contours";

function mockContour(overrides: Partial<RawContour> = {}): RawContour {
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

describe("Precision Controls: Default Configuration", () => {
  it("enforces the four specified default values for anime precision", () => {
    expect(DEFAULT_SETTINGS.detailPreservation).toBe(70);
    expect(DEFAULT_SETTINGS.backgroundSuppression).toBe(75);
    expect(DEFAULT_SETTINGS.minimumSpacing).toBe(55);
    expect(DEFAULT_SETTINGS.processingFocus).toBe("anime");
    expect(DEFAULT_SETTINGS.profile).toBe("anime");
  });
});

describe("Precision Controls: Deterministic Parameter Mapping", () => {
  it("maps default 70% / 75% / 55% / anime to exact computer-vision parameters", () => {
    const params = mapSettingsToPrecisionParams(DEFAULT_SETTINGS);

    // Detail preservation = 70% (detailRatio = 0.70)
    // blurSigma = 0.85 - 0.70 * 0.45 = 0.535
    expect(params.blurSigma).toBeCloseTo(0.535, 3);
    // bilateralSigma = 30 + (1 - 0.70) * 40 = 42
    expect(params.bilateralSigmaColor).toBe(42);
    // RDP tolerance epsilon = 1.60 - 0.70 * 1.15 = 0.795 px
    expect(params.rdpToleranceEpsilon).toBeCloseTo(0.795, 3);
    // Corner curvature threshold = 0.55 - 0.70 * 0.32 = 0.326 rad
    expect(params.cornerCurvatureThreshold).toBeCloseTo(0.326, 3);
    // Black hat threshold = 36 - 0.70 * 20 = 22
    expect(params.blackhatThreshold).toBe(22);

    // Minimum dot spacing = 55% (spacingRatio = 0.55)
    // pixelMinSpacing = 3 + 0.55 * 22 = 15.1 px
    expect(params.pixelMinSpacing).toBeCloseTo(15.1, 1);

    // Background suppression = 75% (suppressionRatio = 0.75)
    // minContourPerimeter = 6 + 0.75 * 20 = 21 px
    expect(params.minContourPerimeter).toBe(21);
    expect(params.detailRatio).toBe(0.7);
    expect(params.suppressionRatio).toBe(0.75);
    expect(params.spacingRatio).toBe(0.55);
  });

  it("maps boundary values at 0% and 100% deterministically", () => {
    const minSettings = validateSettings({
      detailPreservation: 0,
      backgroundSuppression: 0,
      minimumSpacing: 0,
      processingFocus: "anime",
    });
    const minParams = mapSettingsToPrecisionParams(minSettings);

    expect(minParams.detailRatio).toBe(0);
    expect(minParams.suppressionRatio).toBe(0);
    expect(minParams.spacingRatio).toBe(0);
    expect(minParams.blurSigma).toBeCloseTo(0.85, 2);
    expect(minParams.rdpToleranceEpsilon).toBeCloseTo(1.60, 2);
    expect(minParams.pixelMinSpacing).toBeCloseTo(3.0, 1);
    expect(minParams.cornerCurvatureThreshold).toBeCloseTo(0.55, 2);
    expect(minParams.minContourPerimeter).toBe(7);

    const maxSettings = validateSettings({
      detailPreservation: 100,
      backgroundSuppression: 100,
      minimumSpacing: 100,
      processingFocus: "anime",
    });
    const maxParams = mapSettingsToPrecisionParams(maxSettings);

    expect(maxParams.detailRatio).toBe(1.0);
    expect(maxParams.suppressionRatio).toBe(1.0);
    expect(maxParams.spacingRatio).toBe(1.0);
    expect(maxParams.blurSigma).toBeCloseTo(0.40, 2);
    expect(maxParams.rdpToleranceEpsilon).toBeCloseTo(0.45, 2);
    expect(maxParams.pixelMinSpacing).toBeCloseTo(25.0, 1);
    expect(maxParams.cornerCurvatureThreshold).toBeCloseTo(0.23, 2);
    expect(maxParams.minContourPerimeter).toBe(26);
  });
});

describe("Precision Controls: Settings Validation & Clamping", () => {
  it("clamps out-of-range numerical settings to 0–100%", () => {
    const validated = validateSettings({
      detailPreservation: -25,
      backgroundSuppression: 150,
      minimumSpacing: 250,
    });

    expect(validated.detailPreservation).toBe(0);
    expect(validated.backgroundSuppression).toBe(100);
    expect(validated.minimumSpacing).toBe(100);
  });

  it("provides safe defaults when an empty partial object is passed", () => {
    const validated = validateSettings({});

    expect(validated.detailPreservation).toBe(70);
    expect(validated.backgroundSuppression).toBe(75);
    expect(validated.minimumSpacing).toBe(55);
    expect(validated.processingFocus).toBe("anime");
    expect(validated.profile).toBe("anime");
  });

  it("synchronizes backwards-compatible aliases bidirectionally", () => {
    const fromAliases = validateSettings({
      fineDetail: 8,
      minSpacing: 18,
      profile: "lineart",
    });

    expect(fromAliases.detailPreservation).toBe(80);
    expect(fromAliases.processingFocus).toBe("lineart");
    expect(fromAliases.profile).toBe("lineart");

    const fromPrimary = validateSettings({
      detailPreservation: 90,
      minimumSpacing: 50,
      processingFocus: "photo",
    });

    expect(fromPrimary.fineDetail).toBe(9);
    expect(fromPrimary.minSpacing).toBe(14); // 3 + 0.5 * 22 = 14
    expect(fromPrimary.profile).toBe("photo");
  });
});

describe("Precision Controls: Landmark Protection", () => {
  it("preserves open path endpoints and high-curvature corners against spacing elimination", () => {
    // Construct an open path with a sharp 90-degree corner and closely spaced points
    // (0,0) -> (10,0) -> (20,0) -> corner (20,10) -> (20,20)
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },   // very close to start (2px distance)
      { x: 20, y: 0 },  // corner point
      { x: 20, y: 2 },  // very close to corner (2px distance)
      { x: 20, y: 30 },
      { x: 20, y: 31 }, // very close to end (1px distance)
    ];

    // With a high minSpacing of 18px and corner detection enabled
    const sampled = sampleAdaptiveDots(points, 10, 18, 0.326, false);

    // Endpoints must always be protected
    expect(sampled[0]).toEqual({ x: 0, y: 0 });
    expect(sampled.at(-1)).toEqual({ x: 20, y: 31 });

    // Sharp corner at (20, 0) must be protected
    const hasCorner = sampled.some((p) => p.x === 20 && p.y === 0);
    expect(hasCorner).toBe(true);

    // Intermediate redundant close points like (2, 0) and (20, 2) should be filtered out
    const hasCrowdedInterior = sampled.some((p) => p.x === 2 && p.y === 0);
    expect(hasCrowdedInterior).toBe(false);
  });
});

describe("Precision Controls: Background Suppression & Facial Detail Retention", () => {
  it("protects fine anime facial features (down to 7px) while filtering background noise", () => {
    const highSuppressionSettings: ProcessingSettings = {
      ...DEFAULT_SETTINGS,
      backgroundSuppression: 90,
      detailPreservation: 80,
    };

    // Facial feature: 12px perimeter in central facial area
    const eyeContour = mockContour({
      x: 480,
      y: 350,
      width: 14,
      height: 8,
      perimeter: 16,
      kind: "facial",
    });

    // Background noise: 16px perimeter in outer peripheral area
    const backgroundTwig = mockContour({
      x: 30,
      y: 40,
      width: 8,
      height: 6,
      perimeter: 16,
      kind: "detail",
    });

    const ranked = rankContourCandidates([eyeContour, backgroundTwig], 1000, 1000, highSuppressionSettings);

    // Eye contour should be preserved and ranked high
    expect(ranked.some((c) => c.perimeter === 16 && c.kind === "facial")).toBe(true);

    // Background twig at peripheral position should have significantly lower score or be suppressed
    const eyeScore = ranked.find((c) => c.kind === "facial")?.score ?? 0;
    const bgScore = ranked.find((c) => c.kind === "detail")?.score ?? 0;
    expect(eyeScore).toBeGreaterThan(bgScore * 2);
  });

  it("prioritizes anime ink contours when processing focus is anime", () => {
    const eyelash = mockContour({
      x: 460,
      y: 320,
      width: 18,
      height: 6,
      perimeter: 28,
      kind: "facial",
    });

    const animeRanked = rankContourCandidates([eyelash], 1000, 1000, {
      ...DEFAULT_SETTINGS,
      processingFocus: "anime",
      profile: "anime",
    });

    const photoRanked = rankContourCandidates([{ ...eyelash }], 1000, 1000, {
      ...DEFAULT_SETTINGS,
      processingFocus: "photo",
      profile: "photo",
    });

    expect(animeRanked[0].score).toBeGreaterThan(photoRanked[0].score);
  });
});
