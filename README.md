# dotart-2.0

> Turn any image into a carefully numbered dot-to-dot puzzle. Private, local-first image processing with print-ready PDF and PNG exports.

## Features

- **Local & Private:** Image processing runs entirely in your browser using OpenCV.js Web Workers—no server uploads or cloud processing.
- **Accurate Contour Detection:** Uses Black Hat morphology and single-scale Canny edge detection to accurately trace dark ink lines, delicate facial features, and hair strands without cel-shading noise.
- **Centerline Alignment:** Automatically unrolls doubled-back boundary loops into clean, single-pass centerlines so dots land directly in the center of the artwork's strokes.
- **Adaptive Dot Sampling:** Preserves sharp corners, inflection points, and curve topology with curvature-aware non-maximum suppression.
- **Interactive Canvas Editor:** Pan, zoom, inspect individual dots, toggle original reference overlays with adjustable opacity, and manually edit dots.
- **Print & Export Ready:** Download vector-capable PDFs (A4, A3, custom, multi-page poster tiling, optional answer key) and high-resolution PNGs.
- **GitHub Pages Ready:** Configured with relative base paths and an automated GitHub Actions deployment workflow.

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run unit tests
npm test

# Build production bundle
npm run build
```

## GitHub Pages Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Push this repository to GitHub:
   ```bash
   git push -u origin main
   ```
2. In your repository on GitHub, go to **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The site will automatically build and publish to `https://louicastro.github.io/dotart-2.0/`.
