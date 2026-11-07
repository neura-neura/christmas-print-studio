# Christmas Print Studio — Web

A responsive, static production planner for **Bambu Lab A1** ornaments and standalone names. All geometry is generated in the browser with WebAssembly; no server, account, or native application is required.

**[Live website](https://neura-neura.github.io/christmas-print-studio/)** · [Repository overview](../README.md) · [Mac downloads](https://github.com/neura-neura/christmas-print-studio/releases/latest)

The interface is in Spanish. Technical documentation is in English.

## Run locally

Use Node.js 24 or later:

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

The build is emitted to `dist/`. Serve it over HTTP/HTTPS rather than opening `index.html` directly. Font files, model assets, the WASM engine, and interface fonts are bundled locally.

## Production workflow

1. Select **Esfera con nombre** (named ornament), **Esfera con foto** (photo ornament), or **Nombre solo** (standalone name).
2. Enter one name or paste a list, one name per line. Set quantities and optional decorations.
3. Review the live preview and add the designs to the order. Tap a product's **Editar diseño** control to edit an existing design.
4. The planner automatically redistributes the order across plates. Capacity suggestions describe additional copies of designs already in the order; the suggestions are alternatives, not guaranteed to fit simultaneously.
5. Download one 3MF per plate or a ZIP of all plates. A downloaded plate is marked with a check and the next plate is selected.
6. Open each 3MF in Bambu Studio, retain 100% global scale, confirm **A1 / 0.4 mm / PLA High Speed / textured PEI**, then **slice before printing**.
7. **Retirar placas descargadas y seguir** removes the downloaded products from the pending order. Downloading a file does not start a physical print or confirm that it has printed.

Orders and unfinished designs are saved automatically in browser local storage on every edit and restored when the page is reopened. This includes quantities, selected parts, scale/position adjustments, in-progress edits (with cancel restoration), and unfinished batch-name lists. Existing session drafts migrate automatically. Export/import JSON to transfer an order between devices. There is no server synchronization. Each order is limited to 100 products.

## Packing

- Nominal bed: **256 × 256 mm**.
- Perimeter margin: **6 mm**.
- Minimum footprint-to-footprint gap: **3 mm**.
- No size changes during packing. Parts are translated and rotated in-plane by quarter turns.
- Named ornaments remain assemblies. Front and back of a photo ornament are separate physical units but must stay on the same plate.
- Six deterministic MaxRects variants are compared to reduce rejected parts and plate count.
- Layout validation checks bounds, spacing, reservations, and preservation of all requested units.
- Footprints are conservative **rectangles**. The algorithm does not nest inside holes or use concave contour interlocking. It is not a proof of a globally optimal packing.
- Occupancy means reserved footprint area, not solid material volume.
- Invalid designs block order export instead of silently omitting requested products.

Batching reduces preparation operations but does not guarantee a shorter total print time for every combination. Printer startup purging remains enabled.

## Model details

### Named ornament

The ring's nominal inner diameter is **70 mm**. Names retain their proportions and are connected to both sides. Letters, dots, and accents are connected with recessed bridges. The bow and each snowflake can be enabled, resized, and positioned independently. A boolean connectivity check rejects detached results.

### Photo ornament

The supplied `ornament_frame_v1.3mf` is included through the browser asset bundle. Its original scale and fitting geometry are retained.

The original mesh contains three disconnected components: back, front, and hanging loop. The production web model adds a recessed **2 × 0.4 × 1.4 mm** connection at the loop to bridge an approximately **0.0042 mm** gap. It therefore packs as two physical units: front with loop, and back. Both stay on the same plate.

The native macOS app preserves the prepared original photo project; this small production connectivity correction is specific to the web asset preparation.

### Standalone name

The same font is uniformly scaled in X and Y; letters are never stretched to fill a rectangle. The automatic size targets **14,000 mm³** of geometric volume, subject to maximum dimensions of **200 mm width / 100 mm height**. Medium-length names are not forced to reach a limit. Very long names can have a lower volume when constrained by width.

Thickness is 4 mm, with recessed 1.2 mm connection bridges. Manual size adjustment reduces the balanced result to 25–100%. Geometric volume is not identical to filament weight; actual weight depends on slicing, walls, infill, and auxiliary paths.

OpenType.js applies kerning and ligatures. Small outline differences from the native HarfBuzz-based engine are possible.

## Print profile

Generated 3MFs use the balanced **A1 / 0.4 mm / Generic PLA High Speed / textured PEI** profile. It prints by layer with 0.20 mm layers, two walls, four top layers, three bottom layers, and 8% gyroid infill. Supports, raft, brim, skirt, ironing, and prime tower are disabled. Startup purge operations are preserved.

The site exports **arranged projects, not G-code**. It does not send jobs to a printer or fabricate filament/time estimates. Bambu Studio provides final estimates after slicing.

## Mobile and desktop interaction

- Single-column layout up to 900 px, side-by-side workspace on larger screens.
- Buttons have at least 44 × 44 px targets, usually 48 px; full ornament-option labels are tappable.
- Mobile fields use 16 px text and numeric/decimal keyboards where appropriate. Browser accessibility zoom is not disabled.
- Plus/minus controls adjust size and position in precise steps, including 0.1 mm positioning.
- Expanded preview supports 1×–5× visual zoom, two-pointer pinch, drag, and reset. Visual zoom never changes model dimensions.
- On touch layouts, 3D starts with vertical page scrolling available. **Girar / acercar** enables model interaction; **Terminar giro** restores page scrolling.
- A fixed plate shortcut is hidden when the software keyboard is detected.
- Persistent draft recovery after closing the page, cancel-edit restoration, and a 10-second undo action after removing a product.
- Model tabs support arrow keys, Home, and End; focus is visible and reduced-motion preferences are respected.
- On mobile, Enter/Done finishes a field without accidentally submitting a product. Desktop form keyboard submission remains available.

Layout measurements were checked at 320, 390, 768, and 1440 px with no horizontal overflow or visible buttons smaller than 44 × 44 px. Button zoom, pointer drag, step controls, draft recovery, cancellation, undo, and 3D scroll opt-in were checked in a browser. Real iPhone/Android multi-touch hardware and software keyboards still require device-level verification; the available test browser cannot inject multi-touch gestures.

A modern browser with WebAssembly is required. The optional 3D view uses WebGL; the 2D plate view remains available without WebGL. Mobile downloads may use the operating system's Files/share interface.

## GitHub Pages

For this repository, [the root workflow](../.github/workflows/pages.yml) builds `web/` and uploads `web/dist/`. In repository Settings → Pages, select **GitHub Actions**.

If distributing this directory as a standalone repository, copy [`docs/pages-standalone.example.yml`](docs/pages-standalone.example.yml) to `.github/workflows/pages.yml` and use it as the workflow instead.

Relative asset URLs support both a repository subpath and a custom-domain root. No repository secrets or backend environment variables are needed.

## Files

| File | Purpose |
| --- | --- |
| `src/geometry.js` | Font outlines, uniform sizing, bridges, booleans, connectivity, and browser meshes. |
| `src/packing.js` | Deterministic packing, grouped photo products, validation, and remaining capacity. |
| `src/export3mf.js` | One-plate Bambu projects and ZIP export. |
| `src/engine.worker.js` | Background WASM generation, cache, and export. |
| `src/main.js` / `src/style.css` | Order editor, touch/keyboard controls, persistence, SVG and Three.js views. |
| `public/models/` | Preloaded models, font, and asset license notice. |
| `tests/` | Geometry, packing, clearance, grouping, invalid input, and export regressions. |

Export tests write sample plates to `../build/qa/web/`, which is excluded from publication.

## Asset rights

Preloaded resources retain their own licenses and are **not automatically open-source or commercially licensed**:

- Named ornament: AVLR 3D STUDIO; original metadata specifies **BY-NC-ND**.
- Photo ornament: Craftastic; original metadata specifies **MakerWorld Exclusive License**.
- Cream Cake Bold: Ef Studio; supplied notice specifies **personal use only** and a separate commercial license for sales. See [`public/models/FONT-LICENSE.txt`](public/models/FONT-LICENSE.txt).

Publication does not extend those permissions. Users/distributors must obtain the rights required for their intended use. Attributions are retained in the asset bundle and displayed by the site. See [third-party notices](THIRD_PARTY_NOTICES.md) and [complete bundled library notices](public/THIRD_PARTY_LICENSES.txt).

## Verification limits

Code and slicing checks reduce preparation errors but do not replace a physical validation print. Adhesion, moisture, calibration, and filament variability still depend on the printer. No automated physical print has been started by this project.
