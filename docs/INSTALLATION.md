# DotArt Studio — Installation and deployment

## Requirements

Use Node.js 22 or later and pnpm 11.25.0 (the repository pins its package manager). From the project root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The development server is configured for port 3000. Run the automated unit suite and a strict TypeScript/production build with:

```sh
pnpm test
pnpm build
```

The production build is static output in `dist/`. The build does not need credentials, a server, database, or environment variables. For a static host, run `npm run build` (or `pnpm build`), publish `dist/`, and configure the host's normal SPA fallback to `/index.html` if needed. The application currently declares the single page route `/`; `public/manus-routes.json` is its Webdev route manifest. The generated fictional sample image lives in `public/samples/` and is served as a normal static asset.

### GitHub Pages deployment
The repository is configured with relative base paths (`base: "./"`) and includes an automated GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Push this repository to GitHub.
2. In your GitHub repository, open **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. Any push to `main` (or `master`) will automatically run the unit test suite, build the static output in `dist/`, and publish the site live at `https://<username>.github.io/<repository-name>/`.

## Privacy and processing

Image decoding, orientation-aware preprocessing, contour analysis, path sampling, and PDF/PNG generation run in the browser. User images are not uploaded or persisted by the app. OpenCV.js runs inside a Web Worker so image analysis does not intentionally block the React interface. The app accepts JPEG, PNG, and WebP files up to 25 MB; oversized or unsupported input is rejected with a visible error. Transparent image pixels are composited onto white for contour analysis; transparent PNG output remains available as an export option.

The first version uses deterministic classical-CV heuristics: grayscale and contrast/denoising stages, multi-scale Canny and adaptive-threshold edges, morphological cleanup, contour ranking/deduplication, and curvature-aware ordered-path sampling. It is not a trained semantic segmentation service. Contour categories and background suppression are best-effort heuristics; they cannot guarantee that every eye, finger, facial expression, individual hair strand, clothing fold, or foreground boundary is preserved. Skeletonization and a dedicated learned foreground mask are not currently implemented. Inspect the paths and use the detail/background controls before printing complex images.

A full worker pass currently reruns when processing controls change; reusable intermediate processing stages are not yet cached. The generated puzzle is intended as a practical starting point, not a pixel-faithful tracing guarantee. Dot budgets are guidelines, not hard limits; feature retention and path quality can change the final count. Label placement tries nearby clear space and the export review warns about likely overlaps, but dense paths may still need smaller labels or manual review. The app warns about short paths, suspicious geometry, printable bounds, and label collisions before export.

OpenCV.js is a comparatively large optional client bundle (the current Vite build emits approximately 15.5 MB of JavaScript for the OpenCV module before transfer compression), so first use may take longer than later UI interactions. The browser may need sufficient memory for large source images; resizing limits the working raster.

## Using the app

Drop an image on the landing page or choose it with the file picker, then select a difficulty and tune the dot budget, contour sensitivity, fine-detail preservation, minimum spacing, background suppression, line-art enhancement, and path complexity. Print and label settings control label size/visibility, dot size, print scale, paper/page size, margins, optional reference overlay, answer key, and poster tiling. Settings that affect processing can be regenerated without selecting the file again; display-only changes update immediately.

In the workspace, Reference, Paths, Dots, and Numbers are independent display layers. Scroll to zoom, drag to pan, choose a path in the inspector to highlight it, and optionally add, remove, or reposition points in manual edit mode. Multi-path mode restarts numbering at each lettered path marker. Continuous mode numbers dots globally but still starts each separate path with a visible letter marker; there is never an implicit connecting segment between disconnected contours.

PDF output uses vector dots and labels and supports A4/A3/custom size, portrait/landscape, margins, a faint original overlay, an answer-key page, and 2×2 or 3×3 poster tiling. PNG output has a configurable width, aspect-preserving height, and optional transparent background. For a valid printable layout, reduce print scale or adjust page size/margins if the pre-export review reports artwork outside printable bounds.

## Development and tests

The application is a Vite/React/TypeScript SPA. CV and puzzle geometry are in `src/engine/`; expensive processing lives in `processor.worker.ts`. Vector/SVG, raster PNG, and PDF output are in `src/export/`. Focused tests are in `src/test/` and cover contour ranking/deduplication, adaptive dot placement, path-local/global numbering without accidental joins, warnings, SVG structure, PDF validity, printable bounds, and tiled page count. The bundled anime-style illustration is a real input to the UI's sample workflow; the before/after pane calls the same local worker as user-provided files.

The sample demonstration verifies that the local pipeline runs and that the editor and export workflow work. It does not establish a mathematical contour-similarity score or semantic recognition quality across arbitrary images. For images with detailed or patterned backgrounds, first reduce background suppression or raise contour sensitivity if meaningful details disappear; if noise dominates, raise suppression and inspect the result before exporting.
