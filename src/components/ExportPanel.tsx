import { Download, FileImage, FileText, Printer } from "lucide-react";
import type { ExportOptions } from "../export/exporter";
import type { PuzzleResult } from "../engine/types";

interface ExportPanelProps {
  options: ExportOptions;
  onChange: (options: ExportOptions) => void;
  onPdf: () => void;
  onPng: () => void;
  result: PuzzleResult;
  disabled: boolean;
}

export default function ExportPanel({ options, onChange, onPdf, onPng, result, disabled }: ExportPanelProps) {
  const update = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => onChange({ ...options, [key]: value });
  return (
    <section className="panel export-panel" aria-labelledby="export-title">
      <div className="panel-heading"><div><span className="eyebrow">03 · Ready for paper</span><h2 id="export-title">Print & export</h2></div><Printer size={17} className="muted-icon" /></div>
      <div className="export-type-row"><span className="section-label">File format</span></div>
      <div className="export-actions">
        <button type="button" className="export-format-button" onClick={onPdf} disabled={disabled}><FileText size={17} /><span><strong>PDF worksheet</strong><small>Vector · {options.paperSize}{options.posterTiles > 1 ? ` · ${options.posterTiles}×${options.posterTiles} poster` : ""}</small></span><Download size={14} className="download-arrow" /></button>
        <button type="button" className="export-format-button" onClick={onPng} disabled={disabled}><FileImage size={17} /><span><strong>High-resolution PNG</strong><small>{options.pngWidth.toLocaleString()} px wide</small></span><Download size={14} className="download-arrow" /></button>
      </div>

      <div className="section-label export-section-label">PDF page setup</div>
      <div className="two-field-row">
        <label className="setting-select"><span>Paper size</span><select value={options.paperSize} onChange={(event) => update("paperSize", event.currentTarget.value as ExportOptions["paperSize"])}><option value="A4">A4 · 210 × 297 mm</option><option value="A3">A3 · 297 × 420 mm</option><option value="custom">Custom size</option></select></label>
        <label className="setting-select"><span>Orientation</span><select value={options.orientation} onChange={(event) => update("orientation", event.currentTarget.value as ExportOptions["orientation"])}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      </div>
      {options.paperSize === "custom" && <div className="two-field-row custom-size-row"><label className="setting-select"><span>Width (mm)</span><input type="number" min={80} max={1000} value={options.customWidthMm} onChange={(event) => update("customWidthMm", Math.max(80, Number(event.currentTarget.value)))} /></label><label className="setting-select"><span>Height (mm)</span><input type="number" min={80} max={1000} value={options.customHeightMm} onChange={(event) => update("customHeightMm", Math.max(80, Number(event.currentTarget.value)))} /></label></div>}
      <label className="setting-select"><span>Margins <strong className="field-value">{options.marginMm} mm</strong></span><input type="range" min={4} max={28} value={options.marginMm} onChange={(event) => update("marginMm", Number(event.currentTarget.value))} /></label>
      <label className="setting-select"><span>Poster tiling</span><select value={options.posterTiles} onChange={(event) => update("posterTiles", Number(event.currentTarget.value) as ExportOptions["posterTiles"])}><option value={1}>Single page</option><option value={2}>2 × 2 pages</option><option value={3}>3 × 3 pages</option></select></label>
      <label className="toggle-row export-toggle"><span>Faint reference overlay</span><input type="checkbox" checked={options.includeReference} onChange={(event) => update("includeReference", event.currentTarget.checked)} /><span className="toggle" /></label>
      <label className="toggle-row export-toggle"><span>Add answer-key page</span><input type="checkbox" checked={options.includeAnswerKey} onChange={(event) => update("includeAnswerKey", event.currentTarget.checked)} /><span className="toggle" /></label>
      <div className="section-label export-section-label">PNG image</div>
      <label className="setting-select"><span>Output width <strong className="field-value">{options.pngWidth.toLocaleString()} px</strong></span><input type="range" min={1000} max={6000} step={250} value={options.pngWidth} onChange={(event) => update("pngWidth", Number(event.currentTarget.value))} /></label>
      <label className="toggle-row export-toggle"><span>Transparent background</span><input type="checkbox" checked={options.transparentPng} onChange={(event) => update("transparentPng", event.currentTarget.checked)} /><span className="toggle" /></label>

      <div className="export-spec"><span>Aspect-preserving vector fit</span><span>{result.width} × {result.height}</span></div>
      <p className="export-note">Letter markers identify every separate path. Multi-path mode restarts numbering; continuous mode keeps one global sequence. Unrelated contours are never joined.</p>
    </section>
  );
}
