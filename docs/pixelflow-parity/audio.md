# PixelFlow audio inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/audio.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## AUDIO-01 · Audio matrix

**Studio: missing. Placement: Primary.**

Input/output channel routing crosspoints; clear all; channel metadata; grid state.

Availability: Audio Matrix menu is XML-gated; compatible audio hardware.

P/Q menu includes Audio Matrix; Studio has no equivalent tab or panel.

PixelFlow: `src/pages/audio-matrix/components/MatrixSetting/index.tsx:29` in `index-DXkjIiZD.js.map`.

## AUDIO-02 · Mute and test tone

**Studio: missing. Placement: Primary.**

Input/output mute; test tone; per-channel reporting.

Availability: Audio channel support.

PixelFlow: `src/pages/audio-matrix/presenter/audioMatrix.ts:45` in `main-Cpb41LiE.js.map`.

## AUDIO-03 · Dante channel settings

**Studio: missing. Placement: Advanced.**

Dante channels; names; sample rate and status.

Availability: Dante audio card.

PixelFlow: `src/pages/devices/components/device-info/dante-attr/components/DanteChannelAttr/index.tsx:23` in `index-CPe5AUX3.js.map`.
