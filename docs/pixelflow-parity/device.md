# PixelFlow device inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/device.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## DEVICE-01 · Identity and installed hardware

**Studio: partial. Placement: Primary.**

Device name; model; serial; firmware; MAC; card type/name; processing and connector card SN/version; slot and status.

Availability: Model, installed card, role and feature XML determine availability.

Studio identifies cards, but does not expose all separate processing/connector version fields.

PixelFlow: `src/pages/devices/components/device-info/BaseInfo.tsx:16` in `index-CPe5AUX3.js.map`.

Studio: `public/device-ui.js`, `lib/studio-device.js`.

## DEVICE-02 · Card inventory details

**Studio: partial. Placement: Advanced.**

Card name; processing card SN/version; connector card SN/version.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/common/subcard-info/index.tsx:15` in `index-D9IUeHyp.js.map`.

Studio: `public/device-ui.js`, `lib/studio-device.js`.

## DEVICE-03 · Working mode and layer resources

**Studio: partial. Placement: Primary.**

Switcher/PGM only/controller/fiber/bypass modes by family; layer specification; destructive-change warning.

Availability: Model, installed card, role and feature XML determine availability.

Studio reads XML choices; richer resource descriptions remain incomplete.

PixelFlow: `src/pages/devices/components/device-info/DeviceWorkMode.tsx:20` in `index-CPe5AUX3.js.map`.

Studio: `public/device-ui.js`, `lib/studio-device.js`.

## DEVICE-04 · Layer mode

**Studio: implemented. Placement: Advanced.**

Layer allocation/profile; clear existing layers confirmation.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-info/LayerMode.tsx:11` in `index-CPe5AUX3.js.map`.

Studio: `public/device-ui.js`, `lib/studio-device.js`.

## DEVICE-05 · Fan and locate

**Studio: partial. Placement: Advanced.**

Silent/power fan mode; device location/mapping.

Availability: Feature XML FanMode; the live P20 reports Support=0, so PixelFlow hides fan mode there and Studio follows the XML.

Fan and beacon exist; physical mapping workflow differs.

PixelFlow: `src/pages/devices/components/device-info/DeviceFanMode.tsx:22` in `index-CPe5AUX3.js.map`.

Studio: `public/device-ui.js`, `lib/studio-device.js`.

## DEVICE-06 · Control network

**Studio: partial. Placement: Advanced.**

Network mode; IP; mask; gateway; reset; conflict feedback.

Availability: Model, installed card, role and feature XML determine availability.

Studio configures one exposed control interface; multi-port/mode parity needs hardware coverage.

PixelFlow: `src/pages/devices/components/device-info/NetworkSettings.tsx:30` in `index-CPe5AUX3.js.map`.

Studio: `public/device-maintenance-ui.js`, `lib/studio-maintenance.js`.

## DEVICE-07 · Genlock and synchronization

**Studio: partial. Placement: Advanced.**

Sync source; frame rate; multiplier; sync status/recover; internal frame; genlock out; per-card sources.

Availability: Model, installed card, role and feature XML determine availability.

Studio has source/type setup; full multiplier, internal timing, phase/recovery and per-card workflows are gaps.

PixelFlow: `src/pages/devices/components/device-info/genlockSetting/index.tsx:71` in `index-CPe5AUX3.js.map`.

Studio: `public/device-ui.js`, `lib/studio-device.js`.

## DEVICE-08 · Device backup

**Studio: missing. Placement: Advanced.**

Enable per screen/all; primary and backup device behavior.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-info/deviceBackup/index.tsx:19` in `index-CPe5AUX3.js.map`.

## DEVICE-09 · Source backup

**Studio: implemented. Placement: Advanced.**

Primary/backup source pairs; auto switch; primary preferred; crop auto backup; delete pair/all; backup status.

Availability: Model, installed card, role and feature XML determine availability.

Enable, primary preferred, add/remove pairs (same capacity), auto/manual and source in use, remove all. Crop-source backup is not offered (AutoCropSourceConfig Support=0 on the P20). Verified offline and in Chrome against the mock; hardware QA pending (WO-037).

PixelFlow: `src/pages/devices/components/device-info/inputSourceBackup/index.tsx:79` in `index-CPe5AUX3.js.map`.

Studio: `public/source-backup-ui.js`, `lib/source-backup.js`.

## DEVICE-10 · Global HDCP

**Studio: partial. Placement: Advanced.**

Input/output HDCP policy.

Availability: Model, installed card, role and feature XML determine availability.

No single device-wide switch: outputs have a bulk HDCP fill, inputs are per input in Advanced. PixelFlow also sends screen/hdcp for MVR screens with the output switch.

PixelFlow: `src/pages/devices/components/device-info/DeviceHDCP.tsx:35` in `index-CPe5AUX3.js.map`.

Studio: `public/outputs-ui.js`, `lib/studio-outputs.js`, `lib/input-advanced.js`.

## DEVICE-11 · HDR conversion

**Studio: missing. Placement: Advanced.**

HDR format conversion switch.

Availability: Feature XML DynamicRangConversion; Support=0 on the live P20, PixelFlow hides the switch.

PixelFlow: `src/pages/devices/components/device-info/DeviceHdrSwitch.tsx:17` in `index-CPe5AUX3.js.map`.

## DEVICE-12 · Display effects monitoring

**Studio: missing. Placement: Advanced.**

Sync MVR/SDI matrix/PGM output effects.

Availability: Feature XML Device/Preferences; absent on the live P20, PixelFlow hides the switch. One switch (POST node/preference), not three.

PixelFlow: `src/pages/devices/components/device-info/DevicePreference.tsx:26` in `index-CPe5AUX3.js.map`.

## DEVICE-13 · Default layer background

**Studio: missing. Placement: Advanced.**

Select colour; apply to all layers.

Availability: Feature XML NoSignalBackgroundColor; Support=0 on the live P20, PixelFlow hides it.

PixelFlow: `src/pages/devices/components/device-info/DeviceLayerBkgColor.tsx:27` in `index-CPe5AUX3.js.map`.

## DEVICE-14 · Electrostatic protection

**Studio: implemented. Placement: Advanced.**

Enable; hold-last-frame duration; reset.

Availability: Model, installed card, role and feature XML determine availability.

Enable and hold time (XML range), POST node/anti-static. Verified offline and in Chrome against the mock; hardware QA pending (WO-036).

PixelFlow: `src/pages/devices/components/device-info/DeviceAntistatic.tsx:25` in `index-CPe5AUX3.js.map`.

Studio: `public/device-extras-ui.js`, `lib/device-extras.js`.

## DEVICE-15 · Internal test source

**Studio: missing. Placement: Advanced.**

Grayscale/gradient; stretch; motion speed; spacing; resolution; frame rate; bit depth.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-source/index.tsx:96` in `index-CPe5AUX3.js.map`.

## DEVICE-16 · Device time

**Studio: implemented. Placement: Advanced.**

Time zone; date; time; edit/apply.

Availability: Model, installed card, role and feature XML determine availability.

Time zone, date and time, plus one-click "use this computer's time"; PUT node/clock. Verified offline and in Chrome against the mock; hardware QA pending (WO-036).

PixelFlow: `src/pages/devices/components/device-info/DeviceTimeSetting.tsx:33` in `index-CPe5AUX3.js.map`.

Studio: `public/device-extras-ui.js`, `lib/device-extras.js`.

## DEVICE-17 · Power and reset

**Studio: implemented. Placement: Advanced.**

Restart; shutdown; factory reset retaining user data/IP or all.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-info/Reset.tsx:26` in `index-CPe5AUX3.js.map`.

Studio: `public/device-maintenance-ui.js`, `lib/studio-maintenance.js`.

## DEVICE-18 · Standby

**Studio: missing. Placement: Advanced.**

Enter/exit standby; blackout warning.

Availability: Feature XML Device/StandbyMode; absent on the live P20, PixelFlow hides it.

PixelFlow: `src/pages/devices/components/device-info/StandbyMode.tsx:15` in `main-Cpb41LiE.js.map`.

## DEVICE-19 · Diagnostics

**Studio: implemented. Placement: Advanced.**

Diagnostic items; values; normal/abnormal status; exception details.

Availability: Model, installed card, role and feature XML determine availability.

Power-on check result, run self-test on an idle device, abnormal items first. Verified offline and in Chrome against the mock; hardware QA pending (WO-037).

PixelFlow: `src/pages/devices/components/device-self-check/device-self-check-table/index.tsx:23` in `index-CPe5AUX3.js.map`.

Studio: `public/self-test-ui.js`, `lib/self-test.js`.

## DEVICE-20 · MVR connector configuration

**Studio: missing. Placement: Advanced.**

Independent/copy; resolution; frame rate; aspect lock; clear window warning.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-info/mvr-attr/index.tsx:55` in `index-CPe5AUX3.js.map`.

## DEVICE-21 · Monitor output

**Studio: missing. Placement: Advanced.**

Full screen/keep ratio; definition.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-info/MonitorSetting.tsx:28` in `index-CPe5AUX3.js.map`.

## DEVICE-22 · Dante device

**Studio: missing. Placement: Advanced.**

Network; module software/firmware/hardware/boot versions; channel attributes.

Availability: Dante-capable installed audio hardware.

PixelFlow: `src/pages/devices/components/device-info/dante-attr/index.tsx:19` in `index-CPe5AUX3.js.map`.

## DEVICE-23 · Serial control cards

**Studio: missing. Placement: Advanced.**

Baud; data bits; stop bits; parity; timeout; named hex/text commands; reset/save.

Availability: Installed COM card; not generic P20 controls.

PixelFlow: `src/pages/devices/components/devicePanel/subcardAttr/ComSubcardWithCmdAttr.tsx:49` in `index-CPe5AUX3.js.map`.

## DEVICE-24 · IP decoding and preview cards

**Studio: missing. Placement: Advanced.**

Card mode; dual network; MVR stream quality; input/screen view URL reporting.

Availability: Installed IPC/MVR card.

Stream configuration is distinct from the intentionally excluded live-video UI.

PixelFlow: `src/pages/devices/components/devicePanel/subcardAttr/MvrSubcardAttr.tsx:25` in `index-CPe5AUX3.js.map`.

## DEVICE-25 · Loading capacity

**Studio: missing. Placement: Advanced.**

Expand capacity; bitrate; allocation implications.

Availability: Sending/controller hardware with capacity expansion support.

PixelFlow: `src/pages/devices/components/device-info/DeviceLoadCapacity.tsx:17` in `index-CPe5AUX3.js.map`.
