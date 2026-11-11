# WO-036 — PixelFlow parity review; Audio matrix tab

**Status: IN PROGRESS**

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

## What was done

### Unit 1 — Audio tab (AUDIO-01, AUDIO-02)
- `lib/studio-audio.js`: `audioSupported` (same gate as PixelFlow: feature XML or P20 DS card), `readAudio` (matrix headers joined with interface channel info; invalid headers hidden), `applyAudio` (routes, clear, mute/test tone). Writes are `POST`, bodies exactly as PixelFlow sends them; only changed crosspoints/channels are sent; unknown keys, duplicate outputs, hidden inputs and bad flags are rejected before the first write; the result is read back and a device that acknowledges without retaining is reported.
- `lib/studio-routes.js`: `/api/audio` (session and origin guards come from the shared resource handler). `lib/pixelhue.js`: `capabilities.audio`, computed once per connection.
- `public/audio-ui.js`, `public/studio.css`, `public/index.html`, `public/app.js`, `public/studio-panels.js`, `server.js`: an **Audio** tab that only appears when the device advertises the matrix. Crosspoint grid (inputs down, outputs across), M/T toggles per channel and per port, signal dot for video inputs, Clear all with confirmation. Clicks apply immediately, no Apply button. **Pair** (on by default, remembered) routes all channels of an input port to the same-numbered channels of the output port in one click; Alt-click routes one channel. That is the one thing PixelFlow cannot do in one click.
- Why a grid and not a per-output dropdown list: the grid is what the owner knows from PixelFlow and shows the whole routing at once; 28 × 20 channels on the P20 fits one screen.
- `test-support/mock-audio.js` + `mock-studio.js`: mock matrix shaped like the live capture. It enforces what is known: POST only, unknown or `isValid` 0 headers refused with an error code, enabling a crosspoint replaces the output's previous input.
- Two older pins updated, not weakened: P80 connect now makes one extra `node/config-file` read for the capability (`test/multi-model.test.js` asserts exactly that and still no list endpoints); Q8 capabilities include `audio: false` (`test/q8.test.js`).

## What was VERIFIED

### Unit 1 — Audio tab
- `npm test`: **191 passing**, 0 failed (6 new in `test/audio.test.js`: header parsing and XML gate, routing/replacement/clear bodies, no-write rejections, mock refusing invalid headers and PUT, acknowledged-but-ignored writes, mute/tone bodies, pair routing, HTTP session/origin guards). `npm run check:size` (115 files ≤ 500 lines) and `npm run build:client` pass.
- Headless Chrome against the mock P20: Audio tab hidden before connect and shown after; pair click routed two crosspoints; Alt-click moved a single one (device-side replacement); mute toggled; Clear all emptied the matrix; no page errors. Screenshot checked.
- **Not verified on hardware.** The P20 at 192.168.0.7 was unreachable from this Mac during the session, so no audio write and no `audio/matrix-detail` read has been made against the real device. The payloads follow PixelFlow's source exactly, but device-side validation (for example whether it refuses routes while device audio is disabled, feature XML `AudioEnable` default 0) is unproven. Owner QA: route one input to Audio Out, mute/unmute, test tone, Clear all, and compare with PixelFlow's matrix.
