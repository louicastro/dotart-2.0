# DotArt Studio — Approved implementation plan and delivered architecture

## Approved scope and trade-off

Build a responsive, browser-first React/TypeScript application for turning user-selected JPEG, PNG, and WebP images into numbered dot-to-dot worksheets. The user approved a local-first classical-computer-vision implementation: normal image handling stays on the device; no server, database, account system, image upload, learned segmentation service, or provider key is required. Semantic preservation—eyes, fingers, individual hair strands, expressions, and other landmarks—is best-effort, not guaranteed. This limitation is disclosed in the application and installation guide.

## Implementation approach

The interface includes an editorial landing page with drag/drop and file selection, an actual fictional anime-style sample, and a three-part workspace. The sample illustration has long hair, facial details, a phone, clothing, and a detailed background. The landing comparison generates its result with the same image processor used by local uploads rather than a mock.

OpenCV.js is loaded by a Web Worker. The staged local pipeline corrects orientation, bounds image size, preserves aspect ratio, normalizes and denoises grayscale pixels, combines multi-scale Canny and adaptive threshold edges, performs morphological cleanup, extracts and ranks ordered contours, suppresses low-priority candidates, and samples dots by contour geometry. Closed contours require at least six generated dots; open contours require at least two. The target budget is a guideline. Contour classes (silhouette, facial, clothing, object, detail) are heuristic; skeletonization, learned foreground masks, and dedicated semantic landmark detection are not implemented. Progress and cancellation are reported to the UI.

Every contour remains a distinct ordered path; no global X/Y sort or arbitrary path join is used. The path model retains closure state and a lettered start. Multi-path mode restarts its number sequence at each start marker. Continuous-number mode keeps a global sequence but still marks the start of every disconnected contour. Settings include the four requested difficulty bands and Custom; processing controls affect the worker, display changes update the view, and a changed processing result must be regenerated before export. Processing stages are not currently cached between full worker runs.

The editor provides independent Reference, Paths, Dots, and Numbers visibility, a reference-opacity control, zoom/pan, current-path highlighting, per-dot inspection, image/path/dot statistics, optional manual add/remove/reposition, and side-by-side original/result. Configuration changes can be undone/redone. The responsive workspace places settings, canvas, and image/path/export inspectors in three rails on larger screens and adapts for smaller screens.

SVG is the shared drawing representation. Browser-local export creates vector-capable PDF or crisp PNG, with A4/A3/custom dimensions, portrait/landscape, aspect-preserving fit, margins, clear per-path instructions, optional faint reference overlay, answer key, and tiled posters. Label placement scores nearby-dot clearance and page margins; an export review warns about likely remaining label collisions, short paths, invalid/unassigned geometry, and out-of-printable bounds.

## Project structure

- `src/app/` — main React app, landing/workspace flow, local state, generation lifecycle, history, editing, and download actions.
- `src/components/` — upload zone, sample gallery, settings, Canvas editor, and export controls.
- `src/engine/` — image/puzzle data types, OpenCV worker/client, contour classification/ranking, ordered numbering, geometry utilities, and adaptive sampling.
- `src/export/` — label placement, vector/SVG, PNG canvas rendering, PDF layout, answer key, poster tiling, and pre-export checks.
- `src/styles/` — global design tokens, Tailwind entry/configuration, editorial landing, and responsive workspace styles.
- `src/test/` — Vitest coverage for contour utilities, sampling, path numbering/connectivity, and export/print boundaries.
- `public/manus-routes.json` — single application-page route manifest.
- `public/samples/` — fictional sample illustration used by the local demonstration.
- `docs/INSTALLATION.md` — installation, build/deployment, privacy, algorithm limitations, usage, and tests.
- `plan.md` and `TODO.md` — approved technical/design plan and evidence-based delivery outcomes.

## Dependencies, serving, and design

Use Vite, React, TypeScript, Tailwind CSS, OpenCV.js, lucide-react, jsPDF, and Vitest. The project pins pnpm 11.25.0 and declares lifecycle-script handling before installation. The application serves on the initialized Preview port 3000. `public/manus-routes.json` declares `/`. Static build output is `dist/`; no backend or database is enabled. Preview and a clean static build are in scope; external publication is not requested.

Three low-probability alternatives considered: Swiss poster workshop — 0.074; quiet scientific field notebook — 0.029; playful picture-book craft — 0.061. **Selected: Swiss poster workshop**, expressed as a modern printmaking studio rather than a generic SaaS dashboard.

- **Design Movement:** Swiss modernist print and editorial typography, softened by the physical tactility of a worksheet.
- **Core Principles:** Make the image the hero; make every control's effect legible; use print-like precision; keep the workspace calm even when settings are dense.
- **Color Philosophy:** Warm paper and graphite create a trustworthy drawing surface; clear vermilion-orange marks active paths and primary actions; muted sage is reserved for successful processing. Signature brand color: vermilion `#E45A3A`.
- **Layout Paradigm:** Editorial, left-anchored landing page with a generous upload field; three-part settings/canvas/inspector workspace, collapsing into focused responsive controls.
- **Signature Elements:** Small registration/crosshair marks around the canvas; path-start tokens like print-shop proof marks; a fine contour-thread motif indicating ordered paths.
- **Interaction Philosophy:** Preview before commitment, direct manipulation for pan/zoom/inspection, reversible settings, and explicit path breaks rather than implicit connections.
- **Animation:** Restrained 160–220 ms state transitions; no looping decoration; actual staged progress; no dense-canvas redraw animation.
- **Typography System:** DM Sans for interface/headlines and DM Mono for measurements, dot IDs, and path statistics.
- **Brand Essence:** A private-by-default print studio for turning personal images into connect-the-dots puzzles; precise, welcoming, inventive.
- **Brand Voice:** Confident, plainspoken, craft-oriented. Example: “Turn Any Image Into a Dot-to-Dot Masterpiece.” Example: “Your image stays on this device. Tune the detail, then print.”
- **Wordmark & Logo:** The app uses an inline custom DotArt wordmark and three dots joined by a fine contour stroke; platform logo metadata is maintained separately.

## Delivery evidence and known limitations

The strict TypeScript check and Vite production build pass; all 16 unit tests pass. `/manus-routes.json` returns the single `/` route. The bundled sample runs through the actual worker in Preview and yields independent paths. Browser downloads were inspected: the PDF is a valid one-page A4 portrait document and PNG is 3,000 × 4,000. Unit tests also verify four tiled poster pages plus a separate answer-key page. The acceptance matrix, partial items, sample evidence, and exact limitations remain in `TODO.md`.
