# WO-023 — Programming: drop on a layer swaps its source, canvas margin around screens, native-size aspect-locked layers

**Status: DONE (2026-11-09; 116 offline tests, mock Chrome, live Screen-3 lock/swap probes restored exactly, live read-only UI)**

Owner (2026-11-09): "i cant overwrite a layer by dropping it on an existing layer. thats why i also need a wider view of the canvas that the screen sits on so i can drag and drop layers onto empty space without overwriting a full screen layer. the layers should be created with sources native resolution and have their aspect locked unless manually unlocked." Follow-up to WO-016.

## Investigation FIRST
- `public/program-stage.js` (WO-016) `ondrop` always called `ctx.drop` → create, so dropping on a layer could never swap its source. The stage covered only the screen rectangle, so with a full-screen layer every drop landed on that layer. `dropWindow` scaled sources down to fit the screen. Layers were created with `locked 0, aspectRatio {5, 0}`, and resize ignored ratio.
- PixelFlow: the editor swaps a layer's source with `replaceLayerSource` → `layers/source`. The lock is a create-time `locked` flag (user default `lockAspectRatio`) plus `aspectRatio {aspectRatio, locked}`, toggled via `layers/aspect-ratio [{layerId, aspectRatio, locked}]` (`layerCreateHandle.ts`, `api/layer/layer.ts:439`). `EAspectValue.OriginalRatio = 8`, `Custom = 5`.
- **Live P20, Screen 3 PVW only, restored exactly:**
  - Creating a 1920×1080 test layer → `8212 … resource not enough`. The 4×MAIN+4×PIP profile has no free layer capacity with the existing Screen 1–3 layers, and nothing was created.
  - On the existing PVW layer (3072×1080, `{5,0}`), `layers/aspect-ratio {8, locked 1}` → the device refit the window to the source ratio: **3240×1080** (source 3072×1024). The lock-to-source ratio is device-enforced.
  - `layers/source` to a 3840×2160 SDI source → `8212 resource not enough`.
  - Restore (source, window, `{5,0}`) verified identical. Resource errors must be explained in plain language.

## What was done
- `public/program-stage.js`:
  - `canvasOf()` adds a 20% canvas margin per side. Stages draw a dashed screen frame inside the canvas, and layers and pointer/drop math use canvas coordinates, so off-screen parts are visible and the margin is empty drop space.
  - Drop on a layer → `ctx.replace` (source swap, target outlined while dragging); Shift-drop always adds.
  - `dropWindow` uses the native source size (fallback 1920×1080), centred on the drop point.
  - `moveWindow`/`snapWindow` take a ratio for aspect-locked layers: corner drag follows the dominant axis with the opposite corner anchored; snapping uses the horizontal edge and derives the height.
- `public/programming-ui.js`: cells, stages and the band height cap use canvas dimensions. Added a replace handler. The inspector gets "Keep aspect ratio", and locked width/height edits keep the ratio. The source hint text is updated.
- `lib/studio-programming.js`:
  - Create sends `locked 1, aspectRatio {8, 1}`; layers expose `aspectLocked`/`aspectMode`.
  - New `aspect` action (`layers/aspect-ratio`, 8 when locking, verified).
  - `resourceHint` turns 8212 "resource not enough" on create/source into: no free layer resources at this size (layer profile), remove a layer, use a smaller layer or source, or change the profile.
- Mock: `behavior.resourceShort` returns the device's 8212.
- CSS: screen frame, replace-target outline, and a small lock corner mark on locked layers.

## What was VERIFIED
- `npm test` 116/116: the create body (native size, `{8,1}`, `locked 1`); lock toggle body and readback; in-place source swap; both resource errors explained; locked resize and snap math; native drop; canvas margins.
- Mock Chrome full flow:
  - a drop into the left canvas margin creates a 1920×1080 `{8,1}` PVW layer centred left of the screen;
  - dropping a second source on that layer swaps its source without creating a layer;
  - the inspector shows Keep aspect ratio checked;
  - off-screen X, Take, presets, lock, MVR and 390px mobile all still pass.
- Live P20: the probes above; read-only UI (`wo023-programming.png`, 0 writes) shows each screen inside its canvas margin.
- Owner QA: drop into the margin and onto a layer on hardware. Note that native-size layers can exceed the 4×MAIN+4×PIP resource budget; the app now says so.
