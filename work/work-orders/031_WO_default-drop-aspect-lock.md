# WO-031 — Default aspect lock on every dropped source

**Status: DONE (2026-11-10; 149 tests, mock Chrome and six refreshed distributions verified; physical drop/lock QA pending)**

## Investigation FIRST

Owner confirms every dropped source should default to aspect locked, with the correct additive UMD height in MVR. Follows WO-010/020/023/025/028/029.

- Programming normal/group-member and logo creation already send `locked:1, aspectRatio:{aspectRatio:8,locked:1}`. Existing-layer source replacement only writes `layers/source`, retaining an unlocked/custom old aspect.
- MVR creation explicitly sends `locked:0, aspectRatio:{aspectRatio:8,locked:0}`. `placeWindow` sizes the entire rectangle as video and adds no UMD height. Replacement only optionally shrinks to the input cap, then routes the source; it neither refits nor locks.
- Actual enabled UMD height must come from device XML and layer readback (WO-010), with Custom=5 for additive UMD and Original=8 without it. Initial creation relies on firmware UMD defaults, so verify the actual new layer and correct against its reported UMD setting before success. Unknown enabled-UMD height must fail explicitly rather than guess 24.
- All placement, overlap and P10/P20 input-limit checks use the full video-plus-UMD rectangle. Source replacement must fit inside the existing rectangle and preserve unrelated windows. Native Original locks can refit on source changes, so use Custom while changing MVR geometry/source, then establish/verify the final lock.

## What was done

- `public/mvr-sources.js` sizes new windows with video height plus source-specific configured UMD height before collision searching and input-cap checks. `PixelhueClient.read` now loads the cached configuration even when MVR is initially empty and includes UMD dimensions in source metadata; explicitly unsupported UMD yields zero.
- `lib/mvr-drop.js` centralizes source-ratio fitting and post-drop verification. New MVR windows send lock enabled; enabled UMD uses Custom=5, UMD-off uses Original=8. Creation reads the actual UMD setting back and reconciles firmware defaults before reporting success. Replacement fits inside the previous full rectangle, neutralizes an old Original refit during routing, and confirms source, window, content ratio, lock, UMD and no overlap. Unknown heights fail before creation without guessing 24 px.
- `lib/source-aspect.js` fits normal source geometry around its centre. Programming creation and source replacement fit and verify native Original=8 locks. A replacement explicitly relocks an unlocked layer. Background picture drops also set/verify native source locks (layer_16.xml advertises AspectRatio Support=1); logos retain their existing locked creation defaults and preserve their image ratio when a minimum dimension requires scaling. Group members continue through normal locked creation. Manual unlock and existing untouched windows remain available.
- Mock MVR creation now models enabled UMD defaults and an explicit UMD-off override. Updated the old MVR create-body and background-body assertions to the new required locked contracts, keeping exact payload/readback checks. Added eleven new cases including nested per-source tests and the curated CI entry.
- Updated README and packaged instructions, rebuilt all six current-source distributions including both Raspberry Pi targets, and restarted only the local :3211 development process.

## What was VERIFIED

- `npm test`: **149/149 pass** (138 prior + eleven added cases). Covers input/PGM/PVW creation with distinct 28/24/32 px UMD dimensions; full-strip collisions and portrait input caps; firmware UMD off; input without timing; replacement of an unlocked window with a 4:3 source; unknown heights with zero writes; ignored lock writes; normal portrait source creation/replacement/manual unlock; background locks, group-member defaults and logo lock payloads.
- Existing full Chrome mock workflow passes all panels, source drops, groups/gallery/presets, repeated MVR writes, Undo/Redo, Save/Load and mobile fit. Focused Chrome confirms MVR screen-PVW creation locked with 24 px UMD, manual unlock, a 4:3 input replacement that refits/relocks, compensated numeric resize, and replacement of an unlocked Programming PVW layer that refits/relocks. No Fix click needed and no page errors. Screenshots inspected (`wo031-mvr-locked.png`, `wo031-program-locked.png`).
- Source-size check: 93 source files under 500 lines; static client build and diff checks pass.
- All six portable archives rebuilt and verified for current-source/archive hashes, architecture, contents, fonts/licenses and launcher permissions. Extracted Intel Mac launcher/runtime/HTTP smoke passes. Non-native OS and Pi execution remain target QA. Existing alpha archive filenames now contain this change.
- Updated :3211 server serves UMD-aware drop sizing; no physical device writes were performed. Physical source routing/UMD/lock display remains owner QA. Logs: `/private/tmp/pixelhue-full-client/wo031-*.log`.
