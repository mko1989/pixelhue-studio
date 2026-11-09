# WO-018 — Preset save rejected: "screen 2 is not enabled" (code 8210)

**Status: DONE (2026-11-09; save/Take skip disabled screens). The enable mechanism was found in WO-019 (successor): create-empty-screen needs the ucenter body; delete leaves an enable-0 placeholder.**

Owner (2026-11-09) on the WO-016 preset bank: `Device rejected /unico/v1/preset/create: manage param invalid: check screen faild: screen 2 is not enabled (code 8210).` "how did tests not pick that up? i did configure the screen and applied so it should be configured."

## Investigation FIRST

- Live P20 `screen/list-detail` (read-only): Screen 2 (id 2) has outputs 9 and 11 at 3840×1080 at origin 1749,1316, so the owner's Apply took effect, but it reports **`enable: 0`**. Screen 3 (id 8) and Screen 4 (id 9) are also `enable: 0`. Screen 1 and both AUX screens are `enable: 1`. `screen/state` reports state 0 for all.
- WO-016 Programming showed every screen and defaulted to "screens that have outputs", so Screen 2 was shown. `lib/studio-presets.js` put every shown screen into `preset/create` and the device refused the disabled one.
- PixelFlow never offers such screens. `src/services/screen.tsx` `filterEnableScreenList` keeps Main screens only when `enable === EnableE.on`; `formatPanelScreenData` filters `item.enable`. Its comment: "P20 在修改接口容量时会上报屏幕创建4个enable为0，液晶用，软件做过滤，不处理" (when interface capacity changes, the P20 reports four created screens with enable 0; the software filters them out).
- **Why the tests missed it:** `test-support/mock-studio.js` accepted any `preset/create` body. The tests checked that the payload matched manual §6.2.2, not the device's validation rules, and the manual doesn't document the enabled-screen rule. WO-016 recorded preset create as "not proven on hardware"; the first physical save found the rule. The mock also already created new empty screens with `enable: 0`, yet nothing consumed `enabled`.
- Field-by-field diff of live Screen 1 (enabled) vs Screen 2 (disabled): only geometry, timing, `select` (1 vs 0) and image-quality values differ. There is no enable field in `setScreenMosaicT` (`src/api/screen/screen.ts:644`), and PixelFlow's LCD flow (`screen1/presenter/handle/lcd/changeCreateTopScreen.ts`) uses the same create-empty-screen + crop-mosaic as Studio. **What makes the device set `enable: 1` is not established.** It needs a write experiment or a PixelFlow before/after diff on the box.

## What was done

- `lib/studio-presets.js`: preset save uses only enabled screens. Disabled screens are skipped and returned as `skipped`; if all are disabled it fails with 409 naming them, before any write.
- `lib/studio-programming.js`: Take/Cut skip disabled screens and fail if none are enabled, as PixelFlow only switches enabled screens.
- `public/programming-ui.js`: default shown screens = enabled screens with outputs. Disabled screens get a dashed chip with "off" and a tooltip, and the save notice names any skipped screen. `public/screens-ui.js`: "Disabled on device" badge, and "· off" in the screen list.
- `test-support/mock-studio.js` now **enforces the device rule**: `preset/create` naming an enable-0 screen returns code 8210 with the device's message. A disabled placeholder Main screen ("Spare screen") was added.

## What was VERIFIED

- `npm test` 108/108 (+1). The new test checks that a mixed save sends only the enabled screen and returns `skipped`; that disabled-only save and Take send nothing; that Cut drops the disabled screen; and that a raw `preset/create` naming the disabled screen is rejected with code 8210 by the mock itself. `check:size` and `build:client` pass.
- Live: read-only diagnosis above. No writes.

## OPEN
- How to get Screen 2 enabled. Options: (a) the owner enables or configures it in PixelFlow and we diff `screen/list-detail` before and after to learn the call; (b) with permission, a write experiment on the unused Screen 3 (id 8). Until then, Studio-created/mapped screens may stay disabled.
