**Status: DONE (2026-11-06, 63 tests, Chrome UI and v1.2.0 archives verified; physical P20 acceptance remains owner-QA)**

**Screen/UMD follow-up:** [WO-010](010_WO_mvr-screen-umd.md) extends fixes to PGM/PVW screen sources and uses device-reported UMD height for content ratios, resizing and saved locks. Its source eligibility and geometry rules supersede the input-only/whole-rectangle assumptions below.

**Apply validation follow-up:** [WO-007](007_WO_mvr-repeat-apply.md) corrects overly strict source-signal validation for established locks on disconnected inputs and PGM/PVW windows, preserves position-only moves after source timing changes, and avoids redundant native aspect writes. Use WO-007 for current Apply behaviour.

## Investigation FIRST

Add an MVR aspect-ratio fix for connected physical inputs, with persistent resize locks and no overlapping windows.

- `public/app.js` currently uses one checkbox value for every window and derives ratios repeatedly from rounded geometry. Undo/save snapshots only store geometry. `public/editor.js` and server `validateChanges` constrain output bounds but allow overlaps.
- Companion `src/interfaces/Layer.ts` / supplied API manual identify direct input sources by `source.general.sourceType === 2` and resolve them with `sourceId === interfaceId`. Raw input interface state (manual and vendor `LinkStateE`) 1–4 indicates a connection; 0/5/6 indicate no connection. Use actual signal timing, never EDID presets, and ignore disabled/offline ports.
- Vendor source map `src/api/layer/layer.ts:439` writes `layers/aspect-ratio` as an array of `{layerId, aspectRatio, locked}`. `src/enum/common.ts` / PositionSize enum use OriginalRatio=8 and Custom=5. Layer list-detail returns `aspectRatio.aspectRatio` / `.locked`. Persist and verify native locks when applying, rather than claiming a lock based only on UI state.
- A ratio fitted within the original window's rectangle cannot overlap neighbours in a valid current layout. Preserve its centre, shrink only as needed, respect 64×64 minimum and integer pixels; skip impossible fits with an explanation. Do not invent a signal ratio for disconnected/unsupported sources.
- Guard manual movement, corner resize, numeric edits and imports against positive-area intersections; touching edges are valid. Server checks final full geometry on changed MVR outputs before device writes. P10/P80 remain inputs-only.
- Existing distributions need an updated version once implementation and verification pass. WOs 001–005 retain model/input/packaging constraints.

## What was done

- `mvr-app/lib/mvr-signals.js` reads connected physical inputs' actual timing and layer source IDs, and restores native aspect locks from device state. EDID, disconnected/disabled/offline inputs and PGM/PVW sources do not supply ratios.
- `mvr-app/public/mvr-geometry.js` fits each eligible window to its source ratio inside its current rectangle, preserving the centre. If the 64 px minimum cannot fit there, a second pass searches nearby free space after ordinary windows shrink. Unplaceable windows stay unchanged with a visible explanation; edge contact is allowed. Existing overlaps must be resolved first.
- `mvr-app/public/app.js`, `editor.js`, `index.html`, `style.css` add **Fix aspect ratios**, actual-resolution/lock information and independent window locks. The action rereads input timing and checks for externally changed layouts, then stages one undoable edit. Corner/numeric resizing maintains the stored ratio. Undo/redo and layout JSON preserve locks; dragging, numeric edits, alignment, keyboard nudges and imported layouts reject overlaps. Device writes still require Apply.
- `mvr-app/lib/pixelhue.js` reads interfaces with MVR state, validates ratio metadata and fresh source timing, checks the complete resulting output for overlap, and orders geometry changes to avoid transient intersections. Direct swaps without an intermediate free position are rejected before writes. Apply writes native `layers/aspect-ratio` OriginalRatio=8 / Custom=5 locks and verifies both geometry and lock readback. P10/P80 remain inputs-only.
- Added meaningful geometry/signal/API tests in `test/mvr-aspect.test.js` and extended the HTTP mock for timing, source identity and lock readback/ignored-write behaviour. README and hardware checklist document the workflow and firmware verification still needed.
- Rebuilt all four portable distributions as v1.2.0. Packaging README now receives the application version automatically.

## What was VERIFIED to work

- `cd mvr-app && npm test`: **63 passing tests, 0 failures**. Covers actual timing versus stale EDID; eligible connection states; portrait/landscape ratios; disconnected and non-input skips; integer geometry; minimum-size fallback and no-room reporting; edge contact; cross-output isolation; safe write order/direct swap rejection; repeated ratio-preserving resize; saved locks/import validation; native lock writes/readback; stale signal and ignored lock rejection. Prior discovery, inputs, capacities and model tests also pass.
- Repeated the full **63-test suite successfully using the Node runtime bundled in the v1.2.0 Intel Mac distribution**.
- Installed Chrome via temporary Playwright (`/private/tmp/pixelhue-browser-qa/mvr-aspect-check.mjs`): connected 1920×1080 and actual 1600×1200 inputs fixed independently (the latter deliberately had 1920×1080 EDID); disconnected and Program windows unchanged. Staging made no device writes. Undo/redo, per-window lock selection, numeric/corner resize, numeric/drag collision prevention, Apply/native lock readback, Refresh and saved lock/import checks passed.
- Desktop 1440×1050 and mobile 390×844 browser checks passed with no page errors or horizontal overflow. Screenshots at `/private/tmp/pixelhue-browser-qa/mvr-aspect-desktop.png` and `mvr-aspect-mobile.png`; desktop visually reviewed. Mock servers and browser processes were closed by the QA script.
- `npm run build:dist` and `npm run verify:dist` passed for v1.2.0 Intel Mac, Apple Silicon Mac, Windows x64 and Ubuntu x64. All archive/source hashes, contents and executable architectures verified. Extracted Intel Mac launcher/runtime served the UI successfully and shut down; `dist/verification.json` records the result. Other three targets were inspected but cannot be executed natively on this Intel Mac.
- Changed source files remain below 500 lines. No commit: the workspace is not a Git repository. Vendor and Companion references are unchanged.
- **Physical hardware remains unverified:** P20 firmware acceptance of arbitrary input geometry and native aspect locks, physical MVR output and behaviour after live source renegotiation. Complete the WO-006 section of `work/checklist-mvr.md` on the intended device. Mock success does not establish firmware compatibility.
