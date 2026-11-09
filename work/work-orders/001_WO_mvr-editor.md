**Status: DONE (2026-11-06, automated mock-device suite and Chrome UI verification; physical P20 acceptance remains owner-QA)**

**Follow-up:** [WO-002](002_WO_input-creator.md) replaces the original single-device discovery assumption, removes the demo implementation described below, and adds input setup. The demo and original discovery descriptions are historical; use WO-002 for current behavior.

**Aspect/overlap follow-up:** [WO-006](006_WO_mvr-aspect.md) replaces the original global aspect checkbox with per-window native locks and connected-input correction. It adds mandatory overlap prevention for editing, imports and server Apply; use WO-006 for current geometry/lock behaviour.

## Investigation FIRST

No prior work orders or application exist at workspace root; `extracted-source` is the vendor Electron app and the other directory is the Companion module. Build an independent local app in `mvr-app` without altering either reference.

- `companion-module-pixelhue-switcher-2.2.7/src/config/devices/P20.ts:6` uses HTTPS discovery on port 19998, HTTP on the discovered device port, and `/unico/v1` API paths.
- `src/services/ApiClient.ts:60` selects a discovered device, reads `/unico/v1/node/open-detail`, then signs a token using SN and startTime. `src/utils/utils.ts:3` specifies HS256, payload `{SN: sn}`, no timestamp; `src/services/HttpClient.ts:30` sends the token directly in Authorization.
- `src/interfaces/Screen.ts:51` identifies MVR screen type as 8. `src/interfaces/Layer.ts:23` attaches layers via `layerIdObj.attachScreenId`. Only layers attached to an MVR screen should ever be writable here.
- `src/services/ApiClient.ts:246` sends `PUT /unico/v1/layers/window` with `[{layerId, window: {x,y,width,height}}]`. Its list-detail reads provide geometry for readback.
- Supplied `PixelFlow-OpenAPI Manual-V2.0.1-2.pdf`, sections 1.2, 4.2.1, and layer list-detail, documents SN/startTime, screen type 8, and pixel window fields. Extracted for investigation with installed pdfminer (temporary `/tmp/pixelhue-api.txt`). Its example response codes include 200; vendor web code checks 0.
- `extracted-source/web/unicos/static/index-CFxZFQwf.js:1` reads MVR dimensions from `screen.timing.horizontal.addTime` and `vertical.addTime`. It disables input width/height when `Features.Layer.TemplateFixedInput.Support === 1`, and checks overlap/out-of-bounds. Moving/resizing via API is not proof that arbitrary geometry works on a P20. Device readback and owner hardware QA are required.
- Workspace is not a Git repository; committing is unavailable here.

## What was done

- `mvr-app/lib/pixelhue.js`: dependency-free Node HTTP/HTTPS transport and HS256 token generation matching Companion. Optional explicit API port and serial selection. Device response codes, transport timeouts, MVR membership, bounds and duplicates are checked. Geometry writes are followed by up to three readbacks; ignored or modified geometry is reported as failure with actual state.
- `mvr-app/server.js`: local server, static UI and JSON endpoints, serialized operations and connection session checks. Default binding is 127.0.0.1:3210. No runtime files or tokens are persisted.
- `mvr-app/lib/demo.js`: isolated editable demo; no device calls.
- `mvr-app/public/`: responsive canvas with pointer dragging, four resize handles, pixel fields, snapping, aspect lock, arrow nudges, center alignment, undo/redo, explicit Apply, Refresh and JSON layout save/import. Source text is rendered with DOM textContent. Layout imports are bound to device serial/output/resolution/window IDs.
- `mvr-app/test/`: protocol and HTTP integration tests with a mock device, plus geometry and import validation tests.
- `mvr-app/README.md` and `work/checklist-mvr.md`: startup instructions, firmware limitations, API provenance and hardware QA handoff.
- Used the Sites skill local-only workflow because this app talks to LAN hardware. In-app browser JavaScript execution tool was unavailable; used temporary Playwright with installed headless Chrome for browser QA. No hosting or external publication.

## What was VERIFIED to work

- `cd mvr-app && npm test`: **23 passing tests**, 0 failures. Tests include actual local HTTP handshake/authentication, exact Companion write payload, MVR filtering, rejected PUTs, acknowledged-but-ignored writes, HTTP/application/JSON failures, stale connection sessions, cross-origin requests, demo isolation, boundaries, resizing and layout import validation.
- Node syntax checks passed for the server, device client and browser JavaScript modules.
- Browser QA at 1440×1050 and 390×844 in installed Chrome via temporary Playwright: demo, numeric edits, undo/redo, keyboard nudges, pointer drag, corner resize, Apply, JSON download/import, Refresh, window selection, boundary clamping and aspect lock passed, with no page errors.
- Desktop and mobile screenshots rendered and visually reviewed. First mobile render clipped the canvas and property controls because of grid min-content sizing; fixed with zero minimum tracks/panels and reran browser interactions plus canvas/field bounding checks. Final screenshot fits all controls.
- All new files are under 500 lines. No Git commit: workspace root is not a Git repository. Reference vendor and Companion sources were left unchanged.
- **Not verified on physical hardware:** P20 reachability, firmware-specific free-position/size support, and physical MVR output. Device IP/serial was not provided. Complete `work/checklist-mvr.md` on the intended P20. Demo and mock success must not be interpreted as proof that firmware accepts arbitrary geometry.
