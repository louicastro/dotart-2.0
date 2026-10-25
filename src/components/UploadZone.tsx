import { useRef, useState } from "react";
import { ArrowUpRight, ImagePlus, LockKeyhole, Upload } from "lucide-react";

interface UploadZoneProps {
  onFile: (file: File) => void;
  onSample: () => void;
  compact?: boolean;
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? " compact" : ""}`} aria-label="DotArt Studio">
      <svg className="brand-symbol" viewBox="0 0 36 36" aria-hidden="true">
        <path d="M8 25.5C12.1 25.5 11.8 10.4 17.8 10.4S22 25.5 28 25.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="8" cy="25.5" r="2.4" fill="currentColor" />
        <circle cx="17.8" cy="10.4" r="2.4" fill="currentColor" />
        <circle cx="28" cy="25.5" r="2.4" fill="currentColor" />
      </svg>
      <span className="brand-word">DotArt<span>Studio</span></span>
    </span>
  );
}

export default function UploadZone({ onFile, onSample, compact = false }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const acceptFile = (file?: File) => {
    if (file) onFile(file);
  };

  return (
    <div className={`upload-wrap${compact ? " compact-upload" : ""}`}>
      <div
        className={`upload-zone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
        role="button"
        tabIndex={0}
        aria-label="Choose an image or drag and drop one here"
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { acceptFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <span className="upload-icon"><ImagePlus size={22} strokeWidth={1.65} /></span>
        <div className="upload-copy">
          <strong>{compact ? "Replace image" : "Drop an image here"}</strong>
          <span>{compact ? "JPG, PNG, or WebP" : "or choose a file · JPG, PNG, WebP · up to 25 MB"}</span>
        </div>
        <button type="button" className="button button-dark upload-action" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
          <Upload size={15} /> Choose image
        </button>
      </div>
      {!compact && (
        <div className="upload-meta">
          <span><LockKeyhole size={13} /> Processed on this device</span>
          <button type="button" className="text-link" onClick={(event) => { event.stopPropagation(); onSample(); }}>Try the sample <ArrowUpRight size={13} /></button>
        </div>
      )}
    </div>
  );
}
