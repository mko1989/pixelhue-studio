# WO-033 — Replacement source fits inside the previous layer

**Status: DONE (2026-11-10 — 169 offline tests and real Chrome drag/drop against mock hardware)**

## Investigation FIRST

Owner: dropping a differently shaped source onto an existing layer must fit inside the previous width/height, keeping its position. Follow-up to WO-023/026/031.

- `lib/source-aspect.js:3` fits Programming geometry around the centre and enforces a 64 px minimum by increasing scale. Replacement therefore moves X/Y and can exceed the old bounds for extreme ratios. Creation also uses this helper and should retain its placement behavior.
- `lib/studio-programming.js:96` swaps the source before resizing and reapplying Original=8; prior live P20 evidence in WO-023 shows an Original lock can increase width on a source/aspect change. Existing replacement verification checks the source/ratio/lock but does not check retained X/Y or exact fitted geometry.
- `lib/mvr-drop.js:7` fits within the previous full rectangle (including UMD and input caps) but centres the smaller result. Its reconciliation pass also centres. Replacement needs a top-left anchor through both passes, retaining UMD/collision validation; new-window placement must remain unchanged.
- Replacements that cannot fit the device's minimum size must fail before writing rather than enlarge the previous rectangle. Keep default source locks and validate device geometry readback as well as source/ratio.

## What was done

- Added `fitSourceReplacement` to contain the new ratio inside the old width/height at the exact old X/Y. It includes optional UMD height, rounds video height down before deriving width (matching P20 Original-lock behavior), and rejects impossible 64 px minimum fits before device writes. New-layer creation keeps its existing centre/native-size behavior.
- Programming replacements temporarily use Custom=5 while routing to prevent an old Original lock expanding geometry, then send the contained window and restore the default Original=8 lock. Readback must retain the exact fitted X/Y/width/height as well as the source and lock.
- MVR replacements use the same contained top-left fit with actual UMD and model input limits. Final UMD reconciliation uses the original full reserved rectangle, keeping the anchor through both passes and preserving overlap checks.
- Extended the existing curated drop regression file (no new runner entry needed). Updated README and the Programming/MVR parity records to state replacement behavior.

## What was VERIFIED

- `npm test`: **169 passing**, zero failed/skipped (158 previous plus eleven new cases including nested aspect/UMD variations). Checks portrait/4:3/ultrawide replacement bounds and X/Y, neighbours unchanged, 28/32/0 px UMD, impossible minimum sizes with zero writes, exact geometry readback rejection and width-rounding protection. Existing creation/default-lock/input/group/gallery/preset/MVR checks remain green.
- Chrome actual drag/drop against local mock hardware: portrait source onto existing Programming PVW, then ultrawide onto the resized layer; X/Y preserved, neither dimension grows, no extra layers, aspect stays locked. MVR replacement includes explicitly enabled 24 px UMD, same X/Y, contained bounds, no page errors. Screenshots `/private/tmp/pixelhue-browser-qa/wo033-{program,mvr}-replacement.png`. Initial browser assertion assumed UMD enabled on a mock layer whose UMD was absent; explicitly enabled the fixture strip and reran successfully, with no production change needed.
- `npm run check:size`: 105 source files <=500 lines. `npm run build:client` and diff whitespace checks pass. No physical device settings written; hardware source-routing display remains owner QA.
