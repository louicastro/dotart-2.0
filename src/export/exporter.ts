import { jsPDF } from "jspdf";
import { computeLabelOffset, countLabelCollisions, createDotSpatialGrid, type DotSpatialGrid } from "../engine/geometry";
import { numberPaths, pathMarker } from "../engine/numbering";
import type { ProcessingSettings, PuzzlePath, PuzzleResult, PuzzleWarning } from "../engine/types";

export type PaperSize = "A4" | "A3" | "custom";

export interface ExportOptions {
  paperSize: PaperSize;
  orientation: "portrait" | "landscape";
  customWidthMm: number;
  customHeightMm: number;
  marginMm: number;
  posterTiles: 1 | 2 | 3;
  includeReference: boolean;
  includeAnswerKey: boolean;
  pngWidth: number;
  transparentPng: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  paperSize: "A4",
  orientation: "portrait",
  customWidthMm: 210,
  customHeightMm: 297,
  marginMm: 12,
  posterTiles: 1,
  includeReference: false,
  includeAnswerKey: false,
  pngWidth: 3000,
  transparentPng: false,
};

export interface ExportCheck {
  ok: boolean;
  warnings: PuzzleWarning[];
}

function createDotGrid(result: PuzzleResult, labelSize: number): DotSpatialGrid {
  const allDots = result.paths.flatMap((path) => path.points);
  return createDotSpatialGrid(allDots, labelSize);
}

function exceedsPrintableBounds(result: PuzzleResult, settings: ProcessingSettings, options: ExportOptions, tiles: number): boolean {
  const [pageW, pageH] = paperDimensions(options);
  const margin = options.marginMm;
  const usableW = Math.max(20, pageW - 2 * margin);
  const usableH = Math.max(20, pageH - 2 * margin);
  const totalW = usableW * tiles;
  const totalH = usableH * tiles;
  const safeInset = Math.max(2.5, settings.showNumbers ? settings.labelSize * 0.85 : settings.dotSize * 0.45);
  const fitW = Math.max(1, totalW - 2 * safeInset);
  const fitH = Math.max(1, totalH - 2 * safeInset);
  const scale = Math.min(fitW / result.width, fitH / result.height) * settings.printScale / 100;
  const offsetX = safeInset + (fitW - result.width * scale) / 2;
  const offsetY = safeInset + (fitH - result.height * scale) / 2;
  if (offsetX < -0.01 || offsetY < -0.01 || offsetX + result.width * scale > totalW + 0.01 || offsetY + result.height * scale > totalH + 0.01) return true;
  const textPadding = settings.showNumbers ? Math.max(0.8, settings.labelSize * 0.33) : 0;
  const labelGrid = settings.showNumbers ? createDotGrid(result, settings.labelSize) : undefined;
  for (const path of result.paths) {
    for (let index = 0; index < path.points.length; index += 1) {
      const dot = path.points[index];
      const x = offsetX + dot.x * scale;
      const y = offsetY + dot.y * scale;
      const dotRadius = Math.max(0.28, settings.dotSize * scale * 0.34);
      if (x - dotRadius < -0.01 || y - dotRadius < -0.01 || x + dotRadius > totalW + 0.01 || y + dotRadius > totalH + 0.01) return true;
      if (settings.showNumbers) {
        const label = labelOffset(result, path, index, settings.labelSize, labelGrid);
        const labelX = x + label.x * scale;
        const labelY = y + label.y * scale;
        if (labelX - textPadding < 0 || labelY - textPadding < 0 || labelX + textPadding > totalW || labelY + textPadding > totalH) return true;
      }
    }
  }
  return false;
}

export function checkExportQuality(
  result: PuzzleResult,
  settings: ProcessingSettings,
  marginMm: number,
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
  checkPrintBounds = true,
): ExportCheck {
  const warnings: PuzzleWarning[] = result.warnings.slice();
  const short = result.paths.filter((path) => path.points.length < (path.closed ? 4 : 2));
  if (short.length) warnings.push({ code: "too-few-dots", message: `${short.length} contour path${short.length === 1 ? "" : "s"} may be too short to reconstruct.`, count: short.length });
  const collisions = countLabelCollisions(result.paths, settings.labelSize);
  if (settings.showNumbers && collisions > 0) warnings.push({ code: "label-overlap", message: `About ${collisions} number-label pair${collisions === 1 ? "" : "s"} may overlap at the current label size.`, count: collisions });
  if (marginMm < 3) warnings.push({ code: "budget-reduced", message: "Very small margins may be clipped by some printers." });
  const allDots = result.paths.flatMap((path) => path.points);
  const invalidDots = allDots.filter((dot) => !Number.isFinite(dot.x) || !Number.isFinite(dot.y) || dot.x < 0 || dot.y < 0 || dot.x > result.width || dot.y > result.height);
  if (invalidDots.length) warnings.push({ code: "no-contours", message: `${invalidDots.length} dot${invalidDots.length === 1 ? " is" : "s are"} outside the source image bounds.`, count: invalidDots.length });
  const printBoundsExceeded = checkPrintBounds && (exceedsPrintableBounds(result, settings, options, options.posterTiles)
    || (options.includeAnswerKey && exceedsPrintableBounds(result, settings, options, 1)));
  if (printBoundsExceeded) warnings.push({ code: "outside-printable", message: "Dots or labels exceed the printable page bounds at this scale. Reduce print scale or adjust the margins/page size.", count: 1 });
  return { ok: result.paths.length > 0 && invalidDots.length === 0 && !printBoundsExceeded, warnings };
}

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function getLabelPlan(result: PuzzleResult, settings: ProcessingSettings) {
  return numberPaths(result.paths, settings.pathMode);
}

function markerLabel(_path: PuzzlePath, pathIndex: number): string {
  return pathMarker(pathIndex);
}

function dotLabel(label: number, pathStart: boolean, marker: string, mode: ProcessingSettings["pathMode"]): string {
  if (!pathStart) return String(label);
  return mode === "multi" ? `${marker} ${label}` : `${marker}·${label}`;
}

function labelOffset(
  result: PuzzleResult,
  path: PuzzlePath,
  pointIndex: number,
  radius: number,
  dotGrid?: DotSpatialGrid,
): { x: number; y: number } {
  return computeLabelOffset(
    path.points,
    pointIndex,
    radius,
    { width: result.width, height: result.height },
    path.points[pointIndex].id,
    dotGrid ?? createDotGrid(result, radius),
  );
}

export function buildPuzzleSvg(result: PuzzleResult, settings: ProcessingSettings, options?: { answerKey?: boolean; transparent?: boolean }): string {
  const scale = Math.max(1, result.width, result.height);
  const radius = settings.dotSize * scale / Math.max(result.width, result.height);
  const fontSize = Math.max(settings.labelSize * 1.45, scale * 0.0055);
  const labels = getLabelPlan(result, settings);
  const labelGrid = createDotGrid(result, settings.labelSize);
  const labelById = new Map(labels.points.map((entry) => [entry.dotId, entry]));
  const background = options?.transparent ? "" : '<rect width="100%" height="100%" fill="#ffffff"/>';
  const pathLines = options?.answerKey
    ? result.paths.map((path) => {
      const d = path.points.map((dot, i) => `${i === 0 ? "M" : "L"} ${dot.x.toFixed(2)} ${dot.y.toFixed(2)}`).join(" ") + (path.closed ? " Z" : "");
      return `<path d="${d}" fill="none" stroke="#333333" stroke-width="${Math.max(1.1, scale * 0.0012)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join("")
    : "";
  const points = result.paths.map((path, pathIndex) => path.points.map((dot, index) => {
    const entry = labelById.get(dot.id);
    const marker = markerLabel(path, pathIndex);
    const offset = labelOffset(result, path, index, settings.labelSize, labelGrid);
    const label = dotLabel(entry?.label ?? index + 1, index === 0, marker, settings.pathMode);
    const dotMarkup = `<circle cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="#181a18"/>`;
    const textMarkup = settings.showNumbers
      ? `<text x="${(dot.x + offset.x).toFixed(2)}" y="${(dot.y + offset.y + fontSize * 0.33).toFixed(2)}" text-anchor="middle" font-family="DM Mono,monospace" font-size="${fontSize.toFixed(2)}" fill="#242624">${esc(label)}</text>`
      : "";
    return dotMarkup + textMarkup;
  }).join("")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${result.width}" height="${result.height}" viewBox="0 0 ${result.width} ${result.height}">${background}${pathLines}${points}</svg>`;
}

function faintReferenceDataUrl(image: HTMLImageElement | ImageBitmap, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not prepare the reference-image overlay.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114;
    const faint = 250 * 0.76 + gray * 0.24;
    pixels.data[i] = faint;
    pixels.data[i + 1] = faint;
    pixels.data[i + 2] = faint;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

export function createPuzzleCanvas(
  result: PuzzleResult,
  settings: ProcessingSettings,
  width: number,
  options: { transparent?: boolean; answerKey?: boolean; reference?: CanvasImageSource } = {},
): HTMLCanvasElement {
  const targetWidth = Math.max(256, Math.min(10_000, Math.round(width)));
  const targetHeight = Math.max(1, Math.round(targetWidth * result.height / result.width));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: options.transparent === true });
  if (!context) throw new Error("This browser could not create the export canvas.");
  const sx = targetWidth / result.width;
  const sy = targetHeight / result.height;
  if (!options.transparent) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
  }
  if (options.reference) {
    context.globalAlpha = 0.22;
    context.drawImage(options.reference, 0, 0, targetWidth, targetHeight);
    context.globalAlpha = 1;
  }
  if (options.answerKey) {
    context.strokeStyle = "#343431";
    context.lineWidth = Math.max(1, targetWidth * 0.0012);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const path of result.paths) {
      if (!path.points.length) continue;
      context.beginPath();
      context.moveTo(path.points[0].x * sx, path.points[0].y * sy);
      for (let i = 1; i < path.points.length; i += 1) context.lineTo(path.points[i].x * sx, path.points[i].y * sy);
      if (path.closed) context.closePath();
      context.stroke();
    }
  }
  const labels = getLabelPlan(result, settings);
  const labelGrid = createDotGrid(result, settings.labelSize);
  const labelById = new Map(labels.points.map((entry) => [entry.dotId, entry]));
  const scale = (sx + sy) / 2;
  const dotRadius = Math.max(1.5, settings.dotSize * scale * 0.48);
  const fontPx = Math.max(12, settings.labelSize * scale * 1.5);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.round(fontPx)}px "DM Mono", monospace`;
  context.fillStyle = "#242624";
  for (let pathIndex = 0; pathIndex < result.paths.length; pathIndex += 1) {
    const path = result.paths[pathIndex];
    for (let index = 0; index < path.points.length; index += 1) {
      const dot = path.points[index];
      const x = dot.x * sx;
      const y = dot.y * sy;
      context.beginPath();
      context.arc(x, y, dotRadius, 0, Math.PI * 2);
      context.fillStyle = "#171917";
      context.fill();
      if (!settings.showNumbers) continue;
      const entry = labelById.get(dot.id);
      const marker = markerLabel(path, pathIndex);
      const text = dotLabel(entry?.label ?? index + 1, index === 0, marker, settings.pathMode);
      const offset = labelOffset(result, path, index, settings.labelSize, labelGrid);
      context.fillStyle = "#242624";
      context.fillText(text, x + offset.x * scale, y + offset.y * scale);
    }
  }
  return canvas;
}

export function exportPng(result: PuzzleResult, settings: ProcessingSettings, options: ExportOptions, reference?: HTMLImageElement): Blob {
  const canvas = createPuzzleCanvas(result, settings, options.pngWidth, {
    transparent: options.transparentPng,
    reference: options.includeReference ? reference : undefined,
  });
  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

function paperDimensions(options: ExportOptions): [number, number] {
  let width = options.paperSize === "A3" ? 297 : options.paperSize === "A4" ? 210 : options.customWidthMm;
  let height = options.paperSize === "A3" ? 420 : options.paperSize === "A4" ? 297 : options.customHeightMm;
  if (options.orientation === "landscape" && height > width) [width, height] = [height, width];
  if (options.orientation === "portrait" && width > height) [width, height] = [height, width];
  return [Math.max(80, width), Math.max(80, height)];
}

function mappedPoint(x: number, y: number, transform: { scale: number; offsetX: number; offsetY: number }, margin: number, pageW: number, pageH: number, col: number, row: number): [number, number] {
  const tileW = pageW - 2 * margin;
  const tileH = pageH - 2 * margin;
  return [margin + transform.offsetX + x * transform.scale - col * tileW, margin + transform.offsetY + y * transform.scale - row * tileH];
}

function addPdfDrawing(
  pdf: jsPDF,
  result: PuzzleResult,
  settings: ProcessingSettings,
  options: ExportOptions,
  pageW: number,
  pageH: number,
  col: number,
  row: number,
  answerKey: boolean,
  imageData?: string,
  labelGrid?: DotSpatialGrid,
): void {
  const margin = options.marginMm;
  const tiles = answerKey ? 1 : options.posterTiles;
  const usableW = Math.max(20, pageW - 2 * margin);
  const usableH = Math.max(20, pageH - 2 * margin);
  const totalW = usableW * tiles;
  const totalH = usableH * tiles;
  const safeInset = Math.max(2.5, settings.showNumbers ? settings.labelSize * 0.85 : settings.dotSize * 0.45);
  const fitW = Math.max(1, totalW - 2 * safeInset);
  const fitH = Math.max(1, totalH - 2 * safeInset);
  const scale = Math.min(fitW / result.width, fitH / result.height) * settings.printScale / 100;
  const transform = { scale, offsetX: safeInset + (fitW - result.width * scale) / 2, offsetY: safeInset + (fitH - result.height * scale) / 2 };
  if (imageData && !answerKey) {
    const left = mappedPoint(0, 0, transform, margin, pageW, pageH, col, row);
    pdf.addImage(imageData, "PNG", left[0], left[1], result.width * scale, result.height * scale, undefined, "FAST");
  }
  if (answerKey) {
    pdf.setDrawColor(65, 65, 62);
    pdf.setLineWidth(0.28);
    result.paths.forEach((path) => {
      if (!path.points.length) return;
      const coords = path.points.map((point) => mappedPoint(point.x, point.y, transform, margin, pageW, pageH, col, row));
      for (let i = 1; i < coords.length; i += 1) pdf.line(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      if (path.closed && coords.length > 2) pdf.line(coords.at(-1)![0], coords.at(-1)![1], coords[0][0], coords[0][1]);
    });
  }
  const numbered = getLabelPlan(result, settings);
  const numberById = new Map(numbered.points.map((item) => [item.dotId, item]));
  pdf.setFillColor(25, 26, 24);
  pdf.setTextColor(33, 34, 32);
  pdf.setFont("courier", "normal");
  for (let pathIndex = 0; pathIndex < result.paths.length; pathIndex += 1) {
    const path = result.paths[pathIndex];
    for (let index = 0; index < path.points.length; index += 1) {
      const dot = path.points[index];
      const [x, y] = mappedPoint(dot.x, dot.y, transform, margin, pageW, pageH, col, row);
      const radius = Math.max(0.28, settings.dotSize * scale * 0.34);
      pdf.circle(x, y, radius, "F");
      if (settings.showNumbers) {
        const entry = numberById.get(dot.id);
        const marker = markerLabel(path, pathIndex);
        const label = dotLabel(entry?.label ?? index + 1, index === 0, marker, settings.pathMode);
        const offset = labelOffset(result, path, index, settings.labelSize, labelGrid);
        const labelX = x + offset.x * scale;
        const labelY = y + offset.y * scale;
        pdf.setFontSize(Math.max(6, settings.labelSize));
        pdf.text(label, labelX, labelY, { align: "center", baseline: "middle" });
      }
    }
  }
  if (!answerKey) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(93, 94, 89);
    pdf.text(settings.pathMode === "multi" ? "Complete each lettered path; numbers restart at each path marker." : "Follow the global number sequence; letter markers identify separate path starts.", margin, pageH - Math.max(4, margin * 0.42));
    if (tiles > 1) {
      pdf.setFontSize(7);
      pdf.text(`Poster tile ${row * tiles + col + 1} of ${tiles * tiles} · align pages at the registration marks`, pageW - margin, pageH - Math.max(4, margin * 0.42), { align: "right" });
      pdf.setDrawColor(190, 185, 175);
      pdf.setLineWidth(0.18);
      pdf.line(margin - 1.5, margin, margin + 1.5, margin);
      pdf.line(margin, margin - 1.5, margin, margin + 1.5);
    }
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Answer key · suggested contour paths", margin, pageH - Math.max(4, margin * 0.42));
  }
}

export async function exportPdf(
  result: PuzzleResult,
  settings: ProcessingSettings,
  options: ExportOptions,
  reference?: HTMLImageElement,
): Promise<Blob> {
  const [pageW, pageH] = paperDimensions(options);
  const orientation = pageW > pageH ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: [pageW, pageH], compress: true });
  const tiles = options.posterTiles;
  const imageData = options.includeReference && reference ? faintReferenceDataUrl(reference, result.width, result.height) : undefined;
  const labelGrid = createDotGrid(result, settings.labelSize);
  for (let row = 0; row < tiles; row += 1) {
    for (let col = 0; col < tiles; col += 1) {
      if (row !== 0 || col !== 0) pdf.addPage([pageW, pageH], orientation);
      addPdfDrawing(pdf, result, settings, options, pageW, pageH, col, row, false, imageData, labelGrid);
    }
  }
  if (options.includeAnswerKey) {
    pdf.addPage([pageW, pageH], orientation);
    addPdfDrawing(pdf, result, settings, options, pageW, pageH, 0, 0, true, undefined, labelGrid);
  }
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
