# WO-037 — Remaining PixelFlow features for the P20

**Status: IN PROGRESS (2026-11-11 — units 1–6 landed: source backup, self-test, output format/colour, keying, Cut & Fill, layer presets; 212 offline tests + mock Chrome; no hardware write possible; remaining items listed under "Still open")**

Owner (2026-11-11, after WO-036): "start implementing all the missing items". Scope is the list in `docs/pixelflow-parity/README.md` "Still shown by PixelFlow on a P20 and not yet in Studio". Screen audio is excluded by owner decision (routing only). Items PixelFlow hides on a P20 stay out. The P20 is still unreachable from this Mac, so each unit is proven against PixelFlow's source, the captured live XML/JSON and a mock that enforces the known device rules; hardware QA goes to `work/checklist-wo037.md`.

## Investigation FIRST

### Unit 1 — Source backup (DEVICE-09)
- Gate: feature.xml:1496 `<SourceBackup Support="1" Editable="1">`; `SwitchStrategy Value="1"` (primary → backup, not mutual), `CapacityStrategy Value="0"` (same capacity only), `SwitchMode` 0/1, `BackupPrimaryFirst Level="1"` (per pair), `AutoCropSourceConfig Support="0"`.
- API (`src/api/device/deviceInfo.ts:555-585`): `GET system/ctrl/source-backup` → `{ sourceBackup }`; `PUT system/ctrl/source-backup` body `{ sourceBackup: <whole object> }`. Every edit is read-modify-write of the whole object.
- Object (`inputSourceBackup/HotBackupPanel.tsx:886-905 createBackupList`): `{ enable, primaryFirst, backup: [{ id, parentId, primarySourceId, primarySourceType, primarySourceState, backupSourceId, backupSourceType, backupSourceState, switchMode, usingSourceId, usingSourceType, primaryFirst, primarySourceName, backupSourceName }] }`. Input source type is 2. New id = max id + 1 (`getMaxId`, :919).
- Behaviour traced:
  - Enable switch: `{ ...obj, enable }` with only complete pairs (`handleBackupChange` :632). Pairs can be edited only while enabled (`handleSelect` returns when `!backupData.enable`).
  - Primary preferred: sets top-level `primaryFirst` and every pair's `primaryFirst` (`mainSourceChange` :657).
  - Auto/manual: `switchMode = Number(!auto)`; switching to auto resets `usingSource*` to the primary (:1008-1010). In manual the operator picks primary or backup as the source in use.
  - A new auto pair where either source has no signal is sent with `usingSourceId: 0, usingSourceType: 0` (:907-911).
  - Capacity: with `CapacityStrategy` ≠ 1 the backup must have the same capacity as the primary (`index.tsx:211-232`).
  - Device code 8297: backup is refused for sources used by Cut & Fill / cutout (`handleSourceBackupReq` :648).
- No live sample of `system/ctrl/source-backup` exists in the captures, so the response shape is from the source only.

### Unit 2 — Device self-test (DEVICE-19)
- Gate: feature.xml:1142 `<DeviceSelfTest Support="1" Editable="1" IsBlock="0">`.
- API (`src/api/device/deviceList.ts:748-819`): `POST node/selfcheck { nodeId }` (5 s timeout); `GET node/selfcheck?nodeId=1&checkType=0|1` (0 power-on check, 1 device test) → `{ nodeId, checkType, parts: [{ slotId, modelId, boardId, section: [{ sequence, type, index, name, value, showBrief, state }] }] }`, `state` 0 normal / 1 abnormal (`device-upgrade/device-inspection-table.tsx:228-238`).
- PixelFlow only starts a test when node `status` is 1 (free) and warns "device is busy" otherwise (`maintain/presenters/deviceMaintainPresenter.ts:665-690`); status 10 = self-checking. PixelFlow gets completion over WebSocket; Studio has no socket, so it polls `node/detail` until the status leaves 10.
- No live sample of the result exists; the shape is from the source only.

### Unit 3 — Output format and colour correction (OUTPUTS-03, OUTPUTS-05)
- API (`src/api/device/deviceInterface.ts`): `PUT interface/color-space`, `interface/color-range`, `interface/color-gamut` with `[{ interfaceId, <key>: { preset } }]`; `PUT interface/image-quality` (`deviceInfo.ts:174`) with the whole `imageQuality` object.
- Options are per connector and per role. The connector XML carries `<Interface Type="2">` for inputs and `<Interface Type="124">` (4+8+16+32+64) for outputs. `lib/interface-config.js` always picked role 2, so it could not serve outputs.
- Run against the real capture after making the lookup role-aware: Main HDMI 2.0 outputs offer sampling 0/1/2, range 0/1, gamut 0–3 and brightness/contrast/hue/saturation; AUX offers sampling, range and colour correction; MVR offers sampling and range only. Input results are unchanged.
- Colour temperature and gamma: feature XML marks them unsupported for outputs on the P20; the generic field builder does not emit them. Dynamic range/HDR for outputs is left out (dependent HDR parameters and `interface/hdr` not traced).
- PixelFlow pre-checks link bandwidth before sampling changes and greys out YCbCr while the gamut is DCI-P3. Only the DCI-P3 rule is reproduced; the bandwidth check is left to the device.

### Unit 4 — Keying (PROGRAMMING-10)
- `PUT layers/cutout [{ layerId, cutout }]` with the whole `cutout` object (`api/layer/layer.ts:844`, `layerCutoutChangeHandle.ts`). Live shape: `{ cursor, enable, type, brightness { threshold, gain, foregroundColor { enable, R, G, B }, keyInverse, keySource }, hue { hueClip, hueRamp, saturationClip, saturationGain, spill, shadow, highLigh, edgeSmooth, color, pos }, intelligence { color, mattingStrength, gainAdjust, pos } }`.
- layer_2.xml:146 `CutoutGeneral`: `Type` 0 luma, 1 chroma, 2 smart (default); luma threshold/gain 0–100; chroma hueClip/hueRamp 5–180, saturationClip 0–100, saturationGain 1–100, spill/shadow/highLigh 0–100, edgeSmooth 0/1; smart mattingStrength/gainAdjust 0–100.
- `layerCutoutEnableHandle.ts`: enabling is refused on a fill layer with Cut & Fill on; disabling also sets `cursor.enable` 0 and `brightness.foregroundColor.enable` 0. PixelFlow pre-runs a resource assessment (not reproduced). The colour picker (`layers/cutout/color` with a cursor on the live image) needs the live view Studio does not have.

### Unit 5 — Cut & Fill (PROGRAMMING-12)
- `layerCutFillHandle.ts` + `controller/dispatcherUtils.ts:592-712`:
  - Switch: `PUT layers/cut-fill-switch [{ layerId: <selected layer>, enable }]`; code 8298 = refused with keying/backup.
  - The cut layer is the layer whose `layerId` equals the selected layer's `cutId` (`layerAttrUtils.ts:85`); layer types `cut = 128`, `fill = 256` (`common/enum.ts:619`).
  - Position: `PUT layers/relative [{ layerId: <cut>, relative { x, y −100…100, width, height 5…200 } }]`. Curve: `PUT layers/curve [{ layerId: <cut>, curve { start {x,y}, end {x,y} } }]` 0–255. Invert: `layers/general` on the cut layer (`isInverse`). Cut source: `PUT layers/source [{ layerId: <cut>, source { general { sourceId, sourceType } } }]`; codes 8310 (backup source), 8341 (gallery image refused).
  - Reset: `PUT layers/reset-cut [{ layerId: <cut>, isInverse: 0, source { sourceId: 0, sourceType: noSource }, curve, relative }]` with the XML defaults.
- **Unproven**: what the device reports after the switch. The source implies the selected layer becomes type 256 with `cutId` set and a type-128 layer appears. Before this WO Studio listed only types 2/4/32, so a layer switched to Cut & Fill in PixelFlow would have vanished from Studio's Programming tab. `noSource` is taken as 1 from the layer_2.xml source-type comment; its enum definition was not found.
- Layer freeze: searched every writer of `general.isFreeze`. The editor only reads it; the only writer is the layer-preset "freeze" option. It is not a missing direct control.

### Unit 6 — Layer presets (PROGRAMMING-23); preset playlists are not a P20 feature
- Preset playlists ("loop" tab, `preset/group/*`): the tab is added only when feature XML `Features/Preset/PresetGroup` is supported (`editor1/hooks/scenseHooks.ts:78,138`). The live P20 XML has no `PresetGroup` element, so PixelFlow does not show it on a P20. `preset/group/play` has no caller in the recovered app source. PROGRAMMING-24 is therefore not a P20 gap and is not built.
- Layer presets: gate `Features/Layer/LayerPreset` (`scenseHooks.ts:97`); live feature.xml:96 `<LayerPreset Support="1" Editable="1" maxCount="1024">` with eight `LabelColor R/G/B` entries.
- API (`src/api/layer-preset/index.ts`):
  - List: PixelFlow uses `ucenter/layers/layer-preset/list-detail` (its controller service). The device-direct `GET layers/layer-preset/list-detail` → `{ totalCount, list: [{ layerPresetId, general { name, labelColor { R, G, B } }, … }] }` is what the Companion module uses (`companion …/src/services/ApiClient.ts:325`, `interfaces/LayerPreset.ts`).
  - Create: `PUT layers/layer-preset/create [preset]`. Apply: first `PUT layers/layer-preset/apply-access [{ layerPreset, layerIds: [{ layerId }] }]` → `data.fails[].results[]`; when empty, `PUT layers/layer-preset/apply` with the same body (`handleLayerPresetApply.ts`). Rename/colour: `PUT layers/layer-preset/apply-modify [whole preset with general changed]`. Delete: `DELETE layers/layer-preset/delete [{ layerPresetId }]` → `data.fails`. Duplicate name = code 8311.
  - Preset body (`handleLayerPresetCreate.ts`, `LayerPreset/const.ts`): every part is always sent with its own `enable`: `sourcePreset { source }`, `posPreset { x, y }` (relative to the screen), `sizePreset { width, height }`, `borderPreset { border }`, `effectPreset { isMonochrome, isInverse, imageQuality, opacity }`, `shadowPreset { shadow }`, `flipPreset { flipType }`, `maskPreset { mask }`, `cutFillPreset { isInverse, cutFill, source }` (from the linked cut layer, or defaults), `cropPreset { crop }`, `freezePreset { isFreeze }`, plus `general { name, labelColor }`. In `sourcePreset.source` the `primary` ids replace `general` ids and `primary` is removed.
- No live sample of a stored layer preset exists.

## What was done

- **Source backup**: `lib/source-backup.js` (read, whole-object read-modify-write, pair rules checked before the write, 8297 explained, readback), `/api/source-backup`, `public/source-backup-ui.js` as a Device tab block (on/off, primary preferred, pair rows with Auto/Manual and source in use, add pair with same-capacity filtering, remove, remove all). Studio additionally refuses an input that already belongs to a pair; PixelFlow's rule for that was not traced, so this is the conservative reading of `SwitchStrategy 1`.
- **Self-test**: `lib/self-test.js`, `/api/self-test`, `public/self-test-ui.js` (last result summary, abnormal items first, Run self-test with confirmation). A device that does not answer `node/selfcheck` simply hides the block.
- **Output Advanced**: `lib/interface-config.js` role-aware lookup; `lib/output-advanced.js`, `/api/output-advanced`, `public/output-advanced.js` — a collapsed "Advanced · format and colour" section under the Outputs table, loaded when opened: per-output sampling/range/gamut and colour correction, Reset colour, and "Copy to all outputs" (one click for what PixelFlow needs per output). Copy ports are left out; they follow their primary.
- **Keying and Cut & Fill**: `lib/layer-effects.js` (`key` and `cutFill` effects; whole `cutout` object; Cut & Fill writes go to the linked cut layer), `lib/program-geometry.js` (type 256 fill layers stay listed as normal layers; cut layers are not listed), `public/layer-effects-ui.js` (Keying and Cut & Fill sections). Keying and Cut & Fill refuse each other before writing.
- **Layer presets**: `lib/layer-presets.js` (list, save from a layer, assess-then-apply, rename/colour, delete), `layerpreset-*` actions in `lib/studio-programming.js`, `layerPresets` in the Programming state, `public/layer-presets-ui.js` in the Layer inspector: one click applies; saving remembers which parts were ticked and defaults to everything except the source (a look, not a route).
- Mock: `test-support/mock-studio.js`, `mock-output-advanced.js` enforce PUT/POST methods, whole objects, real input ids, enum sets, busy state for self-test and 8297 for keyed sources.
- Audit records: DEVICE-09 and DEVICE-19 implemented; OUTPUTS-03/05 and DEVICE-10 partial with the exact remainder. Totals 19 implemented, 38 partial, 63 missing, 2 excluded, 1 not rendered.

## What was VERIFIED

- After unit 6: `npm test` **212 passing** (3 in `test/layer-presets.test.js`), 136 files ≤ 500 lines; Chrome against the mock: save a preset from one layer, apply to another, delete.
- After units 4–5: `npm test` **209 passing**; Chrome against the mock: chroma key parameters, key on/off, Cut & Fill on, cut source, width; the fill layer stays in the layer list. The mock's Cut & Fill layer model is an assumption (see Unit 5).
- Units 1–3: `npm test`: **207 passing**, 0 failed (3 in `test/source-backup.test.js`, 1 in `test/self-test.test.js`, 3 in `test/output-advanced.test.js`; input Advanced tests unchanged and green after the role-aware lookup). `npm run check:size`: 132 files ≤ 500 lines. `npm run build:client` passes.
- `readOutputAdvanced` run read-only against the real P20 XML and interface capture: 4 independent HDMI outputs, MVR and 2 AUX with the fields listed above.
- Headless Chrome against the mock: backup on, add pair, manual + backup in use, self-test with one abnormal item shown, output sampling + hue applied; no page errors; screenshots checked.
- **No hardware write or read was possible** (P20 unreachable). In particular the response shapes of `system/ctrl/source-backup` and `node/selfcheck` have never been seen live. Owner QA: `work/checklist-wo037.md`.

## Still open (next units, in this order)

2. Multiselect/clipboard (PROGRAMMING-04). Preset playlists are not a P20 feature (see Unit 6).
3. Screen test patterns, image quality, AOI, blending, bezel (SCREENS-05…13).
4. Detailed EDID/timing editing and EDID file import/export (INPUTS-03/04, OUTPUTS-02).
5. OSD and gallery management (PROGRAMMING-19/20), built-in MVR templates (MVR-03).
6. Project import/export, firmware and log tools (GLOBAL-02/03/04).
