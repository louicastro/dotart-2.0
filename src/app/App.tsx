import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Check, ChevronDown, ChevronRight, Eye, EyeOff, FileDown, Image as ImageIcon, Info, LoaderCircle, Redo2, RotateCcw, ScanLine, ShieldCheck, SlidersHorizontal, Undo2, X } from "lucide-react";
import CanvasEditor from "../components/CanvasEditor";
import ExportPanel from "../components/ExportPanel";
import SampleGallery, { SAMPLE_IMAGE_URL } from "../components/SampleGallery";
import SettingsPanel from "../components/SettingsPanel";
import { BrandMark, default as UploadZone } from "../components/UploadZone";
import { cancelProcessing, processImage } from "../engine/client";
import { longestSegmentInsertion, pathLength } from "../engine/geometry";
import { pathMarker } from "../engine/numbering";
import type { ImageMetadata, ProcessingSettings, PuzzlePath, PuzzleResult } from "../engine/types";
import { DEFAULT_SETTINGS } from "../engine/types";
import { DEFAULT_EXPORT_OPTIONS, buildPuzzleSvg, checkExportQuality, downloadBlob, exportPdf, exportPng, type ExportOptions } from "../export/exporter";
import "../styles/app.css";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type View = "landing" | "workspace";
interface SelectedDot { pathId: string; dotId: string }

function processingSignature(settings: ProcessingSettings): string {
  return [
    settings.profile,
    settings.dotBudget,
    settings.contourSensitivity,
    settings.fineDetail,
    settings.minSpacing,
    settings.backgroundSuppression,
    settings.lineArtEnhancement,
    settings.pathComplexity,
    settings.closeContours,
  ].join("|");
}

function makePreviewUrl(result: PuzzleResult, settings: ProcessingSettings): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPuzzleSvg(result, settings))}`;
}

function fileIsSupported(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ACCEPTED_TYPES.has(file.type) || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "");
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_SETTINGS);
  const [appliedSettings, setAppliedSettings] = useState<ProcessingSettings>(DEFAULT_SETTINGS);
  const [undoStack, setUndoStack] = useState<ProcessingSettings[]>([]);
  const [redoStack, setRedoStack] = useState<ProcessingSettings[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [sampleResult, setSampleResult] = useState<PuzzleResult | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [selectedDot, setSelectedDot] = useState<SelectedDot | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showPaths, setShowPaths] = useState(true);
  const [showDots, setShowDots] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.18);
  const [editingDots, setEditingDots] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [exporting, setExporting] = useState(false);
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);
  const activeRequest = useRef<string | null>(null);
  const jobToken = useRef<string | null>(null);
  const latestSettings = useRef(settings);
  latestSettings.current = settings;

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    if (isSample && result) setSampleResult(result);
  }, [isSample, result]);

  const dirty = useMemo(() => processingSignature(settings) !== processingSignature(appliedSettings), [settings, appliedSettings]);

  const runProcessing = useCallback((nextFile: File, nextSettings: ProcessingSettings, sample: boolean) => {
    if (activeRequest.current) cancelProcessing(activeRequest.current);
    setProcessing(true);
    setProgress(0.02);
    setStage("Starting local processor");
    setError(null);
    const token = crypto.randomUUID();
    jobToken.current = token;
    const requestId = processImage(nextFile, nextSettings, {
      onProgress: (nextStage, nextProgress) => {
        if (jobToken.current !== token) return;
        setStage(nextStage);
        setProgress(nextProgress);
      },
      onComplete: (nextResult) => {
        if (jobToken.current !== token) return;
        setResult(nextResult);
        setAppliedSettings(nextSettings);
        setProcessing(false);
        setProgress(1);
        setStage("Ready to inspect");
        setSelectedPathId(nextResult.paths[0]?.id ?? null);
        if (sample) setSampleResult(nextResult);
      },
      onError: (message) => {
        if (jobToken.current !== token) return;
        setProcessing(false);
        setStage("Processing stopped");
        setError(message);
      },
    });
    activeRequest.current = requestId;
  }, []);

  const acceptFile = useCallback((nextFile: File, openWorkspace = true, sample = false) => {
    setError(null);
    if (!fileIsSupported(nextFile)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setError("This image is over 25 MB. Choose a smaller file so it can be processed smoothly in your browser.");
      return;
    }
    const objectUrl = URL.createObjectURL(nextFile);
    const preview = new Image();
    preview.decoding = "async";
    preview.onload = () => {
      setFile(nextFile);
      setImageUrl(objectUrl);
      setImage(preview);
      setMetadata({ name: nextFile.name, mimeType: nextFile.type || "image/unknown", bytes: nextFile.size, width: preview.naturalWidth, height: preview.naturalHeight });
      setResult(null);
      setSelectedDot(null);
      setIsSample(sample);
      if (!sample) setSampleResult(null);
      if (openWorkspace) setView("workspace");
      setAppliedSettings(latestSettings.current);
      runProcessing(nextFile, latestSettings.current, sample);
    };
    preview.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("The image could not be decoded. Try another JPEG, PNG, or WebP file.");
    };
    preview.src = objectUrl;
  }, [runProcessing]);

  const runSample = useCallback(async () => {
    setError(null);
    if (sampleResult && isSample) {
      setView("workspace");
      return;
    }
    try {
      const response = await fetch(SAMPLE_IMAGE_URL);
      if (!response.ok) throw new Error("The bundled sample image could not be read. Please try again.");
      const blob = await response.blob();
      const sampleFile = new File([blob], "dotart-character-sample.webp", { type: blob.type || "image/webp" });
      acceptFile(sampleFile, false, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The sample could not be loaded.");
    }
  }, [acceptFile, isSample, sampleResult]);

  const openSample = useCallback(() => setView("workspace"), []);

  const updateSettings = (next: ProcessingSettings) => {
    setUndoStack((previous) => [...previous.slice(-39), settings]);
    setRedoStack([]);
    setSettings(next);
    if (isSample && processingSignature(settings) !== processingSignature(next)) setSampleResult(null);
  };

  const undo = () => {
    if (!undoStack.length) return;
    const previous = undoStack.at(-1)!;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, settings]);
    setSettings(previous);
    if (isSample && processingSignature(settings) !== processingSignature(previous)) setSampleResult(null);
  };

  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack.at(-1)!;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, settings]);
    setSettings(next);
    if (isSample && processingSignature(settings) !== processingSignature(next)) setSampleResult(null);
  };

  const cancel = () => {
    if (activeRequest.current) cancelProcessing(activeRequest.current);
    activeRequest.current = null;
    jobToken.current = null;
    setProcessing(false);
    setStage("Cancelled");
  };

  const regenerate = () => {
    if (file) runProcessing(file, settings, isSample);
  };

  const resetStudio = () => {
    setUndoStack((previous) => [...previous.slice(-39), settings]);
    setRedoStack([]);
    setSettings(DEFAULT_SETTINGS);
    if (isSample && processingSignature(settings) !== processingSignature(DEFAULT_SETTINGS)) setSampleResult(null);
    setShowOriginal(false);
    setShowPaths(true);
    setShowDots(true);
    setOverlayOpacity(0.18);
    setEditingDots(false);
    setSelectedDot(null);
  };

  const updateManualPath = (pathId: string, mutate: (path: PuzzlePath) => PuzzlePath) => {
    setResult((current) => {
      if (!current) return current;
      const paths = current.paths.map((path) => path.id === pathId ? mutate(path) : path);
      const totalDots = paths.reduce((count, path) => count + path.points.length, 0);
      const updated = { ...current, paths, totalDots };
      return updated;
    });
  };

  const moveDot = (pathId: string, dotId: string, x: number, y: number) => {
    updateManualPath(pathId, (path) => ({ ...path, points: path.points.map((dot) => dot.id === dotId ? { ...dot, x, y } : dot) }));
  };

  const addDot = () => {
    if (!result || !selectedPathId) return;
    const path = result.paths.find((item) => item.id === selectedPathId);
    if (!path || path.points.length >= 2000) return;
    const segment = longestSegmentInsertion(path.points, path.closed);
    if (!segment) return;
    const { index: insertion, beforeIndex, afterIndex } = segment;
    const previous = path.points[beforeIndex];
    const next = path.points[afterIndex];
    const newDot = { id: `${pathIdSafe(path.id)}-manual-${Date.now()}`, x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2, index: insertion + 1 };
    updateManualPath(path.id, (existing) => {
      const points = existing.points.slice();
      points.splice(insertion, 0, newDot);
      return { ...existing, points: points.map((dot, index) => ({ ...dot, index: index + 1 })) };
    });
    setSelectedDot({ pathId: path.id, dotId: newDot.id });
  };

  const removeDot = () => {
    if (!result || !selectedDot) return;
    const path = result.paths.find((item) => item.id === selectedDot.pathId);
    if (!path || path.points.length <= (path.closed ? 4 : 2)) return;
    updateManualPath(path.id, (existing) => ({ ...existing, points: existing.points.filter((dot) => dot.id !== selectedDot.dotId).map((dot, index) => ({ ...dot, index: index + 1 })) }));
    setSelectedDot(null);
  };

  const deleteSelectedPath = () => {
    if (!result || !selectedPathId) return;
    const pathToDelete = result.paths.find((p) => p.id === selectedPathId);
    if (!pathToDelete) return;
    setResult((current) => {
      if (!current) return current;
      const paths = current.paths.filter((p) => p.id !== selectedPathId);
      const suppressedPaths = [pathToDelete, ...(current.suppressedPaths || [])];
      const totalDots = paths.reduce((count, p) => count + p.points.length, 0);
      return { ...current, paths, suppressedPaths, totalDots };
    });
    setSelectedPathId(null);
    setSelectedDot(null);
  };

  const reversePathDirection = () => {
    if (!result || !selectedPathId) return;
    updateManualPath(selectedPathId, (existing) => {
      const reversed = existing.points.slice().reverse().map((dot, idx) => ({ ...dot, index: idx + 1 }));
      return { ...existing, points: reversed };
    });
  };

  const filterNoisePaths = () => {
    if (!result) return;
    const minPerimeter = 22;
    const kept: PuzzlePath[] = [];
    const removed: PuzzlePath[] = [];
    result.paths.forEach((p) => {
      if (p.perimeter < minPerimeter || p.points.length < 3) {
        removed.push(p);
      } else {
        kept.push(p);
      }
    });
    if (!removed.length) return;
    setResult((current) => {
      if (!current) return current;
      const totalDots = kept.reduce((count, p) => count + p.points.length, 0);
      return {
        ...current,
        paths: kept,
        suppressedPaths: [...removed, ...(current.suppressedPaths || [])],
        totalDots,
      };
    });
    if (selectedPathId && removed.some((p) => p.id === selectedPathId)) {
      setSelectedPathId(kept[0]?.id ?? null);
    }
  };

  const restorePath = (pathId: string) => {
    if (!result || !result.suppressedPaths) return;
    const toRestore = result.suppressedPaths.find((p) => p.id === pathId);
    if (!toRestore) return;
    setResult((current) => {
      if (!current) return current;
      const suppressedPaths = current.suppressedPaths?.filter((p) => p.id !== pathId) || [];
      const paths = [...current.paths, toRestore];
      const totalDots = paths.reduce((count, p) => count + p.points.length, 0);
      return { ...current, paths, suppressedPaths, totalDots };
    });
    setSelectedPathId(toRestore.id);
  };

  const exportFile = async (kind: "pdf" | "png") => {
    if (!result) return;
    if (processing || dirty) {
      setError(dirty ? "Settings changed. Regenerate the puzzle before exporting so the download matches your controls." : "Wait for image processing to finish before exporting.");
      return;
    }
    const checks = checkExportQuality(result, settings, exportOptions.marginMm, exportOptions, kind === "pdf");
    setExportWarnings(checks.warnings.map((warning) => warning.message));
    if (!checks.ok) return;
    setExporting(true);
    try {
      const base = (file?.name.replace(/\.[^.]+$/, "") || "dotart-puzzle").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
      if (kind === "pdf") {
        const blob = await exportPdf(result, settings, exportOptions, image ?? undefined);
        downloadBlob(blob, `${base}-dot-to-dot.pdf`);
      } else {
        const blob = exportPng(result, settings, exportOptions, image ?? undefined);
        downloadBlob(blob, `${base}-dot-to-dot.png`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The file could not be generated.");
    } finally {
      setExporting(false);
    }
  };

  const topBar = (
    <header className="studio-header">
      <div className="studio-brand"><button type="button" className="brand-button" onClick={() => setView("landing")} aria-label="Go to DotArt home"><BrandMark /></button><span className="header-divider" /><span className="header-location">{view === "workspace" ? "WORKSPACE" : "IMAGE TO DOT-TO-DOT"}</span></div>
      <div className="header-right"><span className="privacy-pill"><ShieldCheck size={13} /> LOCAL & PRIVATE</span>{view === "workspace" && <button type="button" className="button button-dark header-export" onClick={() => void exportFile("pdf")} disabled={!result || processing || dirty || exporting}><FileDown size={14} /> {exporting ? "Preparing…" : "Download PDF"}</button>}</div>
    </header>
  );

  if (view === "landing") {
    const actualSvg = sampleResult ? makePreviewUrl(sampleResult, settings) : null;
    return (
      <div className="app-shell landing-shell">
        {topBar}
        <main>
          <section className="hero-section">
            <div className="hero-copy">
              <span className="hero-kicker"><span className="hero-kicker-dot" /> A DIGITAL PRINT STUDIO</span>
              <h1>Turn any image into a <em>dot-to-dot</em> masterpiece.</h1>
              <p className="hero-subtitle">Bring an illustration, portrait, or favorite photo. DotArt follows the meaningful contours and turns them into a puzzle you can print and connect.</p>
              <UploadZone onFile={(nextFile) => acceptFile(nextFile, true, false)} onSample={runSample} />
              {error && <div className="error-banner"><Info size={15} />{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss message"><X size={14} /></button></div>}
              <div className="hero-trust"><span><ShieldCheck size={14} /> Image stays in your browser</span><span><ScanLine size={14} /> Ordered contour paths</span><span><FileDown size={14} /> Print-ready PDF</span></div>
            </div>
            <div className="hero-visual" aria-label="Sample image used by DotArt Studio">
              <div className="hero-visual-note"><span>STUDY 01</span><span>LINE / FORM</span></div>
              <div className="hero-image-wrap"><img src={SAMPLE_IMAGE_URL} alt="Original fictional anime illustration used as the DotArt sample" /><div className="hero-image-corner top-left"/><div className="hero-image-corner bottom-right"/></div>
              <div className="hero-visual-foot"><span>Original sample</span><span>JPG · PNG · WEBP</span></div>
              {actualSvg && <div className="hero-actual-after"><span>ACTUAL RESULT · {sampleResult?.totalDots} DOTS</span><img src={actualSvg} alt="Actual dot-to-dot paths generated by the local CV engine" /></div>}
              <span className="hero-art-label">FIG. A / CONTOUR STUDY</span>
            </div>
          </section>

          <section className="feature-rail" aria-label="Product features">
            <article><span className="feature-index">01</span><ScanLine size={20} /><h3>Contours with intent</h3><p>Multi-scale edge analysis keeps silhouettes and inner details in ordered paths.</p></article>
            <article><span className="feature-index">02</span><SlidersHorizontal size={20} /><h3>Detail on your terms</h3><p>Adjust dot budget, spacing, sensitivity, and fine-detail emphasis.</p></article>
            <article><span className="feature-index">03</span><FileDown size={20} /><h3>Made to print</h3><p>Export crisp PDFs and PNGs with path starts, number labels, and answer keys.</p></article>
            <article><span className="feature-index">04</span><ShieldCheck size={20} /><h3>Private by default</h3><p>Your image is analyzed in your browser—not uploaded to a server.</p></article>
          </section>

          <SampleGallery onTrySample={runSample} onOpenSample={openSample} sampleResult={sampleResult} settings={settings} processing={processing && isSample} />

          <section className="how-strip"><div><span className="eyebrow">A simple three-step print ritual</span><h2>From image to paper, without the busywork.</h2></div><div className="how-steps"><span><b>01</b> Drop in an image</span><ChevronRight size={15}/><span><b>02</b> Tune the dots</span><ChevronRight size={15}/><span><b>03</b> Print & connect</span></div></section>
        </main>
        <footer className="site-footer"><BrandMark compact /><span>Designed for the joy of following a line.</span><span>© DOTART STUDIO</span></footer>
      </div>
    );
  }

  const selectedPath = result?.paths.find((path) => path.id === selectedPathId) ?? null;
  const selectedDotValue = selectedPath?.points.find((dot) => dot.id === selectedDot?.dotId) ?? null;
  const previewUrl = result ? makePreviewUrl(result, settings) : null;

  return (
    <div className="app-shell workspace-shell">
      {topBar}
      <div className="workspace-toolbar">
        <button type="button" className="back-link" onClick={() => setView("landing")}><ArrowLeft size={15} /> Home</button>
        <div className="workspace-file"><span className="file-thumb"><ImageIcon size={15} /></span><span><strong>{metadata?.name ?? "New image"}</strong><small>{metadata ? `${metadata.width} × ${metadata.height} · ${formatBytes(metadata.bytes)}` : "Image details"}</small></span></div>
        <div className="toolbar-actions"><button type="button" className="icon-button" onClick={undo} disabled={!undoStack.length} title="Undo settings" aria-label="Undo settings"><Undo2 size={16} /></button><button type="button" className="icon-button" onClick={redo} disabled={!redoStack.length} title="Redo settings" aria-label="Redo settings"><Redo2 size={16} /></button><button type="button" className="icon-button reset-icon" onClick={resetStudio} title="Reset settings" aria-label="Reset settings"><RotateCcw size={15} /></button><UploadZone compact onFile={(nextFile) => acceptFile(nextFile, true, false)} onSample={runSample} /></div>
      </div>

      {error && <div className="workspace-error"><Info size={15} />{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
      {result && dirty && !processing && <div className="export-warning-banner"><Info size={15}/><div><strong>Showing the previous puzzle</strong><span>Processing settings changed. Regenerate before exporting so the file matches your controls.</span></div></div>}
      {exportWarnings.length > 0 && <div className="export-warning-banner"><Info size={15}/><div><strong>Pre-export quality review</strong><span>{exportWarnings.join(" · ")}</span></div><button type="button" onClick={() => setExportWarnings([])} aria-label="Dismiss export warnings"><X size={14}/></button></div>}

      <main className="workspace-grid">
        <aside className="left-rail"><SettingsPanel settings={settings} onChange={updateSettings} onRegenerate={regenerate} onCancel={cancel} processing={processing} dirty={dirty} progress={progress} stage={stage} /></aside>

        <section className="editor-column">
          <div className="editor-titlebar"><div><span className="eyebrow">02 · Canvas & paths</span><h1>Your puzzle workspace</h1></div><div className="canvas-toggles"><button className={`canvas-toggle${showOriginal ? " active" : ""}`} type="button" onClick={() => setShowOriginal((show) => !show)}><Eye size={14}/> Reference</button><button className={`canvas-toggle${showPaths ? " active" : ""}`} type="button" onClick={() => setShowPaths((show) => !show)}><ScanLine size={14}/> Paths</button><button className={`canvas-toggle${showDots ? " active" : ""}`} type="button" onClick={() => setShowDots((show) => !show)}>Dots</button><button className={`canvas-toggle${settings.showNumbers ? " active" : ""}`} type="button" onClick={() => updateSettings({ ...settings, showNumbers: !settings.showNumbers })}>{settings.showNumbers ? <Eye size={14}/> : <EyeOff size={14}/>} Numbers</button></div></div>

          {!result && processing ? <div className="canvas-empty canvas-loading"><LoaderCircle size={28} className="spin-icon"/><span className="eyebrow">{stage || "Preparing the image"}</span><h2>Following the contours.</h2><p>OpenCV is analyzing this image locally. You can cancel at any time.</p><div className="progress-track large"><span style={{ width: `${Math.max(4, progress * 100)}%` }}/></div><span className="progress-value">{Math.round(progress * 100)}%</span></div> : !result ? <div className="canvas-empty"><span className="empty-mark"><ScanLine size={25}/></span><h2>Ready when you are.</h2><p>Choose an image to detect its first contour paths.</p></div> : <CanvasEditor image={image} result={result} settings={settings} showOriginal={showOriginal} showPaths={showPaths} showDots={showDots} showNumbers={settings.showNumbers} overlayOpacity={overlayOpacity} selectedPathId={selectedPathId} editing={editingDots} onSelectPath={setSelectedPathId} onSelectDot={(pathId, dotId) => setSelectedDot({ pathId, dotId })} onMoveDot={moveDot} />}

          {result && <>
            <div className="canvas-statusline"><span className="status-ready"><Check size={13}/>{processing ? `Updating · ${Math.round(progress * 100)}%` : dirty ? "Previous result · regenerate" : "Contours ready"}</span><span>{result.totalDots.toLocaleString()} dots</span><span>{result.paths.length} separate paths</span><span>{result.processingMs} ms</span></div>
            {showOriginal && <label className="overlay-control"><span>Reference opacity</span><input type="range" min={0} max={0.8} step={0.05} value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.currentTarget.value))}/><span>{Math.round(overlayOpacity * 100)}%</span></label>}
            <div className="comparison-row"><div className="comparison-card"><div className="comparison-heading"><span>ORIGINAL</span><span>{metadata?.width} × {metadata?.height}</span></div>{image && <img src={image.src} alt="Original uploaded image"/>}</div><div className="comparison-card"><div className="comparison-heading"><span>NUMBERED PUZZLE</span><span>{result.totalDots} DOTS · {result.paths.length} PATHS</span></div>{previewUrl && <img src={previewUrl} alt="Numbered paths generated by the local image processor"/>}</div></div>
            {result.warnings.length > 0 && <div className="result-warnings"><Info size={14}/><div>{result.warnings.map((warning) => <p key={warning.code}>{warning.message}</p>)}</div></div>}
          </>}
        </section>

        <aside className="right-rail">
          <section className="panel image-info-panel"><div className="panel-heading"><div><span className="eyebrow">Image & path inspector</span><h2>Structure</h2></div><Activity size={16} className="muted-icon" /></div>
            {metadata ? <div className="image-info-grid"><span>Source</span><strong title={metadata.name}>{metadata.name}</strong><span>Dimensions</span><strong>{metadata.width} × {metadata.height} px</strong><span>Detected</span><strong>{result?.contourCount ?? "—"} contour candidates</strong><span>Processing</span><strong>{result ? `${result.processingMs} ms · local` : processing ? "In progress" : "Waiting"}</strong></div> : <p className="panel-empty-copy">Image dimensions and contour statistics will appear here.</p>}
            <div className="path-list-header">
              <span>ORDERED PATHS</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span>{result?.paths.length ?? 0}</span>
                <button
                  type="button"
                  onClick={filterNoisePaths}
                  title="Remove small noise fragments (<22px perimeter)"
                  disabled={!result || result.paths.length === 0}
                  style={{
                    fontSize: "8px",
                    padding: "2px 6px",
                    background: "#f4f1e8",
                    border: "1px solid #ddd8cc",
                    borderRadius: "3px",
                    cursor: "pointer",
                    color: "#555",
                  }}
                >
                  Clean noise
                </button>
              </div>
            </div>
            <div className="path-list">{result?.paths.slice(0, 60).map((path, index) => <button key={path.id} type="button" className={`path-row${path.id === selectedPathId ? " active" : ""}`} onClick={() => setSelectedPathId(path.id)}><span className="path-marker">{pathMarker(index)}</span><span className="path-name"><strong>{path.kind}</strong><small>{path.closed ? "Closed contour" : "Open contour"} · {Math.round(pathLength(path.points, path.closed))} px</small></span><span className="path-dot-count">{path.points.length}</span></button>)}{result && result.paths.length > 60 && <p className="path-list-overflow">Showing first 60 of {result.paths.length}; all paths remain in the canvas and exports.</p>}{result?.paths.length === 0 && <p className="panel-empty-copy">No strong contours yet. Raise sensitivity or reduce background suppression.</p>}</div>
            {selectedPath && (
              <div className="selected-path-detail">
                <span className="section-label">SELECTED · {selectedPath.kind.toUpperCase()}</span>
                <strong>{selectedPath.points.length} ordered dots</strong>
                <span>
                  Start marker {pathMarker(Math.max(0, result?.paths.findIndex((path) => path.id === selectedPath.id) ?? 0))} · {selectedPath.closed ? "Controlled closure" : "Open path"}
                </span>
                <div className="path-tool-strip">
                  <button type="button" onClick={reversePathDirection} title="Reverse numbering and connection direction">
                    ⇄ Reverse flow
                  </button>
                  <button type="button" className="danger-tool" onClick={deleteSelectedPath} title="Delete this noise path">
                    ✕ Delete path
                  </button>
                </div>
                <button
                  type="button"
                  className={`button ${editingDots ? "button-accent" : "button-light"}`}
                  onClick={() => setEditingDots((active) => !active)}
                  style={{ marginTop: "8px" }}
                >
                  {editingDots ? "Done editing dots" : "Edit dots manually"}
                </button>
                {editingDots && (
                  <div className="manual-edit-row">
                    <button type="button" onClick={addDot} title="Add a dot at the longest segment of this path">
                      + Add dot
                    </button>
                    <button
                      type="button"
                      onClick={removeDot}
                      disabled={!selectedDotValue || selectedPath.points.length <= (selectedPath.closed ? 4 : 2)}
                      title="Remove the selected dot"
                    >
                      − Remove selected
                    </button>
                  </div>
                )}
              </div>
            )}
            {result && result.suppressedPaths && result.suppressedPaths.length > 0 && (
              <details className="advanced-details" style={{ marginTop: "12px" }}>
                <summary>
                  <span>Restorable paths ({result.suppressedPaths.length})</span>
                  <ChevronDown size={14} />
                </summary>
                <div className="suppressed-list">
                  {result.suppressedPaths.slice(0, 15).map((sup) => (
                    <div key={sup.id} className="suppressed-row">
                      <span>{sup.kind} · {Math.round(sup.perimeter)}px · {sup.points.length} dots</span>
                      <button type="button" className="suppressed-restore-btn" onClick={() => restorePath(sup.id)}>
                        + Restore
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>

          <ExportPanel options={exportOptions} onChange={setExportOptions} onPdf={() => void exportFile("pdf")} onPng={() => void exportFile("png")} result={result ?? { width: 1, height: 1, paths: [], totalDots: 0, processingMs: 0, engine: "opencv", warnings: [], contourCount: 0 }} disabled={!result || processing || dirty || exporting} />
          {exporting && <div className="exporting-status"><LoaderCircle size={14} className="spin-icon"/>Preparing a vector-ready file…</div>}
        </aside>
      </main>

      <footer className="workspace-footer"><span><ShieldCheck size={13}/> Image processing remains on this device.</span><span className="footer-status"><i className={processing ? "status-busy" : "status-idle"}/> {processing ? `${stage} · ${Math.round(progress * 100)}%` : dirty ? "Regenerate before exporting" : result ? `Ready · ${result.totalDots} dots · ${result.paths.length} paths · ${metadata?.width} × ${metadata?.height} px` : "Waiting for image"}</span><span>DOTART STUDIO · 01</span></footer>
    </div>
  );
}

function pathIdSafe(pathId: string): string {
  return pathId.replace(/[^a-z0-9-]/gi, "-");
}
