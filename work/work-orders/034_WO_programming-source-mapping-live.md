# WO-034 — Programming physical source mapping and live-first list

**Status: DONE (2026-11-10 — 175 offline tests, Q8 capture and mock Chrome status-refresh checks)**

## Investigation FIRST

Owner requests Programming sources ordered/labeled by physical mapping (IN 1-1, 2-1, 3-2…) with live indication and live sources first. Follow-up to WO-027/032.

- `lib/studio-programming.js:18` retains API enumeration order and drops physical slot/connector metadata. `public/source-tabs.js:23` renders only the editable name and resolution; input filtering searches names only. Renaming and interface enumeration must not determine physical ordering.
- PixelFlow `src/pages/devices/components/input-attr-panel/input-base-atrr/index.tsx:157` uses one-based Q8 input slot/connector mapping, special ST2110 card 30983 mapping, and P80 printed connector group numbers. `components/common/source-list/utils.ts:189,565` uses the firmware alias where reported and supports physical/signal ordering. Q8 capture reports Input 3-1 (slotId 2, connectorId 0) before Input 2-1 (slotId 1, connectorId 0), proving API order differs from panel order. P10/P20 use their known fixed input numbers and paired connector choices, not SLOT 101 for the main board.
- Initial inspection compared raw state with `InterfaceStatusE` (display-only), incorrectly suggesting raw 3/4 meant no-signal copy/disabled. Corrected before deployment: `editor1/common/enum.ts:748` defines raw `LinkStateE`: 0 no link, 1 normal, 2 overloaded link, 3 unstable, 4 nonstandard link, 5 nonstandard no link, 6 overloaded no link, 7 signal backup, 8 no-signal backup. `mvr-signals.js` already documents the conversion distinction. Preserve connected 1/2/3/4, include connected backup 7, show warnings for 2/3/4, and let physical offline override stale state. Do not use display-state numbers directly.
- Programming refreshes after actions, not regularly while idle. Add a metadata-only poll while visible, guarded against connection changes, edits and drags; preserve filters, selection and scroll. No live input video or full-layout/preset polling.

## What was done

- Added `lib/program-sources.js` for physical mapping and raw-signal normalization: firmware aliases when present; Q8 one-based slot/connector (including the 100G ST2110 special case); P10/P20 fixed panel input numbers with HDMI/DP paired; P80 printed connector groups from cached card XML. Sources sort live-first, then numeric physical mapping, with stable IDs as ties; names do not control order.
- Programming source rows now show physical mapping, editable name, resolution and a compact green Live/gray No signal badge. Raw overload/unstable/nonstandard signals show warning badges; offline and unknown status cannot appear green. Mapping/name search, source selection and group-source options include physical identifiers.
- Added a session/origin-guarded read-only `/api/programming/sources` endpoint. It reads only interface metadata (P80 initially uses the cached device configuration for mapping); it does not load layers, presets, gallery or video streams. PUT returns 405 without a native write.
- Programming polls source metadata every two seconds while visible. It guards busy edits/drags, connection/revision changes and concurrent polls; does not repaint canvases; preserves source selection, filter/caret/focus and list scroll. Other source-tab forms are left intact. Failed reads show Status unavailable until a successful refresh, avoiding stale green badges. Hidden panels stop polling; reopening restarts it.
- Added six behavior/API tests to the curated CI runner. Updated README and the Programming parity record; native persistent source groups/global mapping and a signal-only filter toggle remain tracked as missing.

## What was VERIFIED

- `npm test`: **175 passed**, zero failed/skipped. New tests cover shuffled names/API IDs, numeric IN 1-2 vs IN 1-10, original Q8 capture mapping (Input 3-1 vs Input 2-1), P10/P20 paired inputs and SDI numbers, raw LinkStateE states, offline overrides, inactive/output exclusion, firmware aliases, Q8 ST2110 subports, P80 printed groups, metadata-only refresh and session/origin/read-only HTTP guards. Existing geometry, replacement-fit, aspect/UMD, groups/gallery, presets and Advanced inputs remain green.
- Headless Chrome on local Q8 mock: live-first physical order; a newly connected input moves to the top without Refresh; a disconnected input moves below live inputs; name/mapping filter retains its text/focus; selected source and all layer geometry are unchanged; no full Programming reloads during polling. Group form draft survives updates; failed polling removes green badges and recovery restores them; hidden Programming stops source API requests. Zero device writes and page errors. Screenshot `/private/tmp/pixelhue-browser-qa/wo034-physical-live-sources.png` inspected.
- `npm run check:size`: 107 source files <=500 lines; `npm run build:client` and diff whitespace checks pass. No physical device settings changed. Source mapping evidence uses the original extracted code and captured Q8 interface data; live hardware status display remains owner QA.
