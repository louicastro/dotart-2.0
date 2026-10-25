import { useCallback, useEffect, useRef, useState } from "react";
import { computeLabelOffset, createDotSpatialGrid } from "../engine/geometry";
import { numberPaths, pathMarker } from "../engine/numbering";
import type { ProcessingSettings, PuzzleResult } from "../engine/types";

interface CanvasEditorProps {
  image: HTMLImageElement | null;
  result: PuzzleResult;
  settings: ProcessingSettings;
  showOriginal: boolean;
  showPaths: boolean;
  showDots: boolean;
  showNumbers: boolean;
  overlayOpacity: number;
  selectedPathId: string | null;
  editing: boolean;
  onSelectPath: (pathId: string) => void;
  onSelectDot: (pathId: string, dotId: string) => void;
  onMoveDot: (pathId: string, dotId: string, x: number, y: number) => void;
  onSetOverlayOpacity?: (opacity: number) => void;
}

interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export default function CanvasEditor({
  image,
  result,
  settings,
  showOriginal,
  showPaths,
  showDots,
  showNumbers,
  overlayOpacity,
  selectedPathId,
  editing,
  onSelectPath,
  onSelectDot,
  onMoveDot,
  onSetOverlayOpacity,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ kind: "pan" | "dot"; x: number; y: number; panX: number; panY: number; pathId?: string; dotId?: string } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !container || !context) return;
    const bounds = container.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.fillStyle = "#fffefa";
    context.fillRect(0, 0, bounds.width, bounds.height);

    const fitScale = Math.min((bounds.width - 64) / result.width, (bounds.height - 64) / result.height);
    const scale = Math.max(0.05, fitScale * zoom);
    const width = result.width * scale;
    const height = result.height * scale;
    const offsetX = (bounds.width - width) / 2 + pan.x;
    const offsetY = (bounds.height - height) / 2 + pan.y;
    transformRef.current = { scale, offsetX, offsetY, width, height };

    context.save();
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    if (showOriginal && image) {
      context.globalAlpha = overlayOpacity;
      context.drawImage(image, 0, 0, result.width, result.height);
      context.globalAlpha = 1;
    }

    if (showPaths) {
      result.paths.forEach((path) => {
        if (path.points.length < 2) return;
        context.beginPath();
        context.moveTo(path.points[0].x, path.points[0].y);
        for (let index = 1; index < path.points.length; index += 1) context.lineTo(path.points[index].x, path.points[index].y);
        if (path.closed) context.closePath();
        context.strokeStyle = path.id === selectedPathId ? "rgba(228,90,58,.72)" : "rgba(48,51,48,.26)";
        context.lineWidth = path.id === selectedPathId ? 1.7 / scale : 0.9 / scale;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
      });
    }

    const numberPlan = numberPaths(result.paths, settings.pathMode);
    const labelLookup = new Map(numberPlan.points.map((item) => [item.dotId, item]));
    const dotRadius = Math.max(2.2 / scale, (settings.dotSize * 0.95) / scale);
    const fontSize = Math.max(6.8, settings.labelSize * 0.75) / scale;
    const labelGrid = settings.showNumbers
      ? createDotSpatialGrid(result.paths.flatMap((p) => p.points), settings.labelSize)
      : undefined;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${fontSize}px "DM Mono", monospace`;
    result.paths.forEach((path, pathIndex) => {
      const active = path.id === selectedPathId;
      const dotFillColor = active ? "#e45a3a" : (settings.dotColor || "#222522");
      path.points.forEach((dot, index) => {
        if (showDots) {
          context.beginPath();
          context.arc(dot.x, dot.y, dotRadius * (active ? 1.16 : 1), 0, Math.PI * 2);
          context.fillStyle = dotFillColor;
          context.fill();
        }
        if (showNumbers && settings.showNumbers) {
          const label = labelLookup.get(dot.id)?.label ?? index + 1;
          const marker = pathMarker(pathIndex);
          const text = index === 0 ? `${marker}·${label}` : String(label);
          const offset = computeLabelOffset(
            path.points,
            index,
            settings.labelSize,
            { width: result.width, height: result.height },
            dot.id,
            labelGrid,
          );
          context.fillStyle = active ? "#ae412c" : "#333531";
          context.fillText(text, dot.x + offset.x, dot.y + offset.y + fontSize * 0.33);
        }
        if (showDots && index === 0) {
          context.beginPath();
          context.arc(dot.x, dot.y, dotRadius * 2.3, 0, Math.PI * 2);
          context.strokeStyle = active ? "#e45a3a" : (settings.dotColor || "rgba(36,38,36,.55)");
          context.lineWidth = 1.2 / scale;
          context.stroke();
        }
      });
    });
    context.restore();

    context.fillStyle = "rgba(36,38,36,.58)";
    context.font = "11px 'DM Mono', monospace";
    context.textAlign = "left";
    context.fillText(`${Math.round(zoom * 100)}%`, 15, bounds.height - 16);
  }, [image, overlayOpacity, pan.x, pan.y, result, selectedPathId, settings, showDots, showNumbers, showOriginal, showPaths, zoom]);

  useEffect(() => {
    render();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(render);
    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  const toImagePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const transform = transformRef.current;
    return {
      x: Math.max(0, Math.min(result.width, (event.clientX - rect.left - transform.offsetX) / transform.scale)),
      y: Math.max(0, Math.min(result.height, (event.clientY - rect.top - transform.offsetY) / transform.scale)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toImagePoint(event);
    const transform = transformRef.current;
    let nearest: { pathId: string; dotId: string; distance: number } | null = null;
    if (showDots) {
      for (const path of result.paths) {
        for (const dot of path.points) {
          const d = Math.hypot(dot.x - point.x, dot.y - point.y) * transform.scale;
          if (d < 18 && (!nearest || d < nearest.distance)) nearest = { pathId: path.id, dotId: dot.id, distance: d };
        }
      }
    }
    if (nearest) {
      onSelectPath(nearest.pathId);
      onSelectDot(nearest.pathId, nearest.dotId);
      if (editing) {
        dragRef.current = { kind: "dot", x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, pathId: nearest.pathId, dotId: nearest.dotId };
        return;
      }
    }
    dragRef.current = { kind: "pan", x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
    if (drag.kind === "dot" && drag.pathId && drag.dotId) {
      const point = toImagePoint(event);
      onMoveDot(drag.pathId, drag.dotId, point.x, point.y);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setZoom((current) => Math.max(0.45, Math.min(5, current * (event.deltaY < 0 ? 1.12 : 0.89))));
  };

  return (
    <div className="canvas-shell">
      <div className="canvas-topline">
        <span>
          <span className="canvas-swatch" style={{ background: settings.dotColor || "var(--accent)" }} />{" "}
          {showPaths ? "Contour paths" : "Numbered dots"}
        </span>
        <span>{result.width} × {result.height} px</span>
      </div>
      <div className={`canvas-stage${editing ? " is-editing" : ""}`} ref={containerRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Interactive dot-to-dot puzzle canvas. Scroll to zoom and drag to pan; select a dot to inspect its path."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onWheel={handleWheel}
        />
        {editing && <div className="canvas-edit-badge">Dot edit · drag a dot to reposition</div>}

        <div className="canvas-view-controls">
          <button
            type="button"
            className="canvas-stage-btn"
            onClick={() => setZoom((z) => Math.min(5, Math.round(z * 1.25 * 100) / 100))}
            title="Zoom in view (+)"
            aria-label="Zoom in view"
          >
            +
          </button>
          <span className="canvas-zoom-pill">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="canvas-stage-btn"
            onClick={() => setZoom((z) => Math.max(0.35, Math.round((z / 1.25) * 100) / 100))}
            title="Zoom out view (−)"
            aria-label="Zoom out view"
          >
            −
          </button>
          <button
            className="canvas-stage-btn"
            type="button"
            style={{ width: "auto", padding: "0 6px", fontSize: "9px" }}
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            aria-label="Reset canvas zoom and pan"
            title="Reset canvas view"
          >
            Reset
          </button>
        </div>

        {showOriginal && image && onSetOverlayOpacity && (
          <div className="canvas-overlay-floating">
            <span>Reference {Math.round(overlayOpacity * 100)}%</span>
            <div className="canvas-overlay-stepper">
              <button
                type="button"
                onClick={() => onSetOverlayOpacity(Math.max(0.05, Math.round((overlayOpacity - 0.1) * 100) / 100))}
                title="Decrease reference view opacity (-10%)"
                disabled={overlayOpacity <= 0.05}
                aria-label="Decrease reference view opacity"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onSetOverlayOpacity(Math.min(1.0, Math.round((overlayOpacity + 0.1) * 100) / 100))}
                title="Increase reference view opacity (+10%)"
                disabled={overlayOpacity >= 1.0}
                aria-label="Increase reference view opacity"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="canvas-footline"><span>Wheel to zoom · drag to pan</span><span>{settings.pathMode === "multi" ? "Lettered paths restart at 1" : "Global numbering · paths stay separate"}</span></div>
    </div>
  );
}
