# WO-040 — MVR layout preview aligned to the top; MVR presets kept in the app

**Status: DONE (2026-11-11 — 226 offline tests, mock Chrome, preset save/validate against the live P20 with no device write; a live recall and the owner's look at the alignment remain)**

Owner (2026-11-11): "the mvr window is 'centered' yet it should be adjusted to top. also add presets for mvr, without downloading them, but just written to app's memory."

## Investigation FIRST

- Earlier work: WO-001/008 (MVR editor, simplified UI), WO-007 (repeat apply), WO-037 unit 8 (device layouts). None changed the vertical placement of the preview.
- Centering: `public/style.css:76` `.canvas-surround { margin: auto 0; padding: 16px; }` inside the flex column `.canvas-panel` (`:68`). `margin: auto 0` splits the free height above and below, so on a tall window the layout preview floats in the middle with a gap under the toolbar. Reading the request as: the preview should sit directly under the toolbar.
- Existing "presets": `Save layout` / `Load layout` in the MVR footer (`public/app.js:395-417`) download and re-upload a JSON file (`format: 'pixelhue-mvr-layout'`, version 1: serial, screenId, width, height, windows[{ id, window, aspectLock, aspectMode, umdHeight }]); `public/editor.js:35 readLayout` validates it against the current device (same serial, output, resolution, window ids, UMD height, no overlap, aspect locks) before anything is applied. The owner wants the same thing without files.
- Where the app keeps its own data: `lib/group-sources.js:10` stores group sources per device serial in `$PIXELHUE_STUDIO_DATA` or `~/.pixelhue-studio`, outside the repo, so git and Syncthing never carry server-written files (CLAUDE.md rule). Browser `localStorage` would tie presets to one browser profile; the app's data folder makes them available from any browser that opens this Studio.
- A preset is the same document as a layout file, so recall goes through the same `readLayout` checks, the P10/P20 input-window size limit and the normal autosave/readback path. It stores window geometry and aspect locks for the windows that exist; it does not add, remove or re-source windows (the device layouts from WO-037 do that).

## What was done

- `public/style.css`: `.canvas-surround` margin `auto 0` → `0 0 auto`. The preview now starts under the toolbar and the spare height sits below it.
- `lib/mvr-presets.js` + `/api/mvr-presets`: presets per device serial in `mvr-presets.json` in the app data folder (same place and atomic write as group sources). Save validates the document against the connected device (serial, output, resolution, window ids, geometry inside the output, aspect locks); the same name on the same output overwrites; rename, delete; at most 64 per device. Nothing is sent to the device on save.
- `public/mvr-presets.js`, `public/index.html`, `public/app.js`, `server.js`: in the MVR footer, next to Save/Load layout: a preset list for the shown output, **Recall**, **Save preset**, **Delete**. Recall runs the shared `loadLayoutDocument` (extracted from the file loader in `app.js`), so it has the same checks, Undo step and autosave/readback as loading a file. File Save/Load stay for moving layouts between machines.
- Why not `localStorage`: presets would exist in one browser profile only; the app data folder serves every browser that opens this Studio and survives clearing site data.
- Limit, same as layout files: a preset stores positions, sizes and aspect locks of the windows that exist. If windows were added or removed since, recall is refused with "The number of MVR windows has changed"; it does not recreate windows or sources.

## What was VERIFIED

- `npm test`: **226 passing** (2 new in `test/mvr-presets.test.js`: stored per device in the data folder, zero device writes, stored document passes `readLayout`, overwrite/rename/delete, other device sees nothing; eight kinds of invalid request store nothing). `check:size` 152 files ≤ 500 lines (`app.js` 430), `build:client` pass.
- Headless Chrome against the mock, with the workspace made taller than the preview (as a long window list does): gap above the preview 0 px, below 781 px; with the previous CSS the same measurement was 391 / 391 px. Save preset → move a window → Recall restored the device geometry; the preset survived a page reload; Delete removed it; no page errors.
- Live P20, no device writes (transport guard allowed none; write log unchanged at 74 lines): saved the real 14-window MVR arrangement as a preset, the stored document validated against the live state with identical geometry, then deleted it. A temporary data folder was used, so the owner's preset store was not touched.
- Not verified: a recall on the live device (it rewrites MVR geometry, and the device was in use), and whether "centered" meant this vertical placement — the owner should look.
