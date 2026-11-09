# WO-021 — P10/P20: AUX screens are not valid MVR sources

**Status: DONE (2026-11-09; 113 offline tests, mock Chrome, live P20 read-only list)**

Owner (2026-11-09): "aux outputs cant be added to the mvr in p10/20 and they fail when tried, so they shouldnt be on the list." Follow-up to WO-020.

## Investigation FIRST
- WO-020 `mvrSources` included the PGM/PVW of Main **and AUX** screens (screen types 2 and 4). PixelFlow's Screen tab source list was not narrowed by type in the code read for WO-020, and the P20 XML gave no explicit rule. The owner reports from hardware that adding AUX PGM/PVW to the MVR fails on P10/P20.
- Q8 behaviour is unknown, so it is not restricted.

## What was done
- `lib/mvr-layers.js` `mvrSources(…, model)`: on P10/P20 only Main screens (type 2) are offered. Because `applyMvrLayer` picks sources from the same list, an AUX request is refused ("Choose a current input or screen PGM/PVW") before any write. `lib/pixelhue.js` `read()` passes `this.model`.

## What was VERIFIED
- `npm test` 113/113: the P20 mock lists no AUX sources; an AUX create is rejected with zero writes; a unit test checks AUX is excluded for P20/P10 and kept for Q8.
- Mock Chrome full-client flow passes and asserts no AUX entries in Add to MVR.
- Live P20 read-only: Add to MVR shows no AUX entries; Screen 1/2/3 PGM/PVW remain.
