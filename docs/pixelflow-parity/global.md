# PixelFlow global inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/global.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## GLOBAL-01 · Discovery and projects

**Studio: partial. Placement: Connection bar / Device Advanced.**

Same-subnet discovery; manual cross-subnet IP; create/open/remove project; add/remove devices; model/runtime rules.

Availability: Model, installed card, role and feature XML determine availability.

Discovery and direct IP connection exist; multi-device project orchestration is missing.

PixelFlow: `src/components/base/layout/device-search/index.tsx:16` in `main-Cpb41LiE.js.map`.

Studio: `public/discovery-ui.js`, `lib/discovery.js`.

## GLOBAL-02 · Project files

**Studio: missing. Placement: Device Advanced.**

Import/export parameters and resource files; progress; project naming and synchronization.

Availability: PixelFlow uses its local controller service and Electron file transfer (ucenter/device/upgrade*, project files); only progress reads are device-direct. Needs a traffic capture before it can be built (WO-037).

PixelFlow: `src/components/common/project/export-project/ExportProjectModal.tsx:34` in `main-Cpb41LiE.js.map`.

## GLOBAL-03 · Firmware maintenance

**Studio: missing. Placement: Device Advanced.**

Device and receiving-card lists; firmware upload/upgrade; progress/results; restart; batch naming/diagnostics.

Availability: PixelFlow uses its local controller service and Electron file transfer (ucenter/device/upgrade*, project files); only progress reads are device-direct. Needs a traffic capture before it can be built (WO-037).

PixelFlow: `src/pages/maintain/deviceMaintain/components/DeviceUpgrade/index.tsx:29` in `index-D_EADrom.js.map`.

## GLOBAL-04 · Logs and troubleshooting

**Studio: partial. Placement: Device Advanced.**

Export logs; alert list; version mismatch; network conflict; diagnostic feedback.

Availability: Model, installed card, role and feature XML determine availability.

Studio has error/status reporting; no complete log export/diagnostic manager.

PixelFlow: `src/components/base/layout/index.tsx:226` in `main-Cpb41LiE.js.map`.

Studio: `public/app.js`, `lib/studio-maintenance.js`.

## GLOBAL-05 · Preferences

**Studio: partial. Placement: Settings Advanced.**

Aspect defaults; visibility sync; uniform control; screen resources; source echo limits; UI restore; theme/language.

Availability: Model, installed card, role and feature XML determine availability.

Compact Studio and aspect defaults exist; do not copy unnecessary PixelFlow chrome.

PixelFlow: `src/components/base/layout/index.tsx:226` in `main-Cpb41LiE.js.map`.

Studio: `public/app.js`, `public/studio-panels.js`.

## GLOBAL-06 · Peripheral management

**Studio: missing. Placement: Device Advanced.**

Media servers; cues; keyboard binding; external screen/KVM; connection configuration.

Availability: Relevant peripherals and plugin support.

PixelFlow: `src/pages/external-setting/index.tsx:21` in `index-CjV3BkZw.js.map`.

## GLOBAL-07 · Companion and Event Controller

**Studio: missing. Placement: Device Advanced.**

Companion management; controller layouts; keys/encoders/faders; macros/delays; MIDI; import/export; T-bar calibration.

Availability: Companion/controller integration; do not copy external system credentials or files.

PixelFlow: `src/pages/virtual-console/custom-button/index.tsx:47` in `index-6uulxGxY.js.map`.

## GLOBAL-08 · Controller settings

**Studio: missing. Placement: Device Advanced.**

Panel lighting; time; network; update/reset; PTZ; wisdom/timecode; file/image management.

Availability: Physical control-console family; not P20 processor settings.

PixelFlow: `src/pages/device-setting/index.tsx:27` in `index-BgmEslQR.js.map`.

## GLOBAL-09 · Global/shared sources

**Studio: missing. Placement: Inputs Advanced.**

Map local/network sources; recommended system; shared source list.

Availability: Global/shared-source capability and multi-device projects.

PixelFlow: `src/pages/link-source/index.tsx:20` in `main-Cpb41LiE.js.map`.

## GLOBAL-10 · Hardware backup topology

**Studio: missing. Placement: Device Advanced.**

Device/sending/receiving-card backup relationships; backup canvas.

Availability: Controller family backup menu; separate from P/Q Device Backup toggle.

PixelFlow: `src/pages/backup/index.tsx:12` in `index-D49aMpgD.js.map`.

## GLOBAL-11 · Monitoring

**Studio: missing. Placement: Device Advanced.**

Device/cabinet health; status; logs; bit-error charts; control actions.

Availability: Monitor menu applies to compatible controller families.

PixelFlow: `src/pages/monitor/index.tsx:20` in `index-Clg9CawM.js.map`.

## GLOBAL-12 · Calibration and correction

**Studio: missing. Placement: Screens Advanced.**

Fix/calibration workspace; adjust/cabinet correction; coefficients; cabinet library.

Availability: Controller/LED calibration families; not assumed P20 support.

PixelFlow: `src/pages/adjust/index.tsx:17` in `index-Crb9hSHy.js.map`.

## GLOBAL-13 · Neutral customization

**Studio: missing. Placement: Device Advanced.**

Manufacturer logo; software/model name; startup image; company/about information.

Availability: Neutral-customization management/runtime permission.

PixelFlow: `src/components/base/layout/neutral-config-modal/index.tsx:25` in `main-Cpb41LiE.js.map`.

## GLOBAL-14 · Help and information

**Studio: partial. Placement: Settings Advanced.**

Manual; version/about; plugin list; management tools.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/components/base/layout/user-manual-modal/index.tsx:26` in `main-Cpb41LiE.js.map`.

Studio: `README.md`.
