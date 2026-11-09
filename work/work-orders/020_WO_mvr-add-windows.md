# WO-020 — MVR: add screen PGM/PVW (and input) windows, change a window's source, delete windows

**Status: DONE (2026-11-09; 112 offline tests, mock Chrome add/swap/delete, live P20 read-only source list; physical MVR create/swap/delete is owner QA because MVR writes were not authorised)**

Owner (2026-11-09): "there is no way to add screens (prv/pgm) to the mvr."

## Investigation FIRST
- Prior: WO-001/006/007/010 built the MVR editor for **existing** windows only. The README says "MVR window creation and template selection are not implemented yet". WO-009 created temporary MVR windows on the Q8 simulator with PixelFlow's `layers/create` shape, but never shipped it in the UI.
- Live P20 (read-only): MVR screen id 7 (1920×1080) has 14 windows: Inputs 1–12 plus `Screen 1` PVW (sourceType 4) and PGM (sourceType 3). Owner-made Screen 2 and test-drive Screen 3 (WO-019) have no MVR windows. MVR layer: `layerIdObj {type 8, sceneType 2, attachScreenType 0, attachScreenId 7, screenGuid}`, `aspectRatio {aspectRatio 5, locked 1}`.
- PixelFlow contracts (`src/pages/mvr/presenter/sourceListPresenter/handleDragEnd.ts`, `utils.ts buildMVRLayerParams`, `components/MVRSource​List.tsx`):
  - **Create** (drag a source onto empty MVR space): `layers/create {window, locked, aspectRatio:{aspectRatio: 8 (EAspectValue.OriginalRatio), locked}, layerIdObj:{type 8, sceneType 2, attachScreenType 0, attachScreenId, screenGuid}, general:{name:"MVR-<sourceId>-<unique>"}, namePrefix, source:{general:{sourceId, sourceType}, primary:{…}}}`.
  - **Replace** (drop onto a window): `layers/source [{layerId, source:{general:{sourceId, sourceType}}}]`; the device resizes.
  - Validation: inside the MVR, ≥ LAYER min, no overlap; each source at most once unless `layer_8.xml SameSourceCountLimit` is supported (then `MoreMVRLayerSource.SameSourceMaxCount`, default 2); `TemplateFixedInputCount` caps input windows when supported.
  - Source tabs for P devices: Input + Screen (PGM/PVW).
- Live P20 XML: no `SameSourceCountLimit` in layer_8 → **one window per source**; `TemplateFixedInputCount Support=0` → no input cap; layer_8 `Window Roam="1"` (inside the MVR only). `MVRLayerAction` concerns MVR frame-rate changes only, not a restriction. `UpdateMvrLayer` (screen_2) = "after screen creation, update the MVR PGM/PVW layers", i.e. the device may maintain screen windows itself.

## What was done
- `lib/mvr-layers.js` (new):
  - `mvrSources` lists the PGM and PVW of every enabled Main/AUX screen plus active inputs. Each source carries `usedBy`, the id of the window already attached to an MVR screen that shows it.
  - `applyMvrLayer` handles `create`, `source` and `delete` with PixelFlow's bodies (create: `aspectRatio 8`, name `MVR-<id>-<unique>`, the MVR screen guid; source swap: `general` only; delete: `DELETE layers [{layerId, sn}]`).
  - Validation before any write: the source exists and is not already in the MVR (P20 rule); integer geometry inside the output, ≥ 64; no overlap.
  - Each write is verified by readback, returning `changedId`.
- `lib/pixelhue.js` `read()` now includes `sources`. `server.js` adds `PUT /api/mvr-layers` behind the same session guard and exclusive queue as `/api/windows`.
- `public/mvr-sources.js` (new) and `public/app.js`/`index.html`:
  - An "Add to MVR" palette in the Windows panel; sources already in the MVR are dimmed "In MVR" and clicking one selects its window.
  - Drag onto empty space creates a window centred on the drop point at a quarter of the output width in the source's aspect. If that spot overlaps, it uses the nearest free spot, then shrinks; it fails with a notice when the output is full. Double-click places automatically. Dropping onto a window swaps its source.
  - The inspector gains a Source menu and Delete window.
  - Structure changes first flush pending autosaved geometry (`finishMvrSave`), then adopt the device readback. This resets Undo history because the window set changed.
  - Window labels now show PGM/PVW for screen sources (both Screen 1 windows previously read "Screen 1").
- Tests: `test/mvr-layers.test.js` (3; in CI FILES). The mock MVR screen got a guid.

## What was VERIFIED
- `npm test` 112/112; `check:size` and `build:client` pass. Covered:
  - source listing (Main/AUX PGM/PVW, disabled placeholder excluded, used marking);
  - the exact create body and readback;
  - overlap, out-of-bounds, duplicate source, swap-to-used and unknown screen all rejected **with zero writes**;
  - source swap body and delete, after which the source is free again;
  - `placeWindow` keeping the drop point, finding the nearest free spot, and returning null when full.
- Mock Chrome: drag "Main screen PVW" onto the MVR stage creates an MVR layer (`type 8`, sourceType 4), the palette shows it "In MVR", the inspector swaps it to "AUX screen PGM" (`[3,2]`), and Delete window removes it. The rest of the full-client flow still passes.
- Live P20, read-only (PUT blocked; 0 writes, 0 errors; `wo020-mvr.png`): the palette lists Screen 2 PGM/PVW, Screen 3 PGM/PVW and AUX Screen 1/2 PGM/PVW as addable, and Screen 1 PGM/PVW plus Inputs 1–12 as "In MVR".
- **Not run on hardware:** a live add/swap/delete on the MVR was attempted (temporary Screen 3 window, then restore) but blocked, because only Screen 3 / OUTPUT 2-3 writes were authorised and the MVR is shared monitoring. Physical create/swap/delete → `work/checklist-mvr.md`.
