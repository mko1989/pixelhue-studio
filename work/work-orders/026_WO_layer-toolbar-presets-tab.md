# WO-026 — Layer tools under the screens, Presets as an inspector tab, aspect-respecting fills, fill width/height, Clear

**Status: DONE (2026-11-09; 123 offline tests, mock Chrome, live P20 read-only UI)**

Owner (2026-11-09): "move presets into a separate tab of the inspector. spread the controls in sizing positioning of a selected layer under the screens, instead of the inspector. fit to screen overrides the aspect lock. should also have fill width and height separate. there should be clear for selected layer." Follow-up to WO-024/025.

## Investigation FIRST
- WO-024 put all position/size tools in the 220px inspector column (`public/layer-inspector.js`) and the preset bar under the PVW band (`programming-ui.js`).
- **Fill ignored the lock:** `Fill screen` saved `{0, 0, screen.width, screen.height}` and `Fill output` saved the tile, whatever the layer's `aspectLocked`. On a locked layer that distorts the ratio (or fights the device's OriginalRatio refit, WO-023).
- PixelFlow "Clear": `ToolbarE.clear` ("清除", `config/enum.ts:47`) sits in `TOOLBAR_LAYER_ZOOM_CLEAR`; the control-console layer action string is `'func-name-layer-delete-muti': 'CLEAR'` (`lang/en.ts:845`), i.e. CLEAR removes the selected layers. Studio only had "Delete layer" at the bottom of the inspector.

## What was done
- `public/layer-tools.js` (new) renders a horizontal bar **under the PGM/PVW bands** for the selected layer or group:
  - name, screen and scene; X/Y/W/H (lock-aware); Aspect select + Lock;
  - **Align to screen** (7);
  - **Fill: Screen, Width, Height, Output, Native 1:1** (`fillWindow` fits inside the target and centres when locked, exact when unlocked; `fillAxis` fills one axis and either keeps the other size or derives it from the ratio, centred on the layer);
  - **Front, Back, Clear**. Clear deletes the layer, or both group members via the new server `group-delete` (one `DELETE layers` with both ids). **Delete/Backspace** on a focused stage does the same.
  - All controls are disabled on a locked PGM.
- `public/layer-inspector.js` keeps only source, group info and KeyFrame.
- `public/programming-ui.js`: the inspector has **Layer | Presets** tabs; the Presets tab hosts the full preset bank (Load to, options, Save from PVW/PGM, list, Edit), with a stacked column layout. The right column is 260px.
- `lib/layer-groups.js`: `group-delete`.

## What was VERIFIED
- `npm test` **123/123**: `fillWindow`/`fillAxis` locked and unlocked cases (e.g. a 16:9 locked layer on 3840×1080 → 1920×1080 at x 960); `group-delete` body and readback; earlier helper tests moved to `layer-tools.js`.
- Mock Chrome full flow:
  - tools bar: Centre/Left align, 16:9 aspect, **locked Fill screen keeps 16:9 inside the screen**, Fill width → x −100 (global), w 1920;
  - Presets tab for every preset step (save, overwrite, relative, auto-take, load);
  - Layer tab for keyframes, groups, Ungroup;
  - **Clear** removes the selected layer;
  - plus every earlier flow and 390px mobile.
- Live P20 read-only (PUT blocked, 0 writes, `wo026-layer.png`, `wo026-presets.png`): the owner's Screen 1 group shows as "Group 1" in the bar with all tools; the Presets tab lists 1 tstow, 2 Preset 2, 3 fuck.
