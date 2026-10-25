import { ArrowRight, ScanLine, ShieldCheck } from "lucide-react";
import { buildPuzzleSvg } from "../export/exporter";
import type { ProcessingSettings, PuzzleResult } from "../engine/types";

export const SAMPLE_IMAGE_URL = `${import.meta.env.BASE_URL}samples/dotart-character-sample.webp`;

interface SampleGalleryProps {
  onTrySample: () => void;
  onOpenSample: () => void;
  sampleResult: PuzzleResult | null;
  settings: ProcessingSettings;
  processing: boolean;
}

export default function SampleGallery({ onTrySample, onOpenSample, sampleResult, settings, processing }: SampleGalleryProps) {
  const svg = sampleResult ? buildPuzzleSvg(sampleResult, settings, { transparent: false }) : null;
  const previewUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  return (
    <section className="sample-gallery" aria-labelledby="sample-title">
      <div className="sample-intro">
        <span className="eyebrow">See the process</span>
        <h2 id="sample-title">From a full illustration<br />to a trail of dots.</h2>
        <p>Run a richly detailed character sample through the same local contour engine used for your images—no pre-rendered demo result.</p>
        <button className="text-link sample-cta" type="button" onClick={sampleResult ? onOpenSample : onTrySample} disabled={processing}>
          {processing ? "Tracing sample locally" : sampleResult ? "Open sample in studio" : "Run the sample"} <ArrowRight size={15} />
        </button>
      </div>
      <div className="sample-pair">
        <div className="sample-card sample-before"><img src={SAMPLE_IMAGE_URL} alt="Fictional anime character with long hair, phone, clothing details, and a cafe background" /><span className="sample-caption"><span>01</span> Original illustration</span></div>
        <div className={`sample-after${sampleResult ? " has-result" : ""}`}>
          <div className="sample-after-top"><ScanLine size={14} /><span>Processed contours</span>{sampleResult && <span className="sample-live-pill">LIVE</span>}</div>
          {previewUrl ? <img className="sample-result-img" src={previewUrl} alt="Real numbered dot-to-dot output generated from the sample illustration" /> : <div className="sample-empty-result">{processing ? <><span className="sample-spinner" />OpenCV is tracing edges and placing dots…</> : <><span className="sample-placeholder-mark"><ScanLine size={20} /></span><span>Run the sample to see its actual numbered contours</span></>}</div>}
          <div className="sample-caption"><span>02</span> Numbered contours</div>
          <div className="sample-privacy"><ShieldCheck size={13} /> {sampleResult ? `${sampleResult.totalDots} dots · ${sampleResult.paths.length} independent paths` : "Generated in your browser"}</div>
        </div>
      </div>
    </section>
  );
}
