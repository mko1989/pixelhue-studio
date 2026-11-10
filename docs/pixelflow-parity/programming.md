# PixelFlow programming inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/programming.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## PROGRAMMING-01 · PGM/PVW and transitions

**Studio: partial. Placement: Primary.**

Select screen/scene; PGM edit; CUT; TAKE; FTB; screen freeze; transition duration/effects.

Availability: Model, installed card, role and feature XML determine availability.

Basic transport exists; transition type and full per-layer/per-preset transition setup are incomplete.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/Toolbar/index.tsx:33` in `index-BJcacpMZ.js.map`.

Studio: `public/programming-ui.js`, `lib/studio-programming.js`.

## PROGRAMMING-02 · Layer creation and source switching

**Studio: partial. Placement: Primary.**

Drag/drop inputs/images/screens; create/delete; replace source; layer name/serial.

Availability: Model, installed card, role and feature XML determine availability.

Studio has inputs/gallery/screen sources and live geometry; advanced layer types remain incomplete.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/MainArea/editorLayerPresenter/layerEventHandle/layerCreateHandle.ts:73` in `main-Cpb41LiE.js.map`.

Studio: `public/program-stage.js`, `public/layer-tools.js`, `lib/studio-programming.js`.

## PROGRAMMING-03 · Position and size

**Studio: partial. Placement: Primary.**

X/Y/width/height; aspect; fit/fill; multi-selection; physical screen updates.

Availability: Model, installed card, role and feature XML determine availability.

Studio has instant drag/numeric updates, source/preset aspect modes, fit to screen/width/height/output and native 1:1. PixelFlow multi-selection transforms remain incomplete. Replacement source drops keep X/Y and fit inside the previous width/height with aspect lock; impossible minimum-size fits are rejected.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerPositionSizeWrapper.tsx:24` in `index-BJcacpMZ.js.map`.

Studio: `public/layer-inspector.js`, `public/program-stage.js`, `lib/program-geometry.js`, `public/layer-tools.js`, `lib/source-aspect.js`.

## PROGRAMMING-04 · Canvas tools

**Studio: partial. Placement: Primary.**

Zoom/fit; snap; guides; selection; align/distribute; layer stack ordering; copy/paste/mirror.

Availability: Model, installed card, role and feature XML determine availability.

Studio has zoom, fit, snapping, screen alignment, fills and stacking. Multi-selection transforms, clipboard/mirror and complete shortcuts are missing.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/Toolbar/index.tsx:33` in `index-BJcacpMZ.js.map`.

Studio: `public/program-stage.js`, `public/layer-tools.js`.

## PROGRAMMING-05 · Layer basic properties

**Studio: partial. Placement: Advanced.**

Enable; name/serial; freeze; opacity; flip; source selection.

Availability: Model, installed card, role and feature XML determine availability.

Enable/name exist; freeze/opacity/flip parity is missing.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerBaseWrapper.tsx:23` in `index-BJcacpMZ.js.map`.

Studio: `public/layer-inspector.js`, `lib/studio-programming.js`.

## PROGRAMMING-06 · Border

**Studio: missing. Placement: Advanced.**

Enable; horizontal/vertical width; colour; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerBorderWrapper.tsx:23` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-07 · Mask

**Studio: missing. Placement: Advanced.**

Enable; top/bottom/left/right; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerMaskWrapper.tsx:20` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-08 · Shadow

**Studio: missing. Placement: Advanced.**

Enable; position; size/colour; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerShadowWrapper.tsx:18` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-09 · Layer image effects

**Studio: missing. Placement: Advanced.**

Brightness; contrast; hue; saturation; per-layer effect settings; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerEffectWrap.tsx:22` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-10 · Keying/DSK

**Studio: missing. Placement: Advanced.**

Luma/chroma; enable; key parameters; invert; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerCutout.tsx:45` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-11 · Source crop

**Studio: missing. Placement: Advanced.**

Enable; source crop rectangle; ratio/pixel controls; capacity checks.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerAttrAdvanced.tsx:26` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-12 · Cut & Fill

**Studio: missing. Placement: Advanced.**

Cut source layer; invert; reset; source/capacity/keying incompatibilities.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerCutFill/index.tsx:36` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-13 · Keyframes

**Studio: partial. Placement: Advanced.**

Motion keyframes; timing/easing; preview/apply; resource checks.

Availability: Model, installed card, role and feature XML determine availability.

Studio edits animate-on-Take enable, curve, start and duration and preserves other keyframe fields. Full keyframe preview and advanced motion workflows remain incomplete.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerKeyframeWrapper.tsx:24` in `index-BJcacpMZ.js.map`.

Studio: `public/layer-inspector.js`, `lib/studio-programming.js`.

## PROGRAMMING-14 · 3D layers

**Studio: missing. Placement: Advanced.**

Stereoscopic source/layer attributes.

Availability: 3D-capable layer/device.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerBaseAttr/LayerThreeDWrapper.tsx:15` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-15 · Native Live BKG

**Studio: missing. Placement: Advanced.**

Build/edit/save/delete multi-slot live backgrounds; source capacities; slot geometry.

Availability: Native Live BKG support; previously tested unavailable on P20 V2.0.0 (WO-025).

Distinct from video preview exclusion and Studio GRP pairs.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/LiveBKGTopBar/index.tsx:25` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-16 · Native mosaic sources

**Studio: missing. Placement: Advanced.**

Create/edit/ungroup mosaic sources; reusable combined sources.

Availability: Native mosaic-source feature; unavailable on tested P20 firmware.

Separate from the Mac 1×2 input groups.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/MosaicMergedSource/index.tsx:15` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-17 · Studio paired layer groups

**Studio: partial. Placement: Advanced.**

Coordinated two-layer positioning; lock aspect; rename/delete.

Availability: Model, installed card, role and feature XML determine availability.

Studio workaround only; not evidence of native PixelFlow composite-source parity.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/MosaicMergedSource/index.tsx:15` in `index-BJcacpMZ.js.map`.

Studio: `public/group-geometry.js`, `lib/layer-groups.js`.

## PROGRAMMING-18 · Source organization

**Studio: partial. Placement: Primary.**

Local/network/global sources; named groups; group hierarchy; signal-only filter; slot/signal sorting.

Availability: Model, installed card, role and feature XML determine availability.

Studio source tabs/filtering exist; persistent native named groups and global-source mapping are missing.

PixelFlow: `src/pages/editor1/components/SourcePanel/components/source-group/index.tsx:49` in `index-BJcacpMZ.js.map`.

Studio: `public/source-tabs.js`, `lib/group-sources.js`.

## PROGRAMMING-19 · Gallery and still sources

**Studio: partial. Placement: Advanced.**

BKG/LOGO list; thumbnails; upload; import/export/delete/cancel; storage; capture.

Availability: Model, installed card, role and feature XML determine availability.

Studio lists/uploads/uses images; complete gallery export/delete/capture/storage workflows are missing.

PixelFlow: `src/pages/editor1/components/SourcePanel/components/image-source/index.tsx:41` in `index-BJcacpMZ.js.map`.

Studio: `public/source-tabs.js`, `lib/gallery.js`.

## PROGRAMMING-20 · OSD

**Studio: missing. Placement: Advanced.**

Image OSD; static/dynamic text; weather/time OSD; styles; fonts; clear/apply; OSD presets.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/SourcePanel/components/text-osd/index.tsx:12` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-21 · USB media playback

**Studio: missing. Placement: Advanced.**

Play/stop/next/previous; transitions; playback settings; missing/corrupt file feedback.

Availability: USB media hardware support.

PixelFlow: `src/pages/editor1/components/SourcePanel/components/UDiskAttr/index.tsx:26` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-22 · Screen presets

**Studio: partial. Placement: Primary.**

List; create/update/overwrite; name; delete; load PVW/PGM; screen selection.

Availability: Model, installed card, role and feature XML determine availability.

Studio supports absolute/relative presets, parameter/layer selection, overwrite, PGM/PVW load, transition/keyframe options and verified Auto-take. Full native preset grouping, playlist and transition-effect parity remain incomplete.

PixelFlow: `src/pages/preset1/components/PresetSceneList/index.tsx:38` in `index-tTadQEi1.js.map`.

Studio: `public/presets-ui.js`, `lib/studio-presets.js`.

## PROGRAMMING-23 · Layer presets

**Studio: missing. Placement: Advanced.**

Save/apply layer input/flip/border/mask/effects/shadow/freeze subsets.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/LayerPreset/index.tsx:29` in `index-DRegRgjP.js.map`.

## PROGRAMMING-24 · Preset playlists

**Studio: missing. Placement: Advanced.**

Create/edit groups; ordered presets; intervals; loop; play/pause; delete/ungroup.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/editor1/components/PresetLoopPanel/index.tsx:26` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-25 · Reverse control and decoder details

**Studio: missing. Placement: Advanced.**

KVM/reverse control IP/port; IPC stream status and resource diagnostics.

Availability: Compatible KVM/IPC hardware.

PixelFlow: `src/pages/editor1/components/LayerEditor/components/RemoteCtl/RemoteCtlSetting.tsx:17` in `index-BJcacpMZ.js.map`.

## PROGRAMMING-26 · Live input video preview

**Studio: excluded. Placement: None.**

PixelFlow input-view streams/thumbnails.

Availability: Model, installed card, role and feature XML determine availability.

Owner explicitly requested MVR instead of live input video. Metadata and still gallery thumbnails remain in scope.

PixelFlow: `src/components/base/layout/source-echo/index.tsx:32` in `main-Cpb41LiE.js.map`.
