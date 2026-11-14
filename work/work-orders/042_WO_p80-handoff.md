# WO-042 — P80 handoff from HighAsCG: Multiviewer on the P80, opacity rule, restart re-auth

**Status: DONE (2026-11-14, offline suite + mock Chrome; no P80 was reachable from this machine — P80 proof is the HighAsCG WO-1042/1050 record)**

Source: `../p-80handoff.md` (written 2026-11-14 from the HighAsCG repo, which vendors Studio v1.6.0-alpha.2,
commit 627786f). Prior Studio work on the P80: WO-004 (model detection, P80 input mapping), WO-021 (AUX screens
as MVR sources are P10/P20-only).

## Investigation

The handoff's porting checklist (§7), checked item by item against Studio at 38a384d:

| # | Handoff item | Studio before this WO | Action |
| --- | --- | --- | --- |
| 1 | Discovery must not take `list[0]` | Already correct: `lib/pixelhue.js:157-176` matches by IP (hostnames resolved), or by serial, and probes only the entered address. Test `IP-only discovery in the presence of another device`. | none |
| 2 | Model table 30006 → P80 with fallbacks | Already there (`lib/pixelhue.js:13`, `:184-190`). | none |
| 3 | MVR gated to `['P20','Q8']` | Five gates: `lib/pixelhue.js:204`, `:205`, `:221`, `lib/mvr-layers.js:33`, `lib/mvr-templates.js:18`. A P80 got `capabilities.mvr: false`, empty screens/layers and 403 on writes. HighAsCG patched its vendored copy (their commit 06cd5d23) and proved on a real P80: MVR 1/MVR 2 read as `screenIdObj.type 8`, 11 windows, 26 sources, reversible window move 965→967→965. | **fix** |
| 4 | Stale texts/tests | `public/app.js:125` tooltip "available for P20 and Q8"; `README.md:19`, `:22`, `:156`; `test/multi-model.test.js:37` (P10+P80 MVR guard) and `:72` (P80 connect must not query list endpoints) assert the old behaviour. | **fix** |
| 5 | Re-auth once when the switcher restarted | Not present: `call()` (`lib/pixelhue.js:198`) used the token from connect forever. The token is keyed to `startTime`, so every call after a device restart fails until the operator reconnects. | **fix** |
| 6 | Masked layers keep the full `window` | Not a bug here: Programming shows and writes the full window and edits `mask` as its own effect (`lib/layer-effects.js` mask section, px + ratio). No shown-rect conversion exists that could go wrong. | none |
| 7 | `layers/opacity` → code 8210 on bkg and mvr layers (measured on the P80) | Studio never offers it: Programming lists only layer types 2, 4, 32, 256 (`lib/program-geometry.js:17`) and `effect` resolves the layer from that list. But the mock accepted opacity on any layer, so nothing would catch a regression. | **mock rule + test** |
| 8 | Layer ids are re-used after takes | Studio keeps no layer id across sessions for main screens; every Programming action re-reads the device first. MVR presets (WO-040) store MVR window ids, and MVR outputs have no take. Remaining exposure: a second operator taking on the device between Studio's last refresh and a write — the write then lands on whatever now holds that id. Not changed; see "Not done". | none |
| 9 | Read back after geometry/source writes; respect `pgmEdit` | Already there (`verified()`, WO-020/WO-034). | none |

P80-specific rules that stay as they are: no 512×480 input-window cap (`public/mvr-geometry.js:82`, P10/P20 only;
nobody has measured a P80 limit) and AUX screens allowed as MVR sources (`lib/mvr-layers.js:18`).

The handoff also notes a device with `modelId 25132` in the P80's discovery list. It is not in `MODELS`; Studio's
LAN scan skips it and connect refuses it as unsupported. Left alone — no evidence what it is.

## What was done

- `lib/pixelhue.js`: one exported `MVR_MODELS = ['P20', 'Q8', 'P80']` replaces the five literal gates
  (`lib/mvr-layers.js`, `lib/mvr-templates.js` import it). One list instead of five so the next model is one edit.
  Messages now say "P20, P80 and Q8".
- `lib/pixelhue.js` `call()`: when the device refuses a call (rejection or HTTP error, not a timeout or an
  unreachable host), Studio re-reads `node/open-detail`; only if the same serial reports a token different from
  the one in use (i.e. `startTime` changed — the device restarted) does it adopt the new token and repeat the call
  once. A plain refusal (8210 etc.) costs one extra GET and is reported unchanged. Chosen over HighAsCG's
  "retry any refused call" because that would send a refused write twice.
- `public/app.js` tooltip, `README.md` model table/connection paragraph/test summary.
- `test-support/mock-effects.js`: `layers/opacity` on a bkg (16) or mvr (8) layer answers 8210
  "manage param invalid", as measured on the P80.
- Tests: `test/multi-model.test.js` — P10 keeps the MVR rejection; P80 now connects with `mvr: true`, reads its
  MVR output and moves a window with readback; new restart re-auth test. `test/layer-effects.test.js` — opacity on
  a bkg layer is refused before any write, and the mock refuses it when sent directly.

## What was VERIFIED

- `npm test`: 229 passing (227 before; the two P80 tests that pinned the old behaviour were rewritten, two added).
  - `P80 HTTP connection, batch input apply and MVR editing`: through the real HTTP server against the P80 mock —
    `capabilities.mvr: true`, MVR output 1920 × 1080 read, window 10 moved to 640 × 360 at 0,0 with readback (no
    512 × 480 cap applied), `mvr-templates` answers. P10 still gets 403 with zero writes.
  - `verified discovery model selects the P80 at the entered address…`: two switchers in discovery, only the entered
    address is ever contacted.
  - `a restarted device gets a fresh token…`: stub refuses the old token after `startTime` changes → one
    `open-detail`, call repeated once and accepted; a code-8210 refusal with unchanged `startTime` is not repeated
    (PUT count pinned); a timeout triggers no `open-detail`.
  - `opacity is never sent to bkg layers…`: the effect action refuses a bkg layer with zero writes; the mock answers
    8210 when the PUT is sent directly.
- `npm run check:size`: 152 files pass. `npm run build:client`: pass.
- Headless Chrome against the mock (`p80-qa.mjs` in the session scratchpad): on a P80 the MVR tab is enabled and
  shows the output "Multiviewer" with window "Camera 1"; on a P10 the tab is disabled with the tooltip
  "Multiviewer editing is available for P20, P80 and Q8"; no page errors.
- Not proven here: anything on a physical P80 (none on this network). Owner QA: open the MVR tab on the P80 and
  move one window.

## Not done / still unproven on a P80

- Nothing here was run against a P80 from this machine. P80 MVR read and a window move were proven by HighAsCG
  with the same code path (their WO-1042). Not exercised on any P80: add/remove MVR windows, device layouts
  (`layers/template/select`), MVR source swaps, aspect-lock writes, MVR presets recall.
- How a P80 answers a stale token (code/HTTP status) is not known; the re-auth does not depend on it, but it has
  only been proven against a stub.
- Layer-id re-use between a refresh and a write (item 8) is not guarded. A guard would need the client to send
  the layer name/serial it believes it is editing with every write.
- Opacity on aux (4) and logo (32) layers was not measured on the P80; Studio still offers it there.
- All WO-036/037 features remain unproven on a P80 (only layer opacity on a normal layer was, by HighAsCG).
