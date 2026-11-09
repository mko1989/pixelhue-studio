# WO-016 — Programming: multi-screen PGM-over-PVW, drag-drop sources, free layer roaming, presets; Screens: true aspect and output adding

**Status: DONE (2026-11-09; 107 offline tests, mock Chrome drag-drop/multi-screen/preset flow, live read-only P20 Chrome; physical preset save/load/rename/delete and off-screen layer writes are owner QA)**

Owner (2026-11-09): "the display of the screens is always in the same wide aspect ratio / no option to add outputs to a screen / drag and drop doesnt work for input -> layers in programming / should be prv bottom pgm top / can move a layer outside of the screen / i cant display multiple screens / no presets." Clarified: "allow moving outside of the screen borders entirely, like in pixelflow. i want all the capabilities of pixelflow programming but in an easier snappier env." Follow-up to WO-014 (Screens/Programming foundation). No earlier preset WO (`rg -il preset work/work-orders/` hits only input EDID presets and the API catalog).

## Investigation FIRST

Live P20 192.168.0.7, read-only, with Chrome screenshots at 1920×1080 and every PUT blocked (`/private/tmp/pixelhue-browser-qa/wo016-*-before.png`).

### Screens aspect
- `public/studio.css` `.screen-map { width: 100%; max-height: 480px }` plus inline `aspect-ratio`. Once full width would be taller than 480px, height is capped and width stays 100%. Live Screen 1 (3072×1024, 3:1) renders 1648×478 (3.45:1), and every 16:9 screen renders at the same ~3.4:1. **Root cause: the max-height clamp breaks the aspect ratio.**

### Adding outputs
- `public/screens-ui.js` puts mapping behind an unlabeled checkbox per output row, and then X/Y/W/H must be typed. The live device has free outputs (OUTPUT 2-3 id 7, OUTPUT 4-7 id 11, both wm0), but there is no explicit "add" action. Adding at 0,0 overlaps the existing tile and never grows the screen, so the server rejects anything past the screen edge ("Output tiles must fit inside their screen").
- Live `screen/list-detail`: Screen 1 has mosaic type 2 with one 3072×1024 output; Screen 2 is type 0; Screen 4 is 0×0 with no outputs (normalised to a 1920 fallback).

### Programming layout, drag-drop, multi-screen
- `public/programming-ui.js` shows one screen chosen in a select, with PGM and PVW side by side (`.program-views` 2-column grid). Sources are click-to-select plus "Add layer"; no element is `draggable` and no stage handles `drop`. Hence no drag-drop, no multiple screens, and PVW is not below PGM.
- Take/Cut sends a single screen; `screen/take` accepts an array, one object per screen (manual; Companion `ApiClient.take`).

### Off-screen layers
- `public/editor.js` `dragWindow` → `fit()` clamps to the screen, and `lib/studio-programming.js` `geometry()` rejects anything outside. That is MVR policy, applied wrongly to program layers.
- Live `deviceconfig/device/layer_2.xml`: `<Window Roam="0">` (comment: 0 = roam anywhere, 1 = only inside the screen), X/Y Min −500000 Max 500000, Width/Height Min 64 Max 131070. PixelFlow only warns `mvr-layer-out-of-screen-tips` in MVR (`pages/mvr/components/MVRCanvas.tsx:138`), never in the program editor.

### Presets
- `GET preset/list-detail` → 404 on this firmware. `GET preset?limit&page` (manual §6.2.1) works and returns 3 presets. Example: `{guid, serial:2, name:"ppt", type:1, loadType:1, sourceRegion:2, switchEffect:{time:0,type:0}, params:["3"], screens:[{guid, name, screenIdObj, window, layers:[{serial, type, window, enable}]}], interfaces:[]}`.
- `params` enumerates `deviceconfig/device/preset_param.xml`: "3" = layer information (source, window, flip, border, shadow, mask, crop, quality, Cut-Fill, KF, cutout).
- Create (§6.2.2 `POST preset/create`): `{serial, name (≤64 bytes), loadType 1|2, type 1 global|2 single|3 multi, sourceRegion 2 PGM|4 PVW, switchEffect, params, screens:[{guid, layers:[{serial, type}]}], interfaces}`. Live layers carry a per-scene `serial` (BKG type 16 = serial 0). The PixelFlow-made presets include all layers of the scene, BKG included.
- Load (§6.2.3 `POST preset/apply`): `{serial, presetId: guid, targetRegion 2|4, auxiliary:{keyFrame:{enable}, …}}`. The Companion module uses exactly this on hardware (`PIXELHUE_API.md` §5, `targetRegion 4` = PVW).
- Rename (§6.2.4 `POST preset/update-name`): `[{guid, oldName, name}]`. Delete (§6.2.5 `POST preset/delete`): array of GUIDs.

## What was done

- **Screens aspect** (`public/screens-ui.js`, `studio.css`): removed `max-height` from `.screen-map`. Width is now `min(100%, 48dvh × w/h)` with `aspect-ratio`, so the map can never be squashed.
- **Adding outputs** (`screens-ui.js`):
  - An "Available outputs" palette has one `+ OUTPUT n` button per free output of the matching Main/AUX role. Outputs owned by another screen are disabled and show "Used by …".
  - Add places the tile to the right of the existing tiles at the output's native timing size, then grows the screen to the tiles' bounding box, so the server's "tiles must fit" rule always holds.
  - Mapped outputs get Remove and numeric X/Y/W/H. Tiles can be dragged on the map and snap to each other and the screen edges (Alt places freely; x/y clamped ≥ 0). "Fit screen to outputs" shrinks the screen to the bounding box.
- **Programming rewrite** (`public/programming-ui.js` plus new `program-stage.js` and `presets-ui.js`):
  - A row of screen chips toggles which screens are shown (persisted in localStorage; default = screens that have outputs). The **PGM band is on top and the PVW band below**. Cells flex by pixel width so every screen shares one scale, and the row is capped so both bands fit the viewport.
  - Sources are HTML5-draggable. Dropping on any PGM/PVW stage creates a layer on that screen/scene, centred on the drop point at the source's native size (scaled down to fit the screen). Double-click adds to PVW of the active screen.
  - Layers move and resize freely, past the screen edges, snapping to screen edges/centre and other layers (Alt = no snap). Inspector adds "Fill screen"; the active screen's PGM/PVW layer list moved into the inspector column.
  - Take/Cut send one request covering every shown screen.
- **Server** (`lib/studio-programming.js`): reads `layer_2.xml` `Window Roam`. When roaming is allowed (the P20 value), layer geometry is validated against the device limits (global X/Y ±500000, W/H 64–131070) instead of the screen; Roam="1" keeps the old inside-screen rule. `take`/`cut` accept `screenIds` (deduplicated, all must exist). `preset-*` actions go to the new `lib/studio-presets.js`:
  - `readPresets` pages through `GET preset` and returns null when unavailable.
  - Load: `POST preset/apply` with the Companion body.
  - Save: next free serial, `type 1`, `loadType 1`, `params ['3']`, and per shown screen its scene's layers as `{serial, type}`, BKG included.
  - Rename: `POST preset/update-name`. Delete: `POST preset/delete [guid]`.
  - Every write except load is verified by readback; names are 1–64 UTF-8 bytes.
- **Preset bank** under the bands: PVW/PGM target toggle, click a preset to load it, "Save PVW/PGM as preset…" (saves the shown screens), and Edit reveals Rename/Delete.
- Tests: `test/programming-presets.test.js` (4 tests; added to CI FILES). `test-support/mock-studio.js` mocks `GET preset`, `POST preset/*` and layer serials.

## What was VERIFIED

- `npm test` **107/107**; `check:size` (all ≤ 500 lines) and `build:client` pass. New tests cover:
  - off-screen windows written as global coordinates; ±500000/131070 rejection; Roam="1" restoring the inside-screen rule;
  - a multi-screen take payload, and rejection of unknown or duplicate screen IDs;
  - exact preset load/create/rename/delete bodies, and that invalid requests write nothing;
  - pure stage geometry (free move/resize, edge/neighbour/resize snapping, centred drop sizing).
- Mock Chrome (`/private/tmp/pixelhue-browser-qa/full-client-check.mjs`, updated; the old copy is kept as `full-client-check.wo014.mjs`) passes:
  - `+ Projector` maps the output and the map keeps 16:9;
  - two screens shown, PGM band above PVW;
  - a real Playwright `dragTo` drop creates a PVW layer centred on the screen;
  - Layer X −500 is saved as global −600 (off-screen);
  - Take hits both screens;
  - "Save PVW as preset…" is followed by a click load to PVW (`targetRegion 4`);
  - MVR, mobile 390px without overflow, and no page errors.
- Live P20 read-only (`wo016-look.mjs`, PUT blocked, 0 blocked writes, 0 errors):
  - Screens map 1554×518 = **3.00** for 3072×1024 (was 3.45).
  - Available outputs list OUTPUT 2-3 and OUTPUT 4-7 as addable; OUTPUT 3-5 is disabled as used by Screen 2.
  - Programming shows four screens. PGM stage ratios are 3.000 / 1.778 at one shared scale (492 vs 307 px = 3072 vs 1920). The four live presets (reso, ppt, laptop2, backup) are listed.
  - Screenshots: `wo016-screens-after.png`, `wo016-programming-after.png`.
- **Not proven on hardware:** preset create/rename/delete (manual §6.2 bodies) and load (Companion-proven body), off-screen layer writes, multi-screen take, output adding/drag. These are in `work/checklist-mvr.md`.

## Follow-up
Owner's standing goal: full PixelFlow programming capability in a faster UI. Tracked as WO-017 (OPEN).
