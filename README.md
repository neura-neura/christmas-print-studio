# Christmas Print Studio

A Christmas-themed production planner for the **Bambu Lab A1**, with a touch-friendly web app and a native macOS application.

**[Open the web app](https://neura-neura.github.io/christmas-print-studio/)** · **[Download for Mac](https://github.com/neura-neura/christmas-print-studio/releases/latest)** · [Web documentation](web/README.md)

## What it makes

| Model | Features |
| --- | --- |
| Named ornament | Fixed **70 mm inner ring diameter**, proportional lettering, editable bow and snowflakes, and automatic connections to the ring. |
| Photo ornament | Front with hanging loop and matching back panel. The web planner keeps the complete set on the same plate. |
| Standalone name | Undistorted lettering, connected dots and accents, a balanced reference volume, and maximum dimensions of **200 mm wide × 100 mm high**. These are limits, not a fixed rectangle to fill. |

The interface is currently in Spanish. This README and the technical documentation are in English.

## Web production planner

- Preloaded models and font; no import kit required.
- Generate previews while typing, add individual names or a list, and choose quantities.
- Automatically arrange mixed orders across as many A1 plates as needed.
- Keep model dimensions unchanged during packing; only translate and rotate in the plate plane.
- Reserve **6 mm around the bed** and **3 mm between part footprints**.
- Show plate occupancy, remaining-capacity suggestions, and per-design errors.
- Download a **3MF per plate** or a ZIP containing all plates.
- Save and restore orders as JSON. Order data stays in the browser; no backend or account is required.
- Touch-first controls, large previews, visual zoom/pan, precise adjustment buttons, optional 3D interaction, keyboard navigation, undo, and recoverable drafts.

The planner uses conservative rectangular footprints and compares multiple deterministic packing heuristics. It avoids overlap but does **not** claim a mathematical global optimum or fill holes inside other products. Remaining-capacity suggestions are alternatives, not quantities guaranteed to fit simultaneously.

### Printing

Open each downloaded 3MF in **Bambu Studio**, keep global scale at **100%**, confirm the printer/material/plate, and **slice before printing**. The website exports arranged projects, not printer-ready G-code, and never starts a print automatically.

Generated names and named ornaments use the balanced **A1 / 0.4 mm nozzle / Generic PLA High Speed / textured PEI** profile:

- 0.20 mm layers, including the first layer.
- Two walls, four top layers, three bottom layers, and 8% gyroid infill.
- No supports, raft, brim, skirt, ironing, or prime tower.
- Conservative first-layer and visible-surface speeds.
- 220°C nozzle and 65°C textured plate; normal machine startup purging is retained.

Final material use and printing time are calculated by Bambu Studio. Calibration, adhesion, filament condition, and a physical first-print check still matter.

## Native macOS app

Download the DMG from **[Releases](https://github.com/neura-neura/christmas-print-studio/releases/latest)**, open it, and drag **Esferas.app** into **Applications**. A separate ZIP of the application is also provided.

**Requirements:** Apple Silicon Mac, macOS 14 or later. The Python runtime, geometry libraries, and font are bundled; Python and Homebrew are not required on the target machine. The app is locally/ad-hoc signed, **not Developer ID signed or Apple-notarized**.

The Mac app includes the three model types, a live native 3D preview, editable dimensions/positions, a save-location dialog, and temporary 3MF handoff to Bambu Studio. Batch plate production and the latest touch-oriented workflow are features of the web version. The bundled Mac version is **2.4.0**.

The native photo-ornament mode preserves the supplied prepared project. The web version adds a tiny recessed connection at the hanging loop before treating the front and back as separate packing units; see the [web documentation](web/README.md).

## Development

### Web

Use **Node.js 24 or later**:

```sh
cd web
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

The production site is `web/dist/`. It works on static hosting, including a GitHub Pages repository subpath. Serve it over HTTP/HTTPS; opening `index.html` with `file://` is not supported by the worker/WASM pipeline.

### macOS

Use Python 3.14 and Apple's Command Line Tools:

```sh
python3.14 -m venv .venv
.venv/bin/pip install -r requirements-lock.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/build.py
```

The script creates `dist/Esferas-2.4.0-arm64.dmg` without installing it. It builds the standalone engine with PyInstaller, compiles the AppKit/SceneKit application, signs it locally, and creates and verifies a drag-to-Applications disk image.

To regenerate the browser model bundle from the native resources:

```sh
.venv/bin/python scripts/prepare_web_assets.py
```

To package the built website and source:

```sh
.venv/bin/python scripts/package_web.py
```

## Repository layout

```text
Sources/App/              Native AppKit and SceneKit interface
Sources/Engine/           Python geometry and 3MF generation engine
Resources/                Native templates, font, and print profile
scripts/                  App, asset, and website packaging scripts
tests/                    Native geometry and project regression tests
web/src/                  Browser geometry, packing, 3MF export, and UI
web/public/               Preloaded browser assets and license notices
web/tests/                Browser-engine, packing, and export regression tests
.github/workflows/        GitHub Pages build and deployment
```

Generated builds, local orders, screenshots, virtual environments, dependencies, and release binaries are excluded from Git. Binary downloads are attached to Releases.

## Deployment

The root [Pages workflow](.github/workflows/pages.yml) installs web dependencies, runs tests, builds `web/dist`, and deploys through GitHub Actions. In repository **Settings → Pages**, the source must be **GitHub Actions**.

The website uses relative asset URLs and requires no repository secrets. It processes customer names and geometry locally and does not upload orders to a server.

## Verification

- Native regression tests cover connected geometry, accents, sizes, saved parameters, and the 70 mm ring.
- Web tests cover WASM geometry, closed/connected meshes, unsupported input, mixed-order export, grouped photo products, clearances, deterministic packing, oversize rejection, and randomized batches.
- Sample mixed-plate 3MFs were opened and sliced successfully in Bambu Studio without slicing warnings.
- Layout/control measurements were checked at 320, 390, 768, and 1440 px. Physical iPhone/Android pinch gestures and physical prints have not been certified by these automated checks.

## Models, font, and third-party rights

The included assets keep their **original licenses**. Publishing this repository does not grant additional commercial, redistribution, or derivative-work rights:

| Asset | Attribution / supplied notice |
| --- | --- |
| Named ornament template | AVLR 3D STUDIO; original 3MF metadata specifies **BY-NC-ND**. |
| Photo ornament template | Craftastic; original 3MF metadata specifies **MakerWorld Exclusive License**. |
| Cream Cake Bold | Ef Studio; the supplied notice states **personal use only** and requires an additional commercial license for sales. See [the supplied font notice](Resources/License%20-%20READ%20THIS.txt). |

Users and distributors must obtain any permissions required for their intended use. This project does not relicense those assets as open-source resources. See [third-party notices](web/THIRD_PARTY_NOTICES.md) and the [bundled library licenses](web/public/THIRD_PARTY_LICENSES.txt).
