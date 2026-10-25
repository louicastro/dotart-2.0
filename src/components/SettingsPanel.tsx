import { ChevronDown, CircleHelp, RotateCw, X } from "lucide-react";
import {
  DIFFICULTY_PRESETS,
  PROCESSING_PROFILES,
  validateSettings,
  type Difficulty,
  type ProcessingFocus,
  type ProcessingProfile,
  type ProcessingSettings,
} from "../engine/types";

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

type PrecisionKey = "detailPreservation" | "backgroundSuppression" | "minimumSpacing";
type NumericKey =
  | PrecisionKey
  | "dotBudget"
  | "contourSensitivity"
  | "fineDetail"
  | "minSpacing"
  | "lineArtEnhancement"
  | "pathComplexity"
  | "labelSize"
  | "dotSize"
  | "printScale";

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
      <span className="setting-line">
        <span>{label}</span>
        <span className="setting-value">{value}{suffix}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {hint && <span className="setting-hint">{hint}</span>}
    </label>
  );
}

export default function SettingsPanel({
  settings,
  onChange,
  onRegenerate,
  onCancel,
  processing,
  dirty,
  progress,
  stage,
}: SettingsPanelProps) {
  const update = <K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K]) =>
    onChange(validateSettings({ ...settings, [key]: value }));

  const updateNumeric = (key: NumericKey, value: number) =>
    onChange(
      validateSettings({
        ...settings,
        [key]: value,
        ...(key === "dotBudget" ? { difficulty: "custom" as Difficulty } : {}),
      }),
    );

  const presets = Object.entries(DIFFICULTY_PRESETS) as Array<
    [Exclude<Difficulty, "custom">, (typeof DIFFICULTY_PRESETS)["easy"]]
  >;

  const currentFocus = settings.processingFocus || settings.profile || "anime";

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">01 · Precision & detail</span>
          <h2 id="settings-title">Puzzle settings</h2>
        </div>
        <span className="help-mark" title="Precision controls calibrate how contours are detected, filtered, and sampled.">
          <CircleHelp size={15} />
        </span>
      </div>

      <div className="difficulty-block">
        <div className="section-label">
          Processing Profile <span className="section-rule" />
        </div>
        <div className="profile-grid">
          {(Object.entries(PROCESSING_PROFILES) as Array<[ProcessingProfile, (typeof PROCESSING_PROFILES)["anime"]]>).map(
            ([id, info]) => (
              <button
                key={id}
                type="button"
                className={`profile-card${currentFocus === id ? " active" : ""}`}
                onClick={() =>
                  onChange(
                    validateSettings({
                      ...settings,
                      processingFocus: id as ProcessingFocus,
                      profile: id,
                    }),
                  )
                }
                title={info.description}
              >
                <span className="profile-badge">{info.badge}</span>
                <span className="profile-label">{info.label}</span>
              </button>
            ),
          )}
        </div>
      </div>

      <div className="settings-subsection">
        <div className="section-label">
          Precision Controls <span className="section-rule" />
        </div>
        <Control
          label="Detail Preservation"
          value={settings.detailPreservation}
          min={0}
          max={100}
          step={1}
          suffix="%"
          hint="Protects fine anime eyes, hair strands, and accessories without noise"
          onChange={(value) => updateNumeric("detailPreservation", value)}
        />
        <Control
          label="Background Suppression"
          value={settings.backgroundSuppression}
          min={0}
          max={100}
          step={1}
          suffix="%"
          hint="Suppresses low-priority background textures while keeping subject silhouettes"
          onChange={(value) => updateNumeric("backgroundSuppression", value)}
        />
        <Control
          label="Minimum Dot Spacing"
          value={settings.minimumSpacing}
          min={0}
          max={100}
          step={1}
          suffix="%"
          hint="Removes crowded dots on straight spans while protecting corners & endpoints"
          onChange={(value) => updateNumeric("minimumSpacing", value)}
        />
      </div>

      <div className="difficulty-block" style={{ marginTop: "16px" }}>
        <div className="section-label">Difficulty & Budget</div>
        <div className="difficulty-list">
          {presets.map(([id, preset]) => (
            <button
              key={id}
              type="button"
              className={`difficulty-option${settings.difficulty === id ? " active" : ""}`}
              onClick={() => onChange(validateSettings({ ...settings, difficulty: id, dotBudget: preset.dots }))}
            >
              <span className="radio-dot" />
              <span className="difficulty-name">{preset.label}</span>
              <span className="difficulty-range">{preset.range}</span>
            </button>
          ))}
          <button
            type="button"
            className={`difficulty-option${settings.difficulty === "custom" ? " active" : ""}`}
            onClick={() => update("difficulty", "custom")}
          >
            <span className="radio-dot" />
            <span className="difficulty-name">Custom</span>
            <span className="difficulty-range">Set budget</span>
          </button>
        </div>
      </div>

      <details className="advanced-details">
        <summary>
          <span>Fine-tuning & sensitivity</span>
          <ChevronDown size={14} />
        </summary>
        <div className="advanced-controls">
          <Control
            label="Dot budget"
            value={settings.dotBudget}
            min={50}
            max={2000}
            step={10}
            suffix=" dots"
            hint="Target budget for printable worksheet"
            onChange={(value) => updateNumeric("dotBudget", value)}
          />
          <Control
            label="Contour sensitivity"
            value={settings.contourSensitivity}
            min={1}
            max={10}
            hint="Higher detects fainter lines"
            onChange={(value) => updateNumeric("contourSensitivity", value)}
          />
          <Control
            label="Line-art enhancement"
            value={settings.lineArtEnhancement}
            min={0}
            max={10}
            hint="Contrast normalization & morphology"
            onChange={(value) => updateNumeric("lineArtEnhancement", value)}
          />
          <Control
            label="Path complexity"
            value={settings.pathComplexity}
            min={1}
            max={10}
            hint="Maximum number of separate contour paths kept"
            onChange={(value) => updateNumeric("pathComplexity", value)}
          />
        </div>
      </details>

      <details className="advanced-details">
        <summary>
          <span>Print & label controls</span>
          <ChevronDown size={14} />
        </summary>
        <div className="advanced-controls">
          <Control
            label="Number-label size"
            value={settings.labelSize}
            min={6}
            max={18}
            suffix=" pt"
            onChange={(value) => updateNumeric("labelSize", value)}
          />
          <Control
            label="Dot size"
            value={settings.dotSize}
            min={1}
            max={6}
            step={0.2}
            suffix=" px"
            onChange={(value) => updateNumeric("dotSize", value)}
          />
          <Control
            label="Print scale"
            value={settings.printScale}
            min={70}
            max={130}
            suffix="%"
            onChange={(value) => updateNumeric("printScale", value)}
          />
          <label className="setting-select">
            <span>Numbering style</span>
            <select
              value={settings.pathMode}
              onChange={(event) => update("pathMode", event.currentTarget.value as ProcessingSettings["pathMode"])}
            >
              <option value="multi">Multi-path · restart at each marker</option>
              <option value="continuous">Continuous numbers · separate paths</option>
            </select>
          </label>
          <label className="toggle-row">
            <span>Numbers on canvas</span>
            <input
              type="checkbox"
              checked={settings.showNumbers}
              onChange={(event) => update("showNumbers", event.currentTarget.checked)}
            />
            <span className="toggle" />
          </label>
          <label className="toggle-row">
            <span>Close suitable contours</span>
            <input
              type="checkbox"
              checked={settings.closeContours}
              onChange={(event) => update("closeContours", event.currentTarget.checked)}
            />
            <span className="toggle" />
          </label>
        </div>
      </details>

      {processing ? (
        <div className="processing-control">
          <div className="processing-copy">
            <span>{stage || "Processing locally"}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
          <button type="button" className="button button-light cancel-button" onClick={onCancel}>
            <X size={14} /> Cancel processing
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`button button-accent regenerate-button${dirty ? " is-dirty" : ""}`}
          onClick={onRegenerate}
          disabled={!dirty}
        >
          <RotateCw size={15} /> {dirty ? "Regenerate puzzle" : "Settings applied"}
        </button>
      )}
      <p className="privacy-note">Processing runs in your browser. Your image is not uploaded.</p>
    </section>
  );
}
