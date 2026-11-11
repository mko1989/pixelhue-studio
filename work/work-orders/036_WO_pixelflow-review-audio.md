# WO-036 — PixelFlow parity review; Audio matrix tab

**Status: DONE (2026-11-11 — review, Audio tab, layer effects, device clock/protection; 200 offline tests + mock Chrome; no hardware write was possible, P20 unreachable; remaining parity stays in WO-017 and docs/pixelflow-parity/BACKLOG.md)**

Owner (2026-11-11): "do a review of the pixelhue studio app. check if everything that is in pixelflow is available in the app (apart from live view). there is definitely no audio matrix settings, but there may be more. check against the extracted source and api. add what's missing. the idea is simpler quicker no-bullshit version of pixelflow."

Follows WO-032 (source inventory, 121 feature groups) and WO-017 (programming parity, OPEN).

## Investigation FIRST

### State of the existing audit
- `docs/pixelflow-parity/` (WO-032) already lists 121 feature groups: 9 implemented, 34 partial, 76 missing, 1 excluded (live input video), 1 not rendered. It is still accurate for the code at `0419456`; nothing in it had been implemented since except output capacity (WO-035).
- Many of the 76 "missing" groups do not apply to the owner's P20: LED/controller families (SCREENS-14…18, GLOBAL-08/10/11/12), ST2110/IP/optical cards (INPUTS-14/15/16, OUTPUTS-08/09), Dante (AUDIO-03, DEVICE-22), COM/IPC cards (DEVICE-23/24/25), KVM (PROGRAMMING-25), USB media (PROGRAMMING-21). The live P20 feature XML (`/private/tmp/pixelhue-umd-live/config.xml`, `deviceconfig/device/feature.xml`) reports `Correction`, `Processing`, `Monitor`, `InternalSource`, `LedSource`, `DeviceBackup`, `ConnectRotate`, `VideoInterfaceTestPattern`, `AudioDante` all `Support="0"`.

### Audio (the gap the owner named)
- PixelFlow menu: `src/config/topMenu.ts` NPQD_MENUS → Audio Matrix, gated by `utils/device.ts:637 judgeSupportAudioMatrix`: feature XML `Audio@Support && Audio/AudioMatrix@Support`, **or** a P20 with DS card (`utils/index.ts:1913`, subcard modelId 15728933).
- Live P20 feature XML: `<Audio Support="1" Editable="1">` with `<AudioMatrix Support="1" Editable="1"/>`, `<AudioDante Support="0">`. So the owner's P20 does have the matrix; Studio had no surface for it at all.
- API (`src/api/audio-matrix/index.ts`):
  - `GET audio/matrix-detail?nodeId=1` → `{ columnHeader[], rowHeader[], matrixData[row][col] }`.
  - `POST audio/matrix-mapping` body `[{ columnHeader, rowHeader, mappingEnable: 0|1 }]`.
  - `POST audio/matrix-base` body `[{ interfaceId, channelIndex, isMute, testAudioEnable, channelType }]`.
  - `audio/matrix-preset` (GET/POST) and `POST audio/preset` exist in the API file but have **no caller** anywhere in the PixelFlow UI source → not a PixelFlow feature, not added.
- Header format (`pages/audio-matrix/const.ts`, `utils.ts:getInfoFromHeaderStr`): `"slot,connector,channel,interfaceId,isValid"`. Rows = inputs, channel type RX = 1; columns = outputs, TX = 2 (`@unico/base …/AudioChannelList/enum.js`). Headers with `isValid` 0 are not shown (`matchInterfaceInfo` returns false).
- One input per output: `presenter/audioMatrix.ts:updateMatrixData` turns off the output column's previous row when a new crosspoint is enabled and PixelFlow posts **only** the new crosspoint, so the device replaces. Clear all posts `mappingEnable: 0` for each active crosspoint (`handleClearAll`).
- Mute / test tone (`handleSound`): one `matrix-base` item per channel, carrying both flags (the unchanged one is re-sent with its current value).
- Channel data comes from `interface/list-detail` → `audio.channelInfo[] { channelId, channelIndex, channelType, channelLabel, isMute, state, isValid, testAudioEnable }`. Live capture (`/private/tmp/pixelhue-full-client/live-readonly.json`): 12 video inputs × 2 RX channels, 8 HDMI outputs × 2 TX, plus slot 3 analog `Audio In -1/-2` (type 52, interfaceType 256, RX) and `Audio Out -1/-2` (type 53, TX). OPT/AUX/MVR outputs report no channels. Signal state is shown only for non-analog inputs (`hasStatus`).

### Audio-adjacent items the WO-032 audit did not list
- **Screen audio** (Programming toolbar volume/mute/source): `handleScreenAudioSetting.ts` → `setScreenAudio` posts to `ucenter/screen/audio`, PixelFlow's local controller service, not the device. No direct device route is established (catalog: `post-ucenter-screen-audio`, serverKind controller). Live screens report `audio { isMute, volume, source[] }`. Not added: unresolved device contract.
- **Input audio source** (none / embedded / analog in): `handleVideoSettingItemClick.ts` → `POST interface/audio-source [{ sourceId, interfaceId }]`. Feature XML `AudioInputSourceEdit` lists only connector types 2, 24, 26, 33, 51, 55; the P20's HDMI (6), DP (8) and SDI (13) inputs are not listed, so PixelFlow does not offer it on this hardware. Not added.
- Input/analog audio info readouts (`AudioInfo.tsx`): channel count and sampling rate, read-only.

### What PixelFlow itself hides on a P20 (not gaps on this hardware)
Traced so that these stop being counted as missing for the owner's device; each was checked against the live XML or the source line:
- MVR window border and UMD editor: `pages/mvr/components/MVRAttr.tsx:453` renders them only when `!isDevicesN`; `config/const.ts:4986 N_DEVICE_LIST = ['N20','N10','P20','P10']`.
- MVR background: gated by the MVR screen XML; live `screen_8.xml` has `<BackgroundColor Support="0">`. Custom MVR templates: `CustomMVRTemplate Support="0"` (feature.xml:115).
- Output test-pattern section: `VideoInterfaceTestPattern Support="0"`. Fan mode: `FanMode Support="0"` (feature.xml:38). HDR conversion: `DynamicRangConversion Support="0"` (:437). No-signal layer colour: `NoSignalBackgroundColor Support="0"` (:191). Standby and display-effect sync: no `StandbyMode` / `Preferences` element.
- MVR output aspect policy: `supportAspectRatio` is `useState(false)` with no setter in `device-info/mvr-attr/index.tsx:88`; never rendered on any model.

### Shown by PixelFlow on a P20 and missing in Studio before this WO
- Audio matrix, mute, test tone (above).
- Layer effects. Contracts from `api/layer/layer.ts` and `LayerAttribute/presenter/layerAttrEventHandle/*`; every body is `[{ layerId, <section> }]` with the **whole** section (PixelFlow spreads the current value and overrides one field). Field shapes confirmed against the live `layers/list-detail` capture; ranges from live `layer_2.xml`:
  - `PUT layers/opacity` `{ opacity 0–100 }` (layer_2.xml:237).
  - `PUT layers/general` whole `general`; `flipType` 0 none, 1 H, 2 V, 3 both (XOR combine, `commonUtils.ts:636`); `isMonochrome`, `isInverse`.
  - `PUT layers/lock` `{ isLock }`.
  - `PUT layers/border` `{ enable, type, size { hWidth, vWidth 0–512 }, color { R, G, B, coefficient, opacity 0–100 } }`; styles offered by the XML: 1, 3, 4, 5, 6.
  - `PUT layers/mask` px **and** ratio per edge, ratio = round(px / window size × 100000) (`dataUtils.ts:1603`); the device key is spelled `buttom`.
  - `PUT layers/shadow` `{ general { enable, feather 0–100 }, window { width, height 5–200, x, y −100…100 }, color }`.
  - `PUT layers/image-quality` whole object; supported fields on the P20: brightness/contrast coefficient 0–200, hue −180…180, saturation 0–200.
  - `PUT layers/crop` `{ enable, xRatio, yRatio, widthRatio, heightRatio }` 0–100000 of the source.
  - PixelFlow rules: border/shadow not on AUX/LOGO/BKG layers, mask not on LOGO/BKG, crop only on a layer showing an input, nothing while the layer is locked. PixelFlow pre-runs `system/auxiliary/assess/layers-*` for border, shadow and crop; that body was not traced.
  - Layer freeze: `general.isFreeze` exists, but the PixelFlow caller sits inside the vendor UI package, so the endpoint is not established. Not added.
- Device time: `GET node/clock?nodeId=1`, `PUT node/clock { nodeId, time { timestamp (UTC s), timezone } }` (`api/device/deviceInfo.ts:417,478`, `DeviceTimeSetting.tsx:162`). Zones: feature.xml:1395 `Timezone` with 90 `Enum Value/Offset(min)/Name`. Live `node.time = { timestamp: 1794248988, timezone: 70 }`.
- Electrostatic protection: `POST node/anti-static { nodeId, antiStatic { enable, time ms } }` (`deviceInfo.ts:966`); feature.xml:49 `AntiStatic` Time 100–2000. Live `{ enable: 0, time: 100 }`.
- Traced but **not built** in this WO (still shown by PixelFlow on a P20): source backup (`GET/PUT system/ctrl/source-backup`, whole-object read-modify-write), self-test (`POST node/selfcheck`, `GET node/selfcheck?checkType=`), global HDCP (`PUT interface/hdcp` batch + `PUT screen/hdcp` for MVR screens), output colour space/range/gamut (`PUT interface/color-space|color-range|color-gamut`, with PixelFlow's bandwidth pre-check and interdependency rules) and output colour correction (`PUT interface/image-quality`). These contracts came from a source-tracing pass and have not been re-verified line by line; verify before building.
- Screen-level FTB/freeze/take: PixelFlow's editor uses `ucenter/screen/*`; Studio already uses the device-direct routes proven live in WO-016/019/022.

## What was done

### Unit 1 — Audio tab (AUDIO-01, AUDIO-02)
- `lib/studio-audio.js`: `audioSupported` (same gate as PixelFlow: feature XML or P20 DS card), `readAudio` (matrix headers joined with interface channel info; invalid headers hidden), `applyAudio` (routes, clear, mute/test tone). Writes are `POST`, bodies exactly as PixelFlow sends them; only changed crosspoints/channels are sent; unknown keys, duplicate outputs, hidden inputs and bad flags are rejected before the first write; the result is read back and a device that acknowledges without retaining is reported.
- `lib/studio-routes.js`: `/api/audio` (session and origin guards come from the shared resource handler). `lib/pixelhue.js`: `capabilities.audio`, computed once per connection.
- `public/audio-ui.js`, `public/studio.css`, `public/index.html`, `public/app.js`, `public/studio-panels.js`, `server.js`: an **Audio** tab that only appears when the device advertises the matrix. Crosspoint grid (inputs down, outputs across), M/T toggles per channel and per port, signal dot for video inputs, Clear all with confirmation. Clicks apply immediately, no Apply button. **Pair** (on by default, remembered) routes all channels of an input port to the same-numbered channels of the output port in one click; Alt-click routes one channel. That is the one thing PixelFlow cannot do in one click.
- Why a grid and not a per-output dropdown list: the grid is what the owner knows from PixelFlow and shows the whole routing at once; 28 × 20 channels on the P20 fits one screen.
- `test-support/mock-audio.js` + `mock-studio.js`: mock matrix shaped like the live capture. It enforces what is known: POST only, unknown or `isValid` 0 headers refused with an error code, enabling a crosspoint replaces the output's previous input.
- Two older pins updated, not weakened: P80 connect now makes one extra `node/config-file` read for the capability (`test/multi-model.test.js` asserts exactly that and still no list endpoints); Q8 capabilities include `audio: false` (`test/q8.test.js`).

### Unit 2 — Layer effects in the Programming inspector (PROGRAMMING-05…09, 11)
- `lib/layer-effects.js`: `effectSupport` (per-section gate from `layer_2.xml`), `effectValues` (normalised `fx` on every program layer), `planEffects` (builds and validates every write before the first is sent, merging into the full device section), `applyEffect` (writes, readback verification, resource refusals reported in plain words). `lib/program-geometry.js` adds `fx`; `lib/studio-programming.js` adds `effects` to the state and the `effect` action.
- `public/layer-effects-ui.js` (+ `layer-inspector.js`, `studio.css`, `server.js`): collapsed sections under the Layer tab — Look (lock, opacity, flip H/V, mono, invert), Border, Mask, Shadow, Colour, Source crop. Each control applies on change; an "on" badge shows active sections without opening them; reset per section. Sections the XML does not support, or that PixelFlow blocks for the layer type, are not rendered. A PGM-locked screen disables them like the other inspector controls.
- `test-support/mock-effects.js`: live-shaped sections and `layer_2.xml`; the mock refuses unknown layers, partial sections, XML range violations and writes to a locked layer.
- Not copied from PixelFlow: the resource pre-assessment. Studio sends the write and reports a refusal.

### Unit 3 — Device clock and electrostatic protection (DEVICE-16, DEVICE-14)
- `lib/device-extras.js` + `lib/studio-device.js`: options from the feature XML, read via `node/clock`, writes validated with the other device changes before anything is sent, readback verification.
- `public/device-extras-ui.js` + `device-ui.js`: "Device clock" (zone, date/time, Set clock, and "Use this computer's time", one click instead of PixelFlow's edit/apply) and "Electrostatic protection" (on/off, hold time).
- Mock: `node/clock` must be PUT with a listed zone; `node/anti-static` must be POST with 100–2000 ms.

### Unit 4 — Audit records
- `docs/pixelflow-parity/features/*.json` and regenerated reports: AUDIO-01/02, PROGRAMMING-06…09, DEVICE-14/16 implemented; PROGRAMMING-05/11 partial with the exact remainder; new AUDIO-04 (screen audio) and AUDIO-05 (input audio source) records; P20 gates written into the availability of MVR-03/04/05/06, OUTPUTS-06, DEVICE-05/11/12/13/18. Totals: 123 groups — 17 implemented, 36 partial, 68 missing, 1 excluded, 1 not rendered. README gained "What PixelFlow itself hides on a P20" and the list of what is still open for a P20. `test/pixelflow-audit.test.js` pin 121 → 123.

## What was VERIFIED

### Unit 1 — Audio tab
- `npm test`: **191 passing**, 0 failed (6 new in `test/audio.test.js`: header parsing and XML gate, routing/replacement/clear bodies, no-write rejections, mock refusing invalid headers and PUT, acknowledged-but-ignored writes, mute/tone bodies, pair routing, HTTP session/origin guards). `npm run check:size` (115 files ≤ 500 lines) and `npm run build:client` pass.
- Headless Chrome against the mock P20: Audio tab hidden before connect and shown after; pair click routed two crosspoints; Alt-click moved a single one (device-side replacement); mute toggled; Clear all emptied the matrix; no page errors. Screenshot checked.
- **Not verified on hardware.** The P20 at 192.168.0.7 was unreachable from this Mac during the session, so no audio write and no `audio/matrix-detail` read has been made against the real device. The payloads follow PixelFlow's source exactly, but device-side validation (for example whether it refuses routes while device audio is disabled, feature XML `AudioEnable` default 0) is unproven. Owner QA: route one input to Audio Out, mute/unmute, test tone, Clear all, and compare with PixelFlow's matrix.

### Units 2–4
- `npm test`: **200 passing**, 0 failed (5 in `test/layer-effects.test.js`, 4 in `test/device-extras.test.js`, audit integrity with the new records). `npm run check:size`: 122 files ≤ 500 lines. `npm run build:client` passes.
- Parsers run against the **real** captured P20 data, read-only files: `extraOptions` returns 90 zones and `{ min: 100, max: 2000 }` from `/private/tmp/pixelhue-umd-live/config.xml`; `audioSupported` is true; `effectSupport` reports all nine sections; `effectValues`/`planEffects` accept a real normal layer from `/private/tmp/pixelhue-full-client/live-readonly.json` and produce the five expected write paths.
- Headless Chrome against the mock: layer effects (flip, border on + width, mask ratio, crop, device lock hides the other sections), device blocks (clock shows 2026-11-10 02:29:48 for the captured instant in zone 70, zone change keeps the instant, Set clock, protection save, computer time). No page errors; screenshots checked.
- The Studio process on `127.0.0.1:3211` (this checkout) was restarted and serves `audio-ui.js` and `layer-effects-ui.js` byte-identical to the source.
- **Nothing in this WO has touched hardware.** Every write path here is proven only against PixelFlow's source and a mock that enforces the rules listed above. Owner QA list: `work/checklist-wo036.md`.
- Not pushed; four local commits on `main` (`a2dbbef`, `12cd2dd`, `2954f02`, plus the docs commit).
