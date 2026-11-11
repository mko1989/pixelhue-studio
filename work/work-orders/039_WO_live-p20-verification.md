# WO-039 — Live P20 verification of WO-036/037 features

**Status: DONE (2026-11-11 — read paths and reversible writes proven on the P20 at 192.168.0.7, two bugs fixed and re-proven live, 224 offline tests; disruptive tests left for the owner, listed below)**

Owner (2026-11-11): "there is a p20 on the network now 192.168.0.7 run the tests."

## Investigation FIRST

- Device: P20, SN 26107A000000125, layer mode 1, one Main screen (Screen 1, 7680 × 2160, two 4K PGM layers on air, a two-layer PVW group) and two AUX screens. There is no spare screen, so anything that changes Screen 1's output or PGM would be visible. Someone was operating the device during the session: AUX layer sources/windows and screen selection changed between my two read-only snapshots with no matching entry in my write log.
- Method: scripts in the session scratchpad drive Studio's own `lib/` modules through a transport guard that (a) refuses every non-GET in the read-only pass and (b) in each write stage allows only that stage's endpoints and logs every write. Each change is followed by a restore and a comparison with the snapshot. Writes were limited to a PVW layer (25231361), idle SDI inputs, the second analog audio output, AUX 2, the gallery and device settings; PGM layers were compared before and after and never changed.
- Read-only pass, 43 GETs, 0 writes: every new read path answered. What the real responses showed:
  - `audio/matrix-detail`: 24 row headers (8 flagged invalid), 8 column headers → 16 inputs × 8 outputs in Studio. Shape as assumed.
  - `system/ctrl/source-backup`: `{ sourceBackup: { enable, primaryFirst, backup[] } }` as assumed; a stored pair also carries `parentId: 0` and no name/state fields.
  - `node/selfcheck`: `checkType=0` returns `parts: []`; `checkType=1` holds the stored result (16 items named `usage_cpu`, `process_userver`, `device_sn`, …). **Studio showed "No result stored"** → fixed.
  - `picture/progress`: a bare `{ percent, pictureId, type, status }`, not wrapped.
  - `layers/layer-preset/list-detail`: `{ count, page, totalCount, totalPage, list }`; presets carry `general.index`, and `source.primary { sourceType: 0, sourceId: 0 }` when there is no backup relation → `buildLayerPreset` would have blanked the source for such a layer (PixelFlow's `??` has the same flaw) → fixed.
  - `layers/template?moduleType=0`: an array of 8 built-in layouts with `id`, `templateId`, `layout[]`, `cells[]` (14–20 cells), `baseResolutionWidth/Height`, `templateIdObj`.
  - `node/clock`: `{ nodeId, time { timestamp, timezone } }`. **The device clock reads about 7 h 48 min ahead of real UTC** (timestamp 1794445187 when real time was 1794417208; Studio shows 2026-11-12 09:08 Shanghai when it was 01:20 there). Either the clock is simply wrong or the device stores something other than UTC seconds; compare with what PixelFlow shows before using "Use this computer's time".
- Bug found by the write tests: **PGM capture failed** with `code 8306 "Capturing image... Please retry later"`. Observed sequence for a 7680 × 2160 capture: node status 14 for ~12 s; `picture/progress` idle for the first second, then `status 1` with rising percent, then back to idle (**never `status 2`**) as the node status returns to 1; after `capture/save` the node status is 7 for ~5 s and only then is the picture listed. Studio treated the first idle read as "finished" and saved too early.
- Device behaviours learned:
  - Cut & Fill: the model assumed in WO-037 is exact — the layer becomes type 256 with `cutId`, a type-128 layer appears with `fillId`, source type 1 (none), and carries curve/relative/invert/source; `reset-cut` restores defaults. **Switching off keeps the cut layer** (`enable 0`, `cutFill.enable 0`) and the `cutId`; the fill layer returns to type 2.
  - After a `layers/cutout` write the device stores `brightness.keySource.sourceType` as 0 where it reported 2 before (key source is not used by layer keying on the P20).
  - Applying a layer preset that includes size changes the layer's aspect mode from Original (8) to Custom (5).
  - A new backup pair of two no-signal inputs is stored with `usingSourceId` = the primary, not 0.

## What was done

- `lib/gallery-manage.js`: capture now waits for the node status to return to idle after the capture has started, retries `capture/save` on code 8306, waits up to a minute for the saved picture to be listed, and deletes the temporary picture when it gives up.
- `lib/self-test.js`: an empty power-on check falls back to the stored device test.
- `lib/layer-presets.js`: `primary` ids replace the source only when a primary source is actually set.
- Mock aligned with the device: capture/save timing and 8306 (`test-support/mock-studio.js`), Cut & Fill switch-off keeps and re-uses the cut layer (`test-support/mock-effects.js`); tests updated for all four (`test/gallery-manage.test.js`, `test/self-test.test.js`, `test/layer-presets.test.js`, `test/layer-effects.test.js`).
- Restored on the device after the tests: aspect mode of PVW layer 25231361 back to Original/locked.

## What was VERIFIED

Live on the P20 (each write followed by readback through Studio's own verification, then restored):

| Area | Proven live |
| --- | --- |
| Layer effects (PVW layer) | opacity, flip H, flip V, mono, invert, border (on, widths, soft style, colour), mask (px + ratio), shadow, colour (brightness, hue), source crop, key parameters, key enable, device lock — 13 changes and 13 restores, all retained; PGM layers byte-identical before/after |
| Cut & Fill | on, position/size, curve, invert, cut source, reset, off |
| Layer presets | save (position, size, effect), apply after assessment, rename + recolour, delete; preset list restored |
| Layer copy | Duplicate created a third 4K PVW layer (no resource refusal); deleted again |
| Audio | route, replace on the same output, unroute, mute/unmute an output channel and an input channel; matrix and flags identical afterwards |
| Device | electrostatic protection on/500 ms and back; `node/clock` accepted the device's own time and zone |
| Source backup | on, add pair (SDI 9 → SDI 10), manual, in use = backup, auto, primary preferred on/off, remove all, off; object identical afterwards |
| Gallery | rename and rename back; PGM capture (18 s end to end after the fix) and delete; gallery identical afterwards |
| EDID | export of Input 8: 256 bytes, valid header/checksums, one extension block |
| Output colour | AUX 2 saturation 100 → 101 → 100 |
| Screen colour | AUX Screen 2 saturation 100 → 101 → 100 |
| Self-test | read of the stored device test: 16 checks, 0 abnormal |
| UI | headless Chrome against the real device, every tab opened (Device, Audio, Outputs + Advanced, Screens + extras, Programming + inspector, MVR + layouts, Inputs + Advanced): no page errors, zero write requests |

- After the tests a second read-only snapshot matched the first for audio, source backup, anti-static, layer presets, gallery, output and input Advanced. Differences: the operator's own changes (AUX layer sources, screen selection, UMD signal text) and **one leftover of mine: the dormant cut layer 25624578 (type 128, `enable 0`) and `cutId` on PVW layer 25231361**, which the device keeps after Cut & Fill is switched off. It is not shown and not enabled; I did not delete it because deleting a cut layer directly is untested.
- Offline after the fixes: `npm test` 224 passing; `check:size` and `build:client` pass.

**Not run, because they are visible or disruptive on a device in use** (owner's call):
- Test tone (audible on the outputs).
- Screen test pattern and screen format on Screen 1 (the only Main screen, on air); output sampling/range/gamut (outputs resync).
- MVR "Apply layout…" (replaces the whole MVR arrangement).
- Run self-test (effect on a running show unknown).
- EDID import and detailed-timing write (the source renegotiates).
- "Use this computer's time" (see the clock finding above).
- Layer preset apply onto a different layer, Mirror copy, key/Cut & Fill on PGM.
