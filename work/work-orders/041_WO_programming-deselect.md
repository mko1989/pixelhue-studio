# WO-041 — A Programming layer could not be deselected

**Status: DONE (2026-11-11 — 227 offline tests, mock Chrome with a full-screen layer; no device involved, selection is client-side)**

Owner (2026-11-11): "im not able to deselect a layer in programming."

## Investigation FIRST

- No earlier work order mentions deselecting.
- `public/program-stage.js:108` (before): `const target = event.target.closest('.program-layer, .group-frame'); if (!target) return;` — a click on empty canvas did nothing, so once a layer was selected the only way to change the selection was to pick another layer. There was no keyboard way either (`public/programming-ui.js` handled arrows and Delete only), and clicking the selected entry in the layer list re-selected it.
- On the owner's show the PVW layers cover the whole 7680 × 2160 screen, so the only empty canvas is the margin around the screen (WO-023); it has to count as empty space too.
- Selection is purely client-side state (`selectedId`); nothing is sent to the device when it changes.

## What was done

- `public/program-stage.js`: a click on empty canvas, inside the screen or in the margin, clears the selection.
- `public/programming-ui.js`: **Escape** clears the selection anywhere in Programming except while typing in a field or dragging; clicking the already selected entry in the layer list deselects it.
- With nothing selected the inspector and the layer tools show their existing "select a layer" hints.

## What was VERIFIED

- `npm test`: **227 passing** (one source pin for the three paths in `test/studio-client.test.js`). `check:size`, `build:client` pass.
- Headless Chrome against the mock with a layer covering the whole screen: select → click the canvas margin → nothing selected and both hints shown; select → Escape → nothing selected; list entry click selects, second click deselects; Escape inside a position field keeps the selection; zero device writes during all of it; no page errors.
- Not checked by the owner yet on the real show layout.
