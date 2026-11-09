**Status: DONE (2026-11-06, 44 passing tests and Chrome checks for all three models; physical-device QA pending)**

**Capacity follow-up:** [WO-005](005_WO_capacity-dist.md) replaces the generic SL/DL/4K choices with the owner's model-specific policy: P20 DL/4K, P10 SL/4K, P80 4K only. Device-managed value preservation still applies.

## Investigation FIRST

Move the connection form/status into the masthead and support P10/P80 inputs only, retaining P20 MVR and inputs.

- Current `mvr-app/public/index.html:13` has a separate connection form below the header; `public/style.css:18` adds its separate row padding. Place the same controls inside the header with responsive styling.
- Companion `src/config/modelMap.ts:5` identifies P10=28945, P20=28944, P80=30006. All three model configs use `/unico/v1`, HTTPS discovery :19998, and the same interface list-detail endpoint. Discovery model IDs must come from the serial-verified record; explicit-port connections can read authenticated `node/detail` to identify the model.
- Vendor source map `src/pages/devices/const.ts:748` maps P10: slot 100/model 28945 holds four DP/HDMI input pairs; slot 0/model 15728900 holds SDI Input 5–6 (indices 0/1 and 2/3), with optical connectors at 4–7. Output slot 1/model 15728899 must be excluded.
- P80 has installed input cards rather than the P10/P20 fixed backboard. `src/pages/devices/components/input-attr-panel/input-base-atrr/index.tsx:191` labels individual P80 inputs by slot/connector; `input-subcard-attr/InputSubcardAttr.tsx:1013` includes P80 in input mode configuration and retains per-connector capacity at line 1157. The shared API assesses/writes subcard modes. Enumerate actual `interfaceType === 2` interfaces joined to their card connector records, preserving physical connector types and work modes. Do not guess a fixed input count or repurpose outputs.
- Current `lib/pixelhue.js:150` always reads MVR state on connection. P10/P80 input-only support must not depend on screen/layer reads and must reject MVR writes server-side, in addition to disabling that UI tab.
- Prior WOs establish SDI EDID exclusion, session guards, output/optical protection, readback and no runtime persistence. Preserve those constraints.

## What was done

- Moved IP address, Connect, connection options and model/IP/serial status into one responsive masthead. Added `public/connection.css`; no separate connection row remains. Renamed the app Pixelhue Studio.
- `lib/pixelhue.js` detects supported model IDs from the serial-verified discovery record/public detail, or authenticated `node/detail?nodeId=1` (`modelId`, legacy `modeId`, or `configInfo.modeId`). P10/P80 return an input-only capability descriptor without screen/layer queries; MVR writes are rejected server-side. Unknown models fail explicitly.
- Added `lib/input-models.js`: P10 fixed backboard mapping and P20 mapping retained; P80 inputs derive from actual interface-role/card-connector joins. Physical P80 ports cannot be switched by row/bulk port controls. Names, supported EDIDs and capacities use the common assessment/write/readback flow. Device-managed capacities are preserved and excluded from bulk capacity changes; SDI has no EDID.
- UI auto-opens Inputs for P10/P80, disables the MVR tab, shows correct connector types including DP 1.4, and adapts counts/help text to the model. P20 retains both tools and its twelve inputs. Batch limits follow discovered inputs (bounded at 512), allowing a P80 batch larger than twelve rows.
- Extended the mock fixture with P10 and synthetic modular P80 card configurations; added multi-model tests and updated docs/checklist. Vendor sources were not modified.

## What was VERIFIED to work

- `cd mvr-app && npm test`: **44 tests passed**, 0 failed. Added P10 six-input mapping; P80 actual installed input mapping, DP 1.4 EDID capability, missing-card-interface omission and managed capacity; HTTP batch writes/readback for P10 and a 16-input P80 fixture; preserved output/optical modes; no screen/layer reads and MVR-write rejection for input-only models; verified-discovery model selection and unknown-model rejection. Prior P20 discovery/MVR/SDI tests remain green.
- Chrome via temporary Playwright at 1440×1000 and 390×844 for P10/P80: top-bar controls/status placement, model identity, automatic Inputs tab, disabled Multiviewer, six P10 inputs / sixteen installed P80 fixture inputs, bulk fill/apply/readback, P80 fixed ports and disabled bulk port selector, managed capacity preservation, no MVR HTTP requests, no browser errors or document overflow. Desktop P10 and mobile P80 screenshots visually reviewed.
- P20 browser regression suite passed after header/model changes, including twelve inputs, full batch editing, SDI protection and MVR Apply/tab state preservation.
- Node syntax checks passed; all files below 500 lines. No root Git repository or curated CI test list exists, so no commit or CI list update was possible. Browser/mock servers closed after QA; no runtime files are persisted by the app.
- **Not verified on physical devices:** P10/P80 card/firmware acceptance, actual signal acquisition/EDID negotiation, or P20 physical output. Mock P80 card IDs are synthetic and not a claimed device configuration. Continue with the owner checklist on real equipment.
