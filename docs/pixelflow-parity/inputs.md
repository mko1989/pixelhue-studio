# PixelFlow inputs inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/inputs.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## INPUTS-01 · Port setup

**Studio: implemented. Placement: Primary.**

All physical inputs including SDI; connector HDMI/DP choice; per-model SL/DL/4K capacity; port names; bulk edits.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/input-attr-panel/input-base-atrr/components/CapacityComponent.tsx:17` in `main-Cpb41LiE.js.map`.

Studio: `public/inputs.js`, `lib/inputs.js`, `lib/input-models.js`.

## INPUTS-02 · Signal metadata

**Studio: partial. Placement: Primary.**

Slot/type; source resolution and frame rate; sampling; bit depth; gamut; range; HDR; peak brightness; audio channels/sample rate; 2D/3D.

Availability: Model, installed card, role and feature XML determine availability.

Studio shows signal/resolution; full InfoFrame/audio/HDR metadata remains missing.

PixelFlow: `src/pages/devices/components/input-attr-panel/input-base-atrr/index.tsx:105` in `main-Cpb41LiE.js.map`.

Studio: `public/inputs.js`, `lib/inputs.js`.

## INPUTS-03 · EDID timings

**Studio: partial. Placement: Primary.**

Preset/custom resolution and frame; detailed blanking/porches/sync/polarity; apply.

Availability: Model, installed card, role and feature XML determine availability.

Preset/custom resolution in the table; detailed timing (active, front porch, sync, total, polarity, refresh) in Advanced with derived back porch and pixel clock (WO-037). Hardware QA pending (WO-037).

PixelFlow: `src/pages/devices/components/input-attr-panel/edidAttrInfo/index.tsx:14` in `main-Cpb41LiE.js.map`.

Studio: `public/inputs.js`, `lib/inputs.js`, `public/input-edid-ui.js`, `lib/input-edid.js`.

## INPUTS-04 · EDID files

**Studio: implemented. Placement: Advanced.**

Import/export EDID file; size and format validation.

Availability: Model, installed card, role and feature XML determine availability.

Import with EDID structure checks (blocks, header, checksums, extension count) and export as .bin (WO-037). Hardware QA pending (WO-037).

PixelFlow: `src/components/common/edid-export/index.tsx:57` in `SourceTitle-Cz-58G7-.js.map`.

Studio: `public/input-edid-ui.js`, `lib/input-edid.js`.

## INPUTS-05 · Mac compatibility

**Studio: implemented. Placement: Advanced.**

Mac EDID compatibility off/on; per input and bulk.

Availability: EDID-capable active connector advertising editable CompatibilityMode.

PixelFlow: `src/components/common/compatibility-mode/index.tsx:21` in `SourceTitle-Cz-58G7-.js.map`.

Studio: `public/input-advanced.js`, `lib/input-advanced.js`.

## INPUTS-06 · Mac tiled groups

**Studio: implemented. Placement: Advanced.**

Native 1×2 Mac Mosaic; left/right; group 1–16; pair creation; remove; matching connector and detailed timing.

Availability: MacMosaic support plus editable Mac compatibility on current input.

Separate from Programming GRP pairs, network source groups and native mosaic-source.

PixelFlow: `src/components/common/compatibility-mode/index.tsx:21` in `SourceTitle-Cz-58G7-.js.map`.

Studio: `public/input-advanced.js`, `lib/input-mosaic.js`.

## INPUTS-07 · HDCP

**Studio: implemented. Placement: Advanced.**

HDCP enable; preserve configured version.

Availability: Advertised editable HDCP input enable.

PixelFlow: `src/pages/devices/components/input-attr-panel/input-base-atrr/index.tsx:105` in `main-Cpb41LiE.js.map`.

Studio: `lib/input-advanced-fields.js`, `public/input-advanced.js`.

## INPUTS-08 · InfoFrame overrides

**Studio: partial. Placement: Advanced.**

Sampling; bit depth; quantization range; gamut; dynamic range.

Availability: Only advertised editable enumerations; card overrides take precedence.

Basic enumerated overrides added. Full dependent sampling/depth/bandwidth constraints and HDR metadata UI remain gaps.

PixelFlow: `src/components/common/hdr-setting/ColorSpaceDepthRange.tsx:22` in `main-Cpb41LiE.js.map`.

Studio: `lib/input-advanced-fields.js`, `public/input-advanced.js`.

## INPUTS-09 · HDR metadata

**Studio: missing. Placement: Advanced.**

From input; SDR gamma; HDR10/HLG; peak brightness; ambient illuminance; MaxCLL/PQ/tone mapping; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/components/common/hdr-setting/index.tsx:63` in `main-Cpb41LiE.js.map`.

## INPUTS-10 · Image quality

**Studio: implemented. Placement: Advanced.**

RGB/master black level/brightness and contrast; hue; saturation; shadow; highlight; gamma; reset.

Availability: Per-card editable ImageQuality fields and XML ranges; gamma uses reported gammaScale.

PixelFlow: `src/pages/devices/components/input-attr-panel/input-effect-attr/index.tsx:49` in `SourceTitle-Cz-58G7-.js.map`.

Studio: `lib/input-advanced-fields.js`, `public/input-advanced.js`.

## INPUTS-11 · Input keying/DSK

**Studio: missing. Placement: Advanced.**

Enable source keying; luma/chroma parameters; reset.

Availability: Q-family source-keying support; incompatible with Cut & Fill.

Input panel reuses layer cutout controls; do not expose a generic switch without resource checks.

PixelFlow: `src/pages/editor1/components/LayerAttribute/components/LayerAttr/components/LayerCutout.tsx:45` in `index-BJcacpMZ.js.map`.

## INPUTS-12 · Deinterlace allocation

**Studio: missing. Placement: Advanced.**

Allocate supported connectors per card; capacity/resource validation.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/InterfaceInterlacedAllocator/index.tsx:25` in `index-CPe5AUX3.js.map`.

## INPUTS-13 · Input gain

**Studio: missing. Placement: Advanced.**

Adaptive/drive enhancement; swing/pre-emphasis; CDR; EQ compensation; reset.

Availability: Feature XML plus project preference enables gain controls.

PixelFlow: `src/components/common/input-gain/index.tsx:13` in `main-Cpb41LiE.js.map`.

## INPUTS-14 · Optical inputs

**Studio: missing. Placement: Advanced.**

Work mode; copy/backup; input source selection; metadata.

Availability: Installed optical card.

PixelFlow: `src/pages/devices/components/input-attr-panel/input-fiber-attr/index.tsx:33` in `index-CPe5AUX3.js.map`.

## INPUTS-15 · IP video streams

**Studio: missing. Placement: Advanced.**

Source address; SDP import/export; pull stream; custom stream attributes; primary/backup OPT IP.

Availability: Installed IP/ST2110 input card.

PixelFlow: `src/pages/devices/components/input-attr-panel/input-video-attr/index.tsx:53` in `main-Cpb41LiE.js.map`.

## INPUTS-16 · ST2110 transport

**Studio: missing. Placement: Advanced.**

PTP master/slave/domain/status; FEC; IGMP version; primary/backup optics.

Availability: Installed ST2110 card.

PixelFlow: `src/pages/devices/components/st2110-settings/index.tsx:23` in `index-CPe5AUX3.js.map`.

## INPUTS-17 · SDI matrix routing

**Studio: missing. Placement: Advanced.**

Source/image/output selection; reset; offline/non-SMPTE feedback.

Availability: Device SDI matrix support; route under Inputs Advanced or Outputs Advanced.

PixelFlow: `src/pages/devices/components/sdi-matrix-setting/index.tsx:43` in `index-CPe5AUX3.js.map`.

## INPUTS-18 · Card allocation

**Studio: partial. Placement: Advanced.**

Select/disable connectors; change card capacity; source/backup/sync consequences.

Availability: Model, installed card, role and feature XML determine availability.

Basic physical connector/capacity selection exists; full card allocation UI and warnings remain incomplete.

PixelFlow: `src/pages/devices/components/input-subcard-attr/InputSubcardAttr.tsx:97` in `index-CPe5AUX3.js.map`.

Studio: `lib/inputs.js`, `public/inputs.js`.
