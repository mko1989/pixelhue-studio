# WO-022 — Presets: separate Save from PVW / PGM, choose a slot and overwrite; PGM lock per screen

**Status: DONE (2026-11-09; 115 offline tests, mock Chrome incl. 390px, live P20 Screen-3-only overwrite/lock probes and read-only UI)**

Owner (2026-11-09): "writing/loading presets has flawed logic, should have two separate buttons to save from prv or pgm. lock on pgm screens is not there at all. cant overwrite presets. pixelflow has a small menu for writing presets with choice which preset id to save on so its easy to overwrite if needed." Follow-up to WO-016/018.

## Investigation FIRST
- `public/presets-ui.js` (WO-016) used **one PVW/PGM toggle for both load and save**, so saving from PGM silently depended on the load target. `lib/studio-presets.js` always picked the **lowest free serial**, so there was no way to choose a slot or overwrite.
- PixelFlow: `lang/en.ts` has `preset-save-pvw` "Save from PVW", `preset-save-pgm` "Save from PGM", `preset-save-cover` "Do you want to overwrite the {name}?". `pages/preset1/utils.ts` saves with a user-chosen `serial` through `ucenter/preset/create` and rejects duplicate names except within the same serial (`checkSceneName`). Live `feature.xml` `<PresetCount Min="0" Max="128">`.
- **Live P20 (Screen 3 only; owner presets 1–3 untouched):** `POST preset/create` with serial 99 "WO022 A" (PVW), then serial 99 "WO022 B" (PGM). The second **replaced** the first: one serial-99 entry, name B, sourceRegion 2, new guid. Deleted afterwards; the final list equals the initial one.
- PGM lock: screen field `pgmEdit` (PixelFlow `api/screen/screen.ts`: "PGM允许标记标志 0:禁止编辑 1:允许编辑"), set via `PUT screen/pgm-edit [{screenId, pgmEdit}]`. Live: Screen 1 = 1; Screens 2 and 3 = 0. The XML switcher mode offers enum 0/1; splicer mode only 1.
- **The lock is not enforced by the device.** On Screen 3 with `pgmEdit 0`, `layers/window` on its PGM layer was accepted (x 0→8). It was restored, then unlock → readback 1 → move → restore → re-lock → readback 0. PixelFlow enforces the lock in its UI, so Studio must enforce it in both the UI and the server. Studio had no lock at all and let PGM layers be edited on locked screens.

## What was done
- `public/presets-ui.js` rewritten:
  - **Load to PVW | PGM** is an independent target.
  - **Save from PVW…** and **Save from PGM…** open an inline form with a slot select (1–128; occupied slots are listed as "n · name (overwrite)", plus empty slots up to 8 past the highest) and a name field. Choosing an occupied slot pre-fills its name. Overwriting asks for confirmation naming the slot and preset.
  - The notice says "Preset n saved/overwritten from PVW/PGM".
- `lib/studio-presets.js`: `serial` (1–128) and `overwrite` accepted. An occupied slot without `overwrite: true` returns 409 before writing; a name already used by another slot returns 409 (PixelFlow `checkSceneName`). Readback is checked against serial, name and source region.
- PGM lock:
  - `lib/studio-screens.js` exposes `pgmLocked` (`pgmEdit === 0`).
  - `lib/studio-programming.js` adds `pgm-lock` (`PUT screen/pgm-edit`, verified). Layer create/window/source/zorder/delete on a locked screen's PGM is refused server-side with 409 before any write. Take/Cut and preset loads stay allowed.
  - UI: each PGM cell header has a "PGM locked / PGM unlocked" toggle. A locked PGM stage has an amber border and allows selecting only (no move/resize); drops onto it show a notice. The inspector shows a lock note and disables controls for a locked PGM layer.
- CSS: the save form, lock toggle, and a fix for the views column being sized by its content (390px overflow found by the Chrome check).
- Mock models the P20 rules: `screen/pgm-edit` stored, and `preset/create` on an existing serial replaces it.

## What was VERIFIED
- `npm test` **115/115** (+2). Covered:
  - slot save, refusal of a silent overwrite, duplicate-name and out-of-range rejection with zero writes, then confirmed overwrite;
  - the lock write body and readback;
  - PGM window/delete/create blocked with zero writes while PVW edit and Take still work; editing allowed after unlock.
- `check:size` and `build:client` pass.
- Mock Chrome full-client flow passes:
  - Save from PVW to slot 2 (`sourceRegion 4`), then Save from PGM overwriting slot 2 (name pre-filled; `[serial 2, sourceRegion 2]`);
  - PGM lock on and off (mock `pgmEdit` 0, locked stage class);
  - mobile 390px with no overflow, and no page errors.
- Live P20:
  - Screen-3-only probes (see Investigation) proved overwrite-by-serial and that the device does not enforce `pgmEdit`. Everything was restored; owner presets 1–3 untouched.
  - Read-only UI (PUT blocked, 0 writes, `wo022-programming.png`): lock toggles show Screen 1 unlocked and Screens 2/3 locked. The slot menu lists "1 · tstow (overwrite) | 2 · Preset 2 (overwrite) | 3 · fuck (overwrite) | 4 · empty…".
- Owner QA: save and overwrite a real preset from PGM; lock and unlock Screen 1 in PixelFlow and Studio and confirm both show the same state.
