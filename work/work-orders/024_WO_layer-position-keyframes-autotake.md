# WO-024 — Layer position/size panel, layer keyframes, relative presets, preset auto-take

**Status: DONE (2026-11-09; 120 offline tests, mock Chrome, live P20 Screen-3 end-to-end auto-take/keyframe/native-lock with cleanup)**

Owner (2026-11-09): "there should be all the options for positioning and sizing of selected layer like in the pixelflow. also ability to save keyframes, relative presets, and built in auto-take, which loads preset to prv, makes sure its loaded does a take. selectable in the presets load to section." Follows WO-016/022/023 and the parity goal in WO-017.

## Investigation FIRST
- **Position and size (PixelFlow).**
  - `LayerAttribute/.../LayerPositionSizeWrapper.tsx` with `@unico/base PositionSizeNoSlider`: X/Y/W/H, aspect lock, reset.
  - Editor toolbar/handlers (`layerEventHandle/*`): align (top, bottom, left, right, horizontal centre, vertical centre, centre; `TOOLBAR_LAYER_ALIGN`, const.ts), `layerScreenFull`, `layerInterfaceFull` (fill output), `layerFullCanvas`, `handleLayerPointToPoint` (1:1 native), paving (multi-layer), and the aspect-ratio select (`getAspectOptions(aspectRatioXml)`).
  - Live `layer_2.xml` AspectRatioType enums: 0 1:1, 2 3:2, 1 4:3, 7 5:4, 3 16:9, 4 16:10, 5 custom, 8 source; Locked 0/1. Set via `layers/aspect-ratio`.
- **Keyframes.**
  - Per-layer `keyFrame {enable, speedType 0 S-curve | 1 log | 2 exp | 3 linear, startTime 0–999, animationTime 1–1000}`, the last two in ‰ of the take time (`layer_2.xml` KeyFrame, Coefficient 1000). Written with `PUT layers/key-frame [{layerId, keyFrame:{...existing, ...changes}}]` (`layerKeyFrameHandle.ts`). Live layer: `{enable 0, speedType 3, startTime 0, animationTime 1000}`.
  - Presets store it via param `3-12` "KF" (`preset_param.xml`).
  - The global `preset/global/key-frame-status` returns **404** on P20 V2.0.0. Execution is chosen per load.
- **Preset load flags (PixelFlow `PresetSceneList/SceneList/index.tsx` `loadScene`):**
  - `auxiliary.keyFrame.enable = executeKeyframes && takeSpecialEffects ? 0 : 1` (0 = execute; manual §6.2.3 agrees: "0: Yes. 1: No").
  - `effect.enable = takeSpecialEffects ? 0 : 1`; `switchEffect {type 1, time}`.
  - Studio (copied from Companion) always sent 1/1, i.e. never executed keyframes or the load transition.
- **Relative presets (PixelFlow `preset1/components/PresetAdd/index.tsx`, `utils.ts saveSwitchScene`):** `loadType 1` absolute saves all layers of the chosen screens; `loadType 2` relative lets the user choose layers and parameter groups (`preset_param.xml` 3-2 source, 3-3 position, 3-4 size, 3-5 flip, 3-6 border, 3-7 shadow, 3-8 mask, 3-9 crop, 3-10 effects, 3-11 Cut-Fill, 3-12 KF, 3-13 cutout). The owner's three PixelFlow presets are `loadType 1, params ["3"]`, as Studio saves.
- **Auto-take (Companion `PRESET-AUTO-TAKE/executePresetProgramAutoTake.ts`):** `preset/apply` to PVW, then an immediate `screen/take` on the preset's screens, **without confirming the load**. The owner wants confirmation. The preset list has `screens[].layers[{serial, type, window, enable}]`, which can be compared with PVW readback before taking.

## What was done
- `public/layer-inspector.js` (new), used by `programming-ui.js`:
  - Source, X/Y/W/H (lock-aware), an **Aspect ratio** select (Source, 16:9, 16:10, 4:3, 3:2, 5:4, 1:1, Custom) and Keep aspect ratio.
  - **Align to screen**: Left, Centre H, Right, Top, Centre V, Bottom, Centre.
  - **Fill screen**, **Fill output** (the output tile under the layer centre), **Native 1:1** (source resolution, centre kept).
  - **KeyFrame**: Animate on Take, curve (Linear/S/Log/Exp), start and duration as % of the take.
  - Front/back/delete.
  - Arrow keys nudge the selected layer 1 px (Shift 10 px) while a stage is focused; disabled on a locked PGM.
- `lib/studio-programming.js`:
  - layers expose `serial` and `keyFrame`;
  - `aspect` accepts `mode` (layer_2.xml enums) and an optional `window`, so a preset ratio resizes and locks in one request;
  - new `keyframe` action (`PUT layers/key-frame`, merged with the current values, range-checked, verified);
  - `transitionPayload` is shared with auto-take.
- `lib/studio-presets.js`:
  - presets expose `loadType`, `params` and `content` (stored windows);
  - `applyBody` follows PixelFlow `loadScene` (`keyFrame.enable 0` only together with `effect.enable 0`, `switchEffect {type 1, time}`, swap);
  - relative save (`loadType 2`) with chosen parameter groups (3-2…3-13) and chosen layers, all validated with zero writes on error;
  - absolute save unchanged (`params ["3"]`, as PixelFlow-made presets on this device).
- `lib/preset-autotake.js` (new): apply to PVW → poll `layers/list-detail` every 250 ms for up to 6 s until every enabled stored layer exists on PVW with the stored window (serial + type; windows only when the preset carries position/size) → `screen/take` on the preset's enabled screens with the UI transition. If unconfirmed it fails with "Take was not sent".
- `public/presets-ui.js`:
  - **Load to PVW | PGM | Auto-take**, with options "Transition on load" (PGM) and "Run keyframes";
  - the save form has Type Absolute/Relative, with Settings checkboxes (Source/Position/Size/KeyFrame preselected) and the scene's layers;
  - relative presets are marked "·rel".
- Mock: per-screen/scene serials (as on the P20; global serials had masked a PGM→PVW auto-take path), stored preset windows, `preset/apply` loading PVW with an optional delay, the `ignorePresetApply` failure mode, and `layers/key-frame`.

## What was VERIFIED
- `npm test` **120/120**: keyframe and aspect bodies, readback and range rejection; relative save body and its rejections with zero writes; load flag mapping; auto-take ordering (apply → confirm → take) with a 600 ms delayed load, and no Take when the load never lands; align, fill-output and native helpers. `check:size` and `build:client` pass.
- Mock Chrome full flow:
  - Centre and Left align, keyframe on with 50% duration, 16:9 aspect `{3,1}`;
  - relative save from PVW including Crop + KeyFrame (`loadType 2`);
  - Auto-take of "Show open" sends exactly one Take;
  - plus every earlier flow and 390px mobile.
- **Live P20, Screen 3 only (owner-authorised area), cleaned up afterwards:**
  - native 1920×1080 PVW layer created locked (mode 8, serial 1), so WO-023's locked native create is now hardware-proven;
  - keyframe write read back `{enable 1, speedType 0, animationTime 600}`;
  - temp preset 99 stored the layer window;
  - the layer moved +200 px, then auto-take: load confirmed after **406 ms**, Take on Screen 3 only, PGM at the preset position (x 576);
  - temp preset deleted (owner presets 1–3 intact), Screen 3 layers deleted (empty as found), other screens untouched.
- Not proven on hardware: relative-preset load semantics, and keyframe animation visible on output (owner QA).
