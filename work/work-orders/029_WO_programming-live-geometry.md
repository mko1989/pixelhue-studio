# WO-029 — Send Programming layer geometry while editing

**Status: DONE (2026-11-10; 138 tests, delayed-device Chrome and local deployment verified; physical output smoothness owner QA)**

## Investigation FIRST

Owner asks for position/size changes in Programming to appear on the edited device screen as soon as possible. Follows WO-016/023/024/025/026; preserve roaming limits, aspect-aware resizing, grouped inputs and per-screen PGM locks.

- `public/program-stage.js` updates only the browser during pointermove, restores old geometry on pointerup, then sends one command. The device cannot follow a drag until release.
- `public/programming-ui.js` routes all geometry through global `operation()`, disabling controls until the response, then rebuilds the entire panel. Arrow nudges and numeric edits therefore block and can lose repeated input while a write is running.
- `lib/studio-programming.js:applyProgramming` reads all screens, layers, interfaces, presets, configuration and group-source definitions before a geometry write and repeats that complete read for verification. Most of that data is unrelated to moving/resizing an existing layer.
- Keep the server's session/origin checks and serialized writes. A lean geometry path must still validate current screen membership, current PGM lock, global-coordinate bounds, normal/AUX/logo layer types, grouped geometry and exact device readback. No arbitrary API proxy or optimistic success claim.

## What was done

- Added `public/program-sync.js`: first update starts immediately; intermediate updates are throttled to 40 ms with one request in flight and one newest pending rectangle per target. Commit/release flushes without the throttle delay, failure stops automatic retries, and connection generations discard old replies/unsent writes.
- `public/program-stage.js` publishes position/size during pointer movement while retaining existing aspect/snap/roam/group behavior. Pointer release commits the final rectangle; pointer cancellation sends the original geometry back because the device has already followed intermediate edits.
- `public/programming-ui.js` uses optimistic geometry and the live queue for drag, numeric fields, arrow nudges, align and fill without global busy or rebuilding stages/inspector. Readback only updates accepted geometry; newer edits, active drags and focused numeric input survive. Background metadata refresh uses an edit revision guard. Other Programming commands (including Take/source/aspect/presets) drain and verify pending geometry first. A small Live/Sending/Not saved status and explicit Retry save expose failures.
- `public/layer-tools.js` sends valid integer input values on input, flushes on change and computes subsequent actions from current geometry rather than a stale rendered rectangle.
- Added `lib/program-geometry.js` and session/origin-guarded `/api/programming/geometry`: reads current screens/layers, validates the complete batch (including PGM locks), writes one native `layers/window` batch and verifies only layer readback. No interfaces, presets, gallery or group-definition reads on the hot path. Shared layer normalization, geometry validation and roam discovery prevent divergence from full Programming actions. Both members of a group stay in one device write.
- Added eight regression tests and the curated CI entry; README describes live-edit and cancel semantics.

## What was VERIFIED

- `npm test`: **138/138 passed** (130 existing + eight live queue/route tests). Covered immediate first send, bounded single-flight/newest-wins behavior, final flush, failed-write retry/cancellation restoration, connection reset, lean request counts, global coordinate translation, batch validation before writes, PGM lock/membership/bounds/origin/session guards, grouped batching and silently ignored-write detection.
- `npm run check:size`: 89 source files, all under 500 lines. `npm run build:client`: module syntax and static assets pass. `git diff --check` passes.
- Chrome against a mock with 160–220 ms write delay: numeric geometry reached the device while its field stayed focused; later X/Y edits and 12 rapid nudges all landed without disabling controls. During a held drag, confirmed mock geometry changed after 231 ms with an artificial 180 ms firmware delay, before pointerup. Final release landed the newest rectangle; pointer cancellation restored original device geometry; held resize and grouped movement were live. Rejected write retained editable geometry and Retry sent the newest value. Source change waited for the last geometry write. No page errors and no MVR writes.
- Existing full Chrome workflow also passes: Device/Inputs/Outputs/Screens/Programming/presets/groups/gallery/MVR, Save/Load, repeated writes and 390px mobile fit.
- Logs and screenshots: `/private/tmp/pixelhue-full-client/wo029-*.log`, `/private/tmp/pixelhue-browser-qa/wo029-programming-live.png`. Physical output latency/smoothness remains owner QA; no production geometry writes were made during development.

- Restarted only this checkout's development server on localhost:3211; verified the new program-sync module is served and the geometry API returns the expected unconnected-session 409. No hardware was connected or written by this deployment smoke.
