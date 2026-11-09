# WO-015 — Device tab detail (layer profiles, network, restart/reset, card labels) and compact chrome

**Status: DONE (2026-11-09; 103 offline tests, mock Chrome regression and live read-only P20 Chrome verified; physical network/power/reset writes are owner QA)**

Owner todo (2026-11-09): "layer profile just lists profile 1 and 2, there must be some more info about that. network should enable config. reset restart options. cards installed should have some labels identifiers." Plus: "there is too little space in the main working window. make the connection and tabs more compact. definitely don't need a title as big as it is."

Follow-up to WO-014 (full-client foundation). No earlier WO covers network, power, factory reset or card naming (`rg -il "ethernet|restore-factory|subcard|layer profile" work/work-orders/` → only WO-009 input-card joins).

## Investigation FIRST

### Layer profile
- `public/device-ui.js` renders `Profile ${v + 1}` from bare `LayerModes` enum values; the device returns only 0/1.
- PixelFlow `src/pages/devices/const.ts` `LayerModeVideoName`: **0 = `2xMAIN+10xPIP`, 1 = `4xMAIN+4xPIP`** (`LayerModeE.twoMainAndTenPip / fourMainAndFourPip` in `pages/devices/enum.ts`). Live P20 feature.xml comments agree (`<!--2*MAIN+10*PIP模式-->`).
- Live feature.xml `Features/DynamicRangConversion/LayerModes/LayerMode` carries `HDRSupport` per mode and `Type` (0 = P20-DS, i.e. 15728933 card installed; 1 = plain P20). PixelFlow `haveDSSubcard` = any subcard modelId 15728933. Live P20 (Type 1): HDR unsupported in both modes; P20-DS: HDR only in 2×MAIN+10×PIP.
- Vendor confirm text `layer-mode-tips`: switching recreates layers. Progress endpoint `node/layer-mode-progress` exists (`LayerModeProgressStatusE` 0 success / 1 switching / 2 failed).
- Live P20 is currently layerMode **1** (4×MAIN+4×PIP).

### Network
- `GET node/ethernet?nodeId=1` live: `{"nodeId":1,"state":0,"ethernet":{"mode":0,"infos":[{"index":0,"mac":"54:B5:6C:24:A0:B1","dhcp":1,"ip":"192.168.0.7","netmask":"255.255.255.0","gateway":"192.168.0.1","interfaceType":25,"autoDNS":0,"dns":[]}]}}`.
- `readDevice` only looked for `node.ethernet/networks/netInfo` on node/detail; none exist there (live top-level keys checked), so network was always null.
- PixelFlow `device-info/NetworkSettings.tsx` writes `PUT node/ethernet` `{ nodeId, ethernet: { mode, infos: [{ index, dhcp, ip, netmask, gateway, autoDNS, dns }] } }` (`SetNodeEthernetT`/`InfoParamsT`, `api/device/deviceList.ts:470`). DHCP (`DHCPTypeE`: 0 static, 1 dynamic) sends empty ip/netmask/gateway. Restore-default values `DeviceNetworkConfig`: static 192.168.0.10/255.255.255.0/192.168.0.1.
- Changing the address moves the device away from the connected session, so readback at the old address cannot verify the write.

### Restart / shut down / factory reset
- `PUT node/power` `{ nodeId, option }` with `DeviceOptionE` restart=0, hardShutdown=1 (`editor1/common/enum.ts:941`); PixelFlow `device-info/Reboot.tsx` offers Reboot and (for non-H/K series) Shutdown. Live feature.xml `PowerCtrl/Type` enums 0 restart, 1 shutdown, 2 sleep, 3 wake.
- `PUT system/restore-factory` `{ restoreFactory: [{ type, para: 0 }] }` — manual §2.2 (pp. 25–27, P10/P20/Q8/P80): type 0 = restart device, 1 retain IP, 2 retain EDID, 3 retain gallery, 4 retain language, 5 retain project files, 6 presets, 7 layer presets, 8 user files, 9 device mode. PixelFlow `pages/maintain/const.ts` `RESTORE_REQ_PARAMS`: keep user data = [0,1,2,3,4,5,8]; keep IP = [0,1]; clear all = [0].

### Installed cards
- Live node/detail subcards: `{slotId, modelId, boardId, online, rotate, ptpInfo}` only — no names (0:15728896, 1:15728896, 2:15728897, 3:15728898, 100:28944). The table showed raw modelIds.
- The already-downloaded `node/config-file` contains `deviceconfig/subcard/<kind>/<modelId>.xml` with `<Name><en>`: 15728896 `2xHDMI2.0IN_2xDP1.2IN`, 15728897 `4xHDMI2.0OUT_4xHDMI2.0复制` (复制 = copy), 15728898 `4x12GSDI_LOOP_4xFiber`, 15728933 `P_12G SDI_DANTE Audio-OPT Combo Card`, 28944 `main card`; the folder is the kind (inputcard/outputcard/mixcard).
- `deviceconfig/device/slot.xml` gives per-slot, per-model `ConnectorGroup GroupName` = rear-panel silkscreen: slot 100 In 1–4, MVR, AUX; slot 0 In 5–6; slot 1 In 7–8; slot 2 OUTPUT 1–4; slot 3 In 9–12, OPT, Audio In/Out.

### Chrome height
- `public/style.css`: masthead padding 14px + 27px brand + two-row connection controls (form + status line) ≈ 95px; notice 36px + 20px margin; tabs a separate row. ~190px of chrome before the work area on a 1080-tall kiosk.

### Pre-existing bug found on the way
- `lib/configuration.js` `xmlFile` cut each file at the first `</File>`. Live feature.xml has a `<File Support=...>` feature element, so only 52,390 of 92,859 chars were parsed. Everything after it was invisible: `PowerCtrl`, `RestoreFactory`, `DeviceBeacon` and later features. Beacon support had only worked through the `node.deviceBeacon` fallback.

## What was done

- `lib/configuration.js`: `xmlFile` now slices from a file's `<File><path>` to the last `</File>` before the next top-level `<File><path>`. That keeps nested `<File>` feature elements and still isolates files. The full feature.xml now parses (`PowerCtrl`, `RestoreFactory` and `DeviceBeacon` present).
- `lib/studio-maintenance.js` (new):
  - `layerModeOptions` names profiles, adds MAIN/PIP counts and picks the HDR flag by device type (DS card check).
  - `powerOptions` reads `PowerCtrl` and offers restart/shutdown only.
  - `cardCatalog`/`labelCards` build card names and silkscreen port groups from the already-cached config file; the catalog is cached on the client and cleared when mode/profile changes.
  - `readNetwork` and `validateNetwork` handle IPv4 format, contiguous masks, network/broadcast addresses and gateway in subnet.
  - `runDeviceAction` handles network, restart, shutdown and factory-reset. Network needs `confirm: true` and factory reset needs `confirm: 'RESET'`. It reuses the vendor payloads and PixelFlow's reset presets rather than inventing combinations. When the address moves, a dropped connection is tolerated and the result is `{ reconnect, host }`. Same-IP network edits are verified by readback.
- `lib/studio-device.js` adds `network`, labelled `subcards`, rich `layerModes` and `power` to the device state; layer-profile writes validate against `.value`. `lib/studio-routes.js` adds `/api/device-action`, which keeps the existing session/origin guards and write serialisation.
- `public/device-maintenance-ui.js` (new) renders the Layer profile (name, counts, HDR, "(current)"), Network, Installed cards and Restart and reset sections. Every destructive action shows a confirmation naming model and serial; factory reset needs RESET typed. After a reconnect result the host field is pre-filled. `public/device-ui.js` uses these sections; the Operating mode block is unchanged.
- Compact chrome: `public/index.html` puts brand, tabs and connection in one 42px header. The address label is visually hidden, "Find devices" became "Find" and connection options a "⋯" menu. `public/connection.css` shrinks the brand to 15px, uses 28px controls, a single-line status with ellipsis and a slim notice; tabs wrap to a second row below 1100px. Panel/workspace margins dropped from 18px to 12px, and table max-heights in `inputs.css`/`studio.css` were raised by the reclaimed ~115px.
- Tests: `test/device-maintenance.test.js` (5 tests; added to the CI FILES list). `test-support/mock-studio.js` mocks `node/ethernet`, `node/power`, `system/restore-factory` and `PowerCtrl`.

## What was VERIFIED

- `npm test`: **103/103 pass** (98 existing + 5 new): nested-`<File>` regression, card names/ports, layer profile counts/HDR by type, network validation, and device-action confirmation gates. The gate test checks that nothing is written before confirmation and checks exact vendor payloads: network body, power options 0/1, restore types [0,1,2,3,4,5,8] / [0,1] / [0].
- `npm run check:size` (67 files ≤ 500 lines) and `npm run build:client` pass.
- WO-014 Chrome regression `/private/tmp/pixelhue-browser-qa/full-client-check.mjs` passes on the mock: all tabs, MVR autosave flows, and 390px mobile with no overflow.
- Live P20 192.168.0.7 **read-only** (`/private/tmp/pixelhue-browser-qa/wo015-live.mjs`, every PUT `/api/**` aborted by the browser; zero blocked/attempted writes, zero dialogs, zero page errors):
  - Layer profile shows "4 × MAIN + 4 × PIP (current)" with "4 MAIN layers · 4 PIP layers · HDR not supported".
  - Network shows DHCP, 192.168.0.7/255.255.255.0/192.168.0.1, Ethernet and the MAC.
  - Cards: Slot 0/1 `2xHDMI2.0IN + 2xDP1.2IN` In 5–6 / In 7–8; Slot 2 `4xHDMI2.0OUT + 4xHDMI2.0 copy` OUTPUT 1–4; Slot 3 `4x12GSDI + LOOP + 4xFiber` In 9–12, OPT, Audio In, Audio Out; Main board In 1–4, MVR, AUX.
  - Restart device, Shut down and Factory reset are offered.
  - Content now starts **74px** from the top at 1920×1080 (header + notice); it was ≈190px. Screenshots: `wo015-device.png`, `wo015-mvr.png`, `wo015-mvr-1000.png`, `wo015-mobile.png` in `/private/tmp/pixelhue-browser-qa/`.
- **Not proven on hardware** (deliberately, since the device is in production): network writes, restart, shutdown, factory reset and the layer-profile switch. Payloads match the vendor client and manual §2.2. Owner QA items were added to `work/checklist-mvr.md`.
