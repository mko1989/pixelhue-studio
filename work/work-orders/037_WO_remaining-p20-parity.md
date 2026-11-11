# WO-037 — Remaining PixelFlow features for the P20

**Status: IN PROGRESS (2026-11-11 — units 1–3 landed: source backup, self-test, output format/colour; 207 offline tests + mock Chrome; no hardware write possible; remaining items listed under "Still open")**

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

## What was done

- **Source backup**: `lib/source-backup.js` (read, whole-object read-modify-write, pair rules checked before the write, 8297 explained, readback), `/api/source-backup`, `public/source-backup-ui.js` as a Device tab block (on/off, primary preferred, pair rows with Auto/Manual and source in use, add pair with same-capacity filtering, remove, remove all). Studio additionally refuses an input that already belongs to a pair; PixelFlow's rule for that was not traced, so this is the conservative reading of `SwitchStrategy 1`.
- **Self-test**: `lib/self-test.js`, `/api/self-test`, `public/self-test-ui.js` (last result summary, abnormal items first, Run self-test with confirmation). A device that does not answer `node/selfcheck` simply hides the block.
- **Output Advanced**: `lib/interface-config.js` role-aware lookup; `lib/output-advanced.js`, `/api/output-advanced`, `public/output-advanced.js` — a collapsed "Advanced · format and colour" section under the Outputs table, loaded when opened: per-output sampling/range/gamut and colour correction, Reset colour, and "Copy to all outputs" (one click for what PixelFlow needs per output). Copy ports are left out; they follow their primary.
- Mock: `test-support/mock-studio.js`, `mock-output-advanced.js` enforce PUT/POST methods, whole objects, real input ids, enum sets, busy state for self-test and 8297 for keyed sources.
- Audit records: DEVICE-09 and DEVICE-19 implemented; OUTPUTS-03/05 and DEVICE-10 partial with the exact remainder. Totals 19 implemented, 38 partial, 63 missing, 2 excluded, 1 not rendered.

## What was VERIFIED

- `npm test`: **207 passing**, 0 failed (3 in `test/source-backup.test.js`, 1 in `test/self-test.test.js`, 3 in `test/output-advanced.test.js`; input Advanced tests unchanged and green after the role-aware lookup). `npm run check:size`: 132 files ≤ 500 lines. `npm run build:client` passes.
- `readOutputAdvanced` run read-only against the real P20 XML and interface capture: 4 independent HDMI outputs, MVR and 2 AUX with the fields listed above.
- Headless Chrome against the mock: backup on, add pair, manual + backup in use, self-test with one abnormal item shown, output sampling + hue applied; no page errors; screenshots checked.
- **No hardware write or read was possible** (P20 unreachable). In particular the response shapes of `system/ctrl/source-backup` and `node/selfcheck` have never been seen live. Owner QA: `work/checklist-wo037.md`.

## Still open (next units, in this order)

1. Layer freeze, keying and Cut & Fill (PROGRAMMING-05/10/12) — needs the vendor-package caller traced.
2. Layer presets and preset playlists (PROGRAMMING-23/24), multiselect/clipboard (PROGRAMMING-04).
3. Screen test patterns, image quality, AOI, blending, bezel (SCREENS-05…13).
4. Detailed EDID/timing editing and EDID file import/export (INPUTS-03/04, OUTPUTS-02).
5. OSD and gallery management (PROGRAMMING-19/20), built-in MVR templates (MVR-03).
6. Project import/export, firmware and log tools (GLOBAL-02/03/04).
