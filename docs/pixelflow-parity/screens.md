# PixelFlow screens inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/screens.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## SCREENS-01 · Screen list and creation

**Studio: partial. Placement: Primary.**

Add/delete/rename; Main/AUX; empty screen; IDs and visibility; canvas position/size.

Availability: Model, installed card, role and feature XML determine availability.

Main/AUX CRUD exists; full list selection/visibility workflows and other screen types are incomplete.

PixelFlow: `src/pages/screen1/components/LeftScreenList/components/LeftHeader/index.tsx:30` in `main-Cpb41LiE.js.map`.

Studio: `public/screens-ui.js`, `lib/studio-screens.js`.

## SCREENS-02 · Output mosaic editor

**Studio: partial. Placement: Primary.**

Drag physical outputs into screen; arrange/resize tiles; output crop; match connector type/capacity.

Availability: Model, installed card, role and feature XML determine availability.

Studio edits tile geometry numerically; full spatial screen editor is missing.

PixelFlow: `src/pages/screen1/components/LCD/components/ScreenCanvas.tsx:43` in `index-Dh7Eupoq.js.map`.

Studio: `public/screens-ui.js`, `lib/studio-screens.js`.

## SCREENS-03 · Screen groups and super screens

**Studio: missing. Placement: Advanced.**

Create/group screens; multi-device composition; members and group attributes.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/screen1/components/Attr/SuperScreenAttr.tsx:17` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

## SCREENS-04 · Screen information and canvas

**Studio: partial. Placement: Primary.**

Screen name/type; canvas dimensions/frame; loading limits; sync and device compatibility.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/screen1/components/Attr/components/CanvasSetting/index.tsx:13` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

Studio: `public/screens-ui.js`, `lib/studio-screens.js`.

## SCREENS-05 · Screen/output detailed timing

**Studio: missing. Placement: Advanced.**

Resolution/frame; EDID timing; screen resize consequences; bandwidth checks.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/screen1/components/EDID/index.tsx:13` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

## SCREENS-06 · Output format and HDR

**Studio: partial. Placement: Advanced.**

Colour space/depth/gamut; SDR/HDR; gamma; peak brightness; ST2110 parameters.

Availability: Model, installed card, role and feature XML determine availability.

Dynamic range (SDR/HDR10/HLG), sampling, bit depth and gamut with the per-range rules from the screen XML (WO-037). HDR parameters (peak luminance, tone mapping, MaxCLL, HLG grade) and the bandwidth pre-check are missing. Hardware QA pending (WO-037).

PixelFlow: `src/pages/screen1/components/Attr/components/ScreenOutputHDR/index.tsx:18` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

Studio: `public/screen-extras-ui.js`, `lib/screen-extras.js`.

## SCREENS-07 · HDCP

**Studio: missing. Placement: Advanced.**

Screen HDCP policy; output-group policy.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/screen1/components/Attr/components/HDCP/index.tsx:13` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

## SCREENS-08 · Screen image correction

**Studio: implemented. Placement: Advanced.**

Screen/output image quality and colour adjustments.

Availability: Model, installed card, role and feature XML determine availability.

Screen brightness, contrast, saturation, hue and reset: the fields the P20 screen XML supports (WO-037). Hardware QA pending.

PixelFlow: `src/pages/screen1/components/Attr/components/ScreenImageQualityWrap/index.tsx:18` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

Studio: `public/screen-extras-ui.js`, `lib/screen-extras.js`.

## SCREENS-09 · AOI and output location

**Studio: missing. Placement: Advanced.**

Active image area; output offsets; interface positions.

Availability: PixelFlow drives this only through its local controller service (ucenter/screen/edge, edge-fusion-*, mosaic/feather, physical-size); no device-direct route is in the source. Needs a traffic capture before it can be built (WO-037).

PixelFlow: `src/pages/screen1/components/Attr/components/AOI/index.tsx:11` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

## SCREENS-10 · Connector rotation

**Studio: missing. Placement: Advanced.**

Enable; rotation angle; timing dimension limit and screen restrictions.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/screen1/components/Attr/components/InterfaceRotate/index.tsx:11` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

## SCREENS-11 · Edge blending

**Studio: missing. Placement: Advanced.**

Basic/irregular arrangement; edge blending regions and parameters.

Availability: PixelFlow drives this only through its local controller service (ucenter/screen/edge, edge-fusion-*, mosaic/feather, physical-size); no device-direct route is in the source. Needs a traffic capture before it can be built (WO-037).

PixelFlow: `src/pages/screen1/components/Attr/components/ScreenEdgeBlending/index.tsx:17` in `index-6SVZoEOg.js.map`.

## SCREENS-12 · Bezel/edge compensation

**Studio: missing. Placement: Advanced.**

LCD bezel compensation; mutually exclusive blending; crop consequences.

Availability: PixelFlow drives this only through its local controller service (ucenter/screen/edge, edge-fusion-*, mosaic/feather, physical-size); no device-direct route is in the source. Needs a traffic capture before it can be built (WO-037).

PixelFlow: `src/pages/screen1/components/Attr/components/ScreenEdgeCompensationWrap/index.tsx:23` in `index-6SVZoEOg.js.map`.

## SCREENS-13 · Test patterns

**Studio: partial. Placement: Advanced.**

Solid RGBW; horizontal/vertical/slash lines; gradient; aging; spacing and controls.

Availability: Model, installed card, role and feature XML determine availability.

Solid colours, bars, checkerboard, gradients and line patterns with brightness, spacing, line width and motion, from the screen XML (WO-037). Main screens only on the P20 (AUX XML has no pattern). Locate/custom/aging patterns are not offered. Hardware QA pending.

PixelFlow: `src/pages/screen1/components/Attr/components/TestPattern/index.tsx:39` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

Studio: `public/screen-extras-ui.js`, `lib/screen-extras.js`.

## SCREENS-14 · 3D and virtual pixels

**Studio: missing. Placement: Advanced.**

Stereoscopic settings; virtual-point display options.

Availability: Compatible controller/display feature XML.

PixelFlow: `src/pages/screen1/components/Attr/components/ThreeDimensionalWrap/index.tsx:17` in `SuperScreenAttr-Cy0bH4Ty.js.map`.

## SCREENS-15 · LED topology

**Studio: missing. Placement: Advanced.**

Add cabinets; dimensions; rows/columns; custom/library; arrange; cable path; send topology.

Availability: LED/controller family and receiving cards; not assumed available on P20.

PixelFlow: `src/pages/screen1/components/LED/index.tsx:23` in `index-BzLGI7-9.js.map`.

## SCREENS-16 · Cabinet properties

**Studio: missing. Placement: Advanced.**

Basic info; position; grouping; receiving card settings; library; prestored image; blackout/last frame.

Availability: LED/controller family with compatible receiving cards.

PixelFlow: `src/pages/screen1/components/Attr/components/CabinetSetting/index.tsx:10` in `index-6SVZoEOg.js.map`.

## SCREENS-17 · Cabinet backup and fiber

**Studio: missing. Placement: Advanced.**

Dual receiving-card backup; network-port backup; fiber configuration.

Availability: LED/controller family and relevant hardware.

PixelFlow: `src/pages/screen1/components/Attr/components/CabinetDoubleCardsBackup/index.tsx:11` in `index-6SVZoEOg.js.map`.

## SCREENS-18 · Swift layout and sub-screens

**Studio: missing. Placement: Advanced.**

Auto topology; clear/rebuild; sub-screen CRUD; loading/port overload warnings.

Availability: LED/controller family.

PixelFlow: `src/pages/screen1/components/LED/components/SubScreenManager/index.tsx:27` in `index-B9n_BG9X.js.map`.
