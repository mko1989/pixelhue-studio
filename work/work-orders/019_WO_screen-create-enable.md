# WO-019 — Screens created by Studio were disabled placeholders; output mapping rejected (8212). Live test drive on Screen 3

**Status: DONE (2026-11-09; live P20 end-to-end on Screen 3 + OUTPUT 2-3, 109 offline tests, mock Chrome)**

Owner (2026-11-09): "screen 2 was not created in pixelflow… ive made the screen 2. you can test drive screen 3 from start to finish with output 2-3." Successor to WO-018 (that WO's open question, how screens get enabled, is answered here).

## Investigation FIRST

Authorised writes: Screen 3 and OUTPUT 2-3 (interface 7) only. Evidence came from tcpdump on en0 (device HTTP :8088 is plaintext) in `/private/tmp/claude-501/.../scratchpad/cap{A,B,F}.txt`.

1. **Studio's mapping path failed outright.** `applyScreens` update on old placeholder Screen 3 (id 8, `enable 0`) → `Device rejected screen/crop-mosaic: manage mio error: creatCropMosaicsNewScreen get ref interfaceId[0] connector info err (code 8212)`. It failed identically with a full PixelFlow-shaped output entry (area/feather/rotate/interfaceOnline), so the output entry was not the cause.
2. **The ucenter is PixelFlow desktop, not the device.** `lsof` shows `ucenter_d` (PID 3207) listening on *:19998 on this Mac. 192.168.0.7:19998 now refuses connections, and ucenter paths 404 on :8088. *(WO-014's "the device itself supplies the discovery service" was based on a moment when 192.168.0.7:19998 answered; treat device-side :19998 as unreliable.)*
3. **How PixelFlow creates a screen.** PixelFlow calls `POST /ucenter/screen/normal-create {snList, name, type}` (`src/api/screen/screen.ts`, `handleCreateScreen.ts`). With capture running, I deleted placeholder id 8 and called normal-create on 127.0.0.1:19998. ucenter_d sent exactly one device write:
   `PUT /unico/v1/screen/create-empty-screen {"type":2,"namePrefix":"","name":"Screen 3","layout":{"x":0,"y":0},"guid":"<uuid>","CanvasList":null,"snList":["26107A000000125"],"workMode":0,"createType":0,"operationType":0,"keyPosition":null}`
   The result was `enable: 1`. Studio had sent `{type, namePrefix, layout, keyPosition:[n]}`, which yields `enable: 0`.
4. **Reproduced directly with the normal device token:** DELETE id 5, then create-empty-screen with the body above → `enable: 1` (same id reused). **DELETE does not remove a Main screen**: the device keeps it as an `enable 0` placeholder, and PixelFlow hides those (`filterEnableScreenList`). That is where the stray disabled Screen 2/3/4 records came from.
5. **The 8212 cause.** PixelFlow's mosaic body (`screen1/presenter/handle/lcd/requestScreenMosaic.ts` `montageProtocolParams`) carries a top-level **`mosaic.interfaceId` = first output's id** (the "ref interfaceId[0]"), plus per output `interfaceId, pos, crop, feather, rotate, area`. Adding `interfaceId: 7` → accepted; Screen 3 now shows OUTPUT 2-3 at 3072×1024. The owner's earlier Screen 2 mapping only worked because a cloned placeholder mosaic happened to be accepted.
6. **Presets:** the device preset list was already **empty** (`count 0`) at the first read of the test drive, before any preset write. The four owner presets (reso, ppt, laptop2, backup) were last seen at the WO-016 live check. Between then and now, the writes were the owner's PixelFlow Screen 2 rebuild and my DELETEs of placeholder Screen 3 (id 8, then id 5). Captures A/B contain no preset traffic, so the cause is **not established**; it could be a device purge on screen delete or the PixelFlow rebuild. The ucenter has no readable preset store (code 500). Owner asked.

## What was done
- `lib/studio-screens.js`:
  - Create sends the ucenter body: name instead of prefix, `guid: randomUUID()`, `snList: [serial]`, `createType/operationType/workMode 0`, `CanvasList/keyPosition null`. Duplicate names are rejected. The new screen is verified by name plus an unseen id.
  - Mosaic is built in PixelFlow's shape: `type 2, interfaceId: first output, window, splice, isShowRect, outputs[{interfaceId, pos, crop, area, feather, rotate}]`, keeping existing feather/rotate.
  - `normaliseScreens` hides Main screens with `enable 0`, as PixelFlow does.
- `public/screens-ui.js`: the field is now "Name", defaulting to the next free "Screen N".
- `test-support/mock-studio.js` models all three device rules: the short create body gives enable 0; crop-mosaic without a matching `interfaceId` gives 8212; DELETE of a Main screen leaves an enable-0 placeholder.
- Tests: one new WO-019 test (exact create body, enabled result, duplicate name, mosaic reference interface and area, mock rejecting a bad reference with 8212, delete leaving a hidden placeholder). The WO-018 test was rewritten for hidden placeholders.

## What was VERIFIED
- **Live P20, Studio server code only** (`driveF.mjs`; screen 5 = Screen 3, interface 7). PASS for each step:
  - re-map OUTPUT 2-3 (x=3000, 3072×1024);
  - create a PVW layer (Input 8-HDMI 2.0) at 576,0 1920×1024;
  - move partly off-screen (−800,200) and fully off-screen (4000,0), both read back exactly, then move back;
  - Take on Screen 3 only (500 ms; the layer moved to PGM) and Cut on Screen 3 only;
  - preset save from Screen 3 PVW ("Studio test", serial 1, screens=[Screen 3]), load to PVW, rename to "Studio test 2", delete. The list was empty again afterwards, as it was before.
- `npm test` 109/109; `check:size` and `build:client` pass. Mock Chrome full-client check passes.
- Final device state: Screen 3 (id 5) enabled, OUTPUT 2-3 at origin 3000,0, 3072×1024, with its Input 8 layer in PGM. Screen 4 (id 9) stays a hidden disabled placeholder. Nothing else was written.

## Open
- Preset loss: when and how (see 6). If the device purges presets on screen deletion, Studio's Delete screen must warn about it.
- Owner remark "the two auxes are ran in copy mode so it also read that wrong": live data shows AUX -1/-2 as primaries (wm 0) feeding AUX Screen 1/2, and AUX -3/-4 as copies (wm 1, copyInfo 34/35). The misread is not yet identified; asked the owner.
