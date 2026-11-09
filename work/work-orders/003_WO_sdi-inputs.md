**Status: DONE (2026-11-06, 38 passing tests and Chrome desktop/mobile verification; hardware QA pending)**

## Investigation FIRST

Owner correction: P20 has 12 logical inputs, including four SDI inputs. WO-002 incorrectly treated the first eight HDMI/DP groups as the complete input inventory.

- `mvr-app/lib/inputs.js:4` omits slot 3 and caps writes at eight rows. The mock fixture and tests repeat that incomplete inventory.
- Vendor source map `src/pages/devices/const.ts:1265` (extracted read-only to `/tmp/pixelhue-reference/src__pages__devices__const.ts`) maps slot 3, model 15728898 to Input 9–12, each with SDI_12G (type 13) connector indices 0/1, 2/3, 4/5, 6/7. OPT connectors occupy indices 8–15 and must not be changed. These API connector groups are not a physical-port count.
- SDI has no EDID negotiation. SDI rows should permit names/capacity, display detected signal timing, preserve existing connector work modes, and reject EDID or rerouting requests. Bulk HDMI/DP choice and EDID presets should leave SDI fields alone.
- Keep WO-002's verified IP discovery and MVR behavior. Add SDI coverage and full 12-row batch validation.

## What was done

- Added slot 3/model 15728898 to P20 input normalization, exposing logical Inputs 9–12 and their actual SDI connector records. Summary reports logical input families instead of treating API aliases as physical sockets.
- SDI names and capacities participate in bulk changes. Mode payloads preserve current SDI connector work modes and exclude optical indices 8–15. EDID and rerouting requests for SDI are rejected by the server.
- UI displays fixed SDI port labels and detected signal timing in place of EDID fields. Bulk HDMI/DP choice and EDID presets skip SDI. Batch limit raised from eight to twelve.
- Mock device now includes the SDI card and protected optical connectors. Extended inventory, validation, SDI write, and all-twelve batch tests. Corrected README/checklist and annotated WO-002's incomplete inventory as superseded.

## What was VERIFIED to work

- `cd mvr-app && npm test`: **38 tests passed**, 0 failures. Checks all 12 logical inputs, SDI group indices/types, EDID/rerouting rejection, SDI name/capacity writes, unchanged SDI routing/optical connectors, and a complete 12-input name batch, alongside prior discovery/MVR/input regressions.
- Chrome browser checks at 1500×1000 and 390×844 passed: 12 rows (8 HDMI/DP + 4 SDI), fixed SDI controls, no SDI EDID fields, full 12-row bulk fill and Apply/readback, preserved SDI work modes/optical ports, no timing writes to SDI, prior MVR/tab/refresh flows, no page errors or document overflow. Desktop screenshot visually reviewed.
- Node syntax checks passed; modified code/test files remain below 500 lines. Workspace is still not a Git repository, so no commit was possible. No vendor sources changed.
- Physical P20 signal behavior remains owner-QA; no live device writes were made. See `work/checklist-mvr.md` for SDI verification.
