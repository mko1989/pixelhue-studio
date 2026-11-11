# PixelFlow audio inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/audio.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## AUDIO-01 · Audio matrix

**Studio: implemented. Placement: Primary.**

Input/output channel routing crosspoints; clear all; channel metadata; grid state.

Availability: Feature XML Audio + AudioMatrix support, or a P20 DS card (judgeSupportAudioMatrix). The live P20 advertises it.

Audio tab: crosspoint grid, one input per output, clear all, pair routing. PixelFlow's audio/matrix-preset API has no UI caller and is not offered. Verified offline and in Chrome against the mock; hardware QA pending (WO-036).

PixelFlow: `src/pages/audio-matrix/components/MatrixSetting/index.tsx:29` in `index-DXkjIiZD.js.map`.

Studio: `public/audio-ui.js`, `lib/studio-audio.js`.

## AUDIO-02 · Mute and test tone

**Studio: implemented. Placement: Primary.**

Input/output mute; test tone; per-channel reporting.

Availability: Audio channel support.

Mute and test tone per channel and per port; signal dot on video inputs. Verified offline and in Chrome against the mock; hardware QA pending (WO-036).

PixelFlow: `src/pages/audio-matrix/presenter/audioMatrix.ts:45` in `main-Cpb41LiE.js.map`.

Studio: `public/audio-ui.js`, `lib/studio-audio.js`.

## AUDIO-03 · Dante channel settings

**Studio: missing. Placement: Advanced.**

Dante channels; names; sample rate and status.

Availability: Dante audio card. The live P20 reports AudioDante Support=0.

PixelFlow: `src/pages/devices/components/device-info/dante-attr/components/DanteChannelAttr/index.tsx:23` in `index-CPe5AUX3.js.map`.

## AUDIO-04 · Screen audio

**Studio: missing. Placement: Advanced.**

Screen volume; mute; audio source (follow, analog in, layer).

Availability: Programming toolbar; screen XML AudioSettings.

PixelFlow posts to ucenter/screen/audio, its local controller service. No direct device route is established, so this is not added until one is captured from PixelFlow traffic (found in WO-036).

PixelFlow: `src/pages/editor1/components/LayerEditor/components/MainArea/editorLayerPresenter/layerEventHandle/handleScreenAudioSetting.ts:11` in `main-Cpb41LiE.js.map`.

## AUDIO-05 · Input audio source

**Studio: missing. Placement: Advanced.**

No audio; embedded audio; analog audio in.

Availability: Feature XML AudioInputSourceEdit lists connector types 2, 24, 26, 33, 51, 55 only; the P20 HDMI, DP and SDI inputs are not listed, so PixelFlow does not offer it there.

POST interface/audio-source [{ sourceId, interfaceId }] (found in WO-036). Conditional on other hardware.

PixelFlow: `src/pages/editor1/components/SourcePanel/presenter/inputSourceListPresenter/inputSourceHandle/handleVideoSettingItemClick.ts:12` in `index-BJcacpMZ.js.map`.
