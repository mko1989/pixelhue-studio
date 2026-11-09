# WO-025 — Grouped inputs (two layers acting as one); is P20 live background / input mosaic soft-locked?

**Status: DONE (2026-11-09; live-BKG/mosaic: not supported by P20 V2.0.0 firmware, read-only proof. Grouped inputs: 122 offline tests, mock Chrome, live P20 Screen-3 create/resize/ungroup/rollback with cleanup)**

Owner (2026-11-09): "add logic for grouped inputs where i can use two layers side by side (or top bottom) to act as a single layer. check if live background is supported for p20 but just soft locked by pixelflow, like its in p80, so i can set two sources as a single live background and use only one layer for this."

## Investigation FIRST

### Live background / multi-input source on P20 — **not soft-locked: absent from the firmware**
- PixelFlow gates live background only on the device XML: `screen(type).Features.LiveBKG.Support` (`SoureListPanel.tsx:164`, `utils/screenFeatures.ts:293`, `core/DeviceManager.ts:450`). There is no model check that could be bypassed. The live P20 config-file has **no `LiveBKG` element** in any screen file.
- The P20 main card `deviceconfig/subcard/mixcard/28944.xml` has `<MosaicSource Support="0">` (input-mosaic source: several inputs spliced into one source). Its resource table is filled in, consistent with shared firmware where the P20 has the feature disabled.
- **Live P20 V2.0.0, read-only:** `GET interface/live-bkg` (bare, `?screenGuid=…`, `?nodeId=1`) → **HTTP 404**; `GET interface/mosaic-source` (bare, `?nodeId=1`) → **HTTP 404**. A real route on the same session (`interface/list-detail`) answers normally. The firmware's HTTP server does not register these routes, so this is not just a UI lock.
- An empty-body write probe (`POST interface/live-bkg/create {}`, `PUT interface/mosaic-source []`), meant only to tell "route missing" from "validation error", was blocked by the session's permission guard (writes outside the authorised Screen 3 / OUTPUT 2-3 scope) and not retried. If it is wanted, it needs explicit owner permission. It cannot change the conclusion that the read side is absent.
- **Conclusion:** on P20 V2.0.0 two inputs cannot be combined into one device source or live background. The single-layer use is impossible; grouping must use two layers.

### Grouped layers (software)
- The device has no layer-group concept (PixelFlow multi-select only). A group has to be two normal layers that Studio keeps adjacent and moves/resizes/aligns as one rectangle.
- Group identity must survive reconnects, other clients and preset loads, so it is stored in the device: the **layer names** (`general.name`, ≤ 32 bytes, kept by the device and presets). Convention: `GRP<n>-<H|V>-<A|B>`; H = side by side (A left), V = top/bottom (A top).
- Each member uses a normal layer resource (two layers per group), so in 4×MAIN+4×PIP a group costs two of the scene's layers. `layers/window` accepts an array, so both members move in one request.

## What was done
- `public/group-geometry.js` (shared with the server): `parseGroup`, `groupOf` (complete A+B pair on the same screen/scene), `unionWindow`, `splitWindow` (keeps A's share of the main axis, both ≥ 64), `groupSize` (native combined size).
- `lib/layer-groups.js`, dispatched from `applyProgramming` (the PGM lock also covers `group-create`):
  - `group-create`: next free group number; native combined rectangle centred; two normal creates (aspect-locked, WO-023), renamed `GRP<n>-<H|V>-<A|B>` via `PUT layers/general [{layerId, general:{name}}]` when the device auto-names. If the second create fails, the first is deleted (rollback). Verified by name readback.
  - `group-window`: validates the combined rectangle, splits it and writes **both members in one `layers/window` array**, verified.
  - `group-ungroup`: renames to "Layer A/B".
- `public/program-stage.js`: grouped members are drawn dashed. The selected group gets a frame over the union with corner handles; the frame passes clicks through, so members can still be selected and drop targets. Dragging a member or a frame handle moves/resizes the union (snapping and aspect respected), then commits `group-window`.
- `public/layer-inspector.js`: a group header (layout, A/B sources, Ungroup). X/Y/W/H, align, fill screen/output and Native 1:1 (combined native size) act on the union; source, aspect and keyframe stay per member. Arrow-key nudge moves the whole group.
- `public/programming-ui.js`: "Group two sources…" form under Sources (A, B, side by side / top-bottom, PVW/PGM on the active screen).
- Mock: `layers/general`. CSS for the group frame and form.

## What was VERIFIED
- `npm test` **122/122** (+2 in `test/layer-groups.test.js`, added to CI FILES): naming, native size, split, union; create → named A/B edge to edge and locked; group move/resize as one 2-element write; ungroup; rollback when the second create fails for resources.
- Mock Chrome: create a group via the form, select from the layer list, **Left** aligns both, drag the frame's corner handle (members stay edge to edge with equal heights), Ungroup. The full earlier flow and 390px mobile still pass.
- **Live P20, Screen 3 only, cleaned up:**
  - Input 8 + Input 9 (4K): the second member was refused for resources, the **rollback removed the first**, and Screen 3 was left empty.
  - Input 8 + Input 1 (1080p each): group created as `GRP1-H-A` at x −384 and `GRP1-H-B` at x 1536 (3840×1080 centred on the 3072-wide screen); group-window 1536×432 at 0,0 → 768+768 edge to edge; ungroup → "Layer A"/"Layer B" (proves the `layers/general` body); both deleted.
- Not done: live-BKG/mosaic write probes (blocked by the permission guard, not retried). Owner QA: grouped layers in Take, presets and keyframes on the output.
