# WO-028 — MVR input windows limited to 512 × 480 on P10/P20 (glitch-free size)

**Status: DONE (2026-11-09; 130 offline tests, mock Chrome, live P20 read-only drag/typing check)**

Owner (2026-11-09): "the mvr layout editor should not let input windows to be bigger than their glitchless limit which seems to be 512x480. for p10/20 at least."

## Investigation FIRST
- The device does not advertise this limit. Live P20 `layer_8.xml` (MVR layer) `Window Width/Height Min 64 Max 131070`, Roam 1, and no other size field in the MVR XML. So the rule is an **owner policy from hardware observation**, implemented as such and scoped to P10/P20 and **input** sources (sourceType 2). Screen PGM/PVW windows are not limited. Q8 is unchanged (not observed).
- Live MVR (read-only): every input window is already within the limit (largest 469×288, Input 1). The screen windows are 849×307 and 582×218 (not limited).
- Sizing paths in the MVR editor:
  - `public/editor.js dragWindow` (resize handles);
  - numeric width/height (`app.js` key handlers with `ratioSize`);
  - `edit()`, Undo/Redo and Load layout (`readLayout` → `restore`);
  - Fix aspect ratios (`fixAspectRatios` only fits **inside** the current window or uses the 64 px minimum, so it never grows);
  - new windows (`mvr-sources.js placeWindow`) and source swaps (`lib/mvr-layers.js`);
  - server `validateChanges` (`lib/pixelhue.js`).
- The existing WO-006/007 regression tests use input windows larger than 512×480 (e.g. 900×506, 640×500) and assert that established windows stay movable/fixable and that overlap errors come first. A blunt "every input window ≤ 512×480" check broke 11 of them. The owner's intent is that windows cannot be **made** bigger, so the rule is "never grow past the limit"; moving or shrinking an older oversized window stays allowed. This keeps those guards intact without weakening assertions.

## What was done
- `public/mvr-geometry.js`: `INPUT_WINDOW_LIMIT` (P10/P20 → 512×480), `windowLimit(model, sourceType)`, `withinLimit`, `growsPastLimit(next, before, limit)` and `shrinkToLimit` (keeps the locked content ratio incl. UMD, top-left anchored).
- `public/editor.js dragWindow(…, max)`: resize bounds are capped (cap = limit, or the window's start size if already larger, so it can only shrink).
- `public/app.js`:
  - numeric locked resize uses the capped bounds;
  - `edit()` shrinks a growing input window to the limit with a notice;
  - **Load layout** refuses a layout that would grow an input window past the limit;
  - new MVR windows are placed within it.
- `public/mvr-sources.js placeWindow(…, limit)`.
- Server: `validateChanges` rejects growth past the limit (after the overlap check). `applyMvrLayer` rejects oversized input creates, and **shrinks a larger window to the limit before routing an input into it** (e.g. swapping a screen window to an input).

## What was VERIFIED
- `npm test` **130/130**, including `test/mvr-input-limit.test.js` (2; added to CI FILES):
  - limit scoping (P10/P20 inputs only);
  - growth vs shrink of oversized windows; locked-ratio shrink; drag cap at 512×480; placement inside the limit;
  - server refuses growth and oversized creates with zero writes; swapping an input into an 800×450 screen window shrinks it first.
  - All WO-006/007/010 MVR tests still pass unchanged.
- Mock Chrome: the full flow with the fixture input window within the limit; Load layout of an oversized layout is refused with the limit notice and the window unchanged.
- **Live P20 read-only (PUT blocked):**
  - dragging Input 1's corner far out stopped at **508×310** (locked ratio, width capped);
  - typing width 900 was capped to **512**;
  - the only autosave attempt was aborted by the harness, so no device write.
