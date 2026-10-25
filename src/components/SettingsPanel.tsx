import { ChevronDown, CircleHelp, RotateCw, X } from "lucide-react";
import { DIFFICULTY_PRESETS, type Difficulty, type ProcessingSettings } from "../engine/types";

interface SettingsPanelProps {
  settings: ProcessingSettings;
  onChange: (settings: ProcessingSettings) => void;
  onRegenerate: () => void;
  onCancel: () => void;
  processing: boolean;
  dirty: boolean;
  progress: number;
  stage: string;
}

type NumericKey = "dotBudget" | "contourSensitivity" | "fineDetail" | "minSpacing" | "backgroundSuppression" | "lineArtEnhancement" | "pathComplexity" | "labelSize" | "dotSize" | "printScale";

function Control({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-control">
      <span className="setting-line"><span>{label}</span><span className="setting-value">{value}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      {hint && <span className="setting-hint">{hint}</span>}
    </label>
  );
}

export default function SettingsPanel({ settings, onChange, onRegenerate, onCancel, processing, dirty, progress, stage }: SettingsPanelProps) {
  const update = <K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K]) => onChange({ ...settings, [key]: value });
  const updateNumeric = (key: NumericKey, value: number) => onChange({ ...settings, [key]: value, ...(key === "dotBudget" ? { difficulty: "custom" as Difficulty } : {}) });

  const presets = Object.entries(DIFFICULTY_PRESETS) as Array<[Exclude<Difficulty, "custom">, typeof DIFFICULTY_PRESETS["easy"]]>;

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading"><div><span className="eyebrow">01 · Tune the detail</span><h2 id="settings-title">Puzzle settings</h2></div><span className="help-mark" title="Settings change how contours are selected and sampled."><CircleHelp size={15} /></span></div>
      <div className="difficulty-block">
        <div className="section-label">Difficulty</div>
        <div className="difficulty-list">
          {presets.map(([id, preset]) => (
            <button key={id} type="button" className={`difficulty-option${settings.difficulty === id ? " active" : ""}`} onClick={() => onChange({ ...settings, difficulty: id, dotBudget: preset.dots })}>
              <span className="radio-dot" /><span className="difficulty-name">{preset.label}</span><span className="difficulty-range">{preset.range}</span>
            </button>
          ))}
          <button type="button" className={`difficulty-option${settings.difficulty === "custom" ? " active" : ""}`} onClick={() => update("difficulty", "custom")}>
            <span className="radio-dot" /><span className="difficulty-name">Custom</span><span className="difficulty-range">Set a budget</span>
          </button>
        </div>
      </div>

      <div className="settings-subsection">
        <div className="section-label">Contour intelligence <span className="section-rule" /></div>
        <Control label="Dot budget" value={settings.dotBudget} min={50} max={2000} step={10} suffix=" dots" hint="Guideline, not a hard cap on important features" onChange={(value) => updateNumeric("dotBudget", value)} />
        <Control label="Contour sensitivity" value={settings.contourSensitivity} min={1} max={10} hint="Higher keeps lighter and smaller edges" onChange={(value) => updateNumeric("contourSensitivity", value)} />
        <Control label="Fine-detail preservation" value={settings.fineDetail} min={1} max={10} hint="Prioritizes intricate inner contours" onChange={(value) => updateNumeric("fineDetail", value)} />
        <Control label="Minimum dot spacing" value={settings.minSpacing} min={2} max={28} suffix=" px" hint="Reduce for tighter curves and small features" onChange={(value) => updateNumeric("minSpacing", value)} />
        <Control label="Background suppression" value={settings.backgroundSuppression} min={0} max={10} hint="Filters distant, low-priority texture" onChange={(value) => updateNumeric("backgroundSuppression", value)} />
        <Control label="Line-art enhancement" value={settings.lineArtEnhancement} min={0} max={10} hint="Contrast normalization and denoising balance" onChange={(value) => updateNumeric("lineArtEnhancement", value)} />
        <Control label="Path complexity" value={settings.pathComplexity} min={1} max={10} hint="Balances how many separate contours are kept" onChange={(value) => updateNumeric("pathComplexity", value)} />
      </div>

      <details className="advanced-details">
        <summary><span>Print & label controls</span><ChevronDown size={14} /></summary>
        <div className="advanced-controls">
          <Control label="Number-label size" value={settings.labelSize} min={6} max={18} suffix=" pt" onChange={(value) => updateNumeric("labelSize", value)} />
          <Control label="Dot size" value={settings.dotSize} min={1} max={6} step={0.2} suffix=" px" onChange={(value) => updateNumeric("dotSize", value)} />
          <Control label="Print scale" value={settings.printScale} min={70} max={130} suffix="%" onChange={(value) => updateNumeric("printScale", value)} />
          <label className="setting-select"><span>Numbering style</span><select value={settings.pathMode} onChange={(event) => update("pathMode", event.currentTarget.value as ProcessingSettings["pathMode"])}><option value="multi">Multi-path · restart at each marker</option><option value="continuous">Continuous numbers · separate paths</option></select></label>
          <label className="toggle-row"><span>Numbers on canvas</span><input type="checkbox" checked={settings.showNumbers} onChange={(event) => update("showNumbers", event.currentTarget.checked)} /><span className="toggle" /></label>
          <label className="toggle-row"><span>Close suitable contours</span><input type="checkbox" checked={settings.closeContours} onChange={(event) => update("closeContours", event.currentTarget.checked)} /><span className="toggle" /></label>
        </div>
      </details>

      {processing ? (
        <div className="processing-control">
          <div className="processing-copy"><span>{stage || "Processing locally"}</span><span>{Math.round(progress * 100)}%</span></div>
          <div className="progress-track"><span style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
          <button type="button" className="button button-light cancel-button" onClick={onCancel}><X size={14} /> Cancel processing</button>
        </div>
      ) : (
        <button type="button" className={`button button-accent regenerate-button${dirty ? " is-dirty" : ""}`} onClick={onRegenerate} disabled={!dirty}>
          <RotateCw size={15} /> {dirty ? "Regenerate puzzle" : "Settings applied"}
        </button>
      )}
      <p className="privacy-note">Processing runs in your browser. Your image is not uploaded.</p>
    </section>
  );
}
