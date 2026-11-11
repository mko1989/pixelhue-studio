# WO-017 — PixelFlow programming parity in a faster UI

**Status: OPEN**

Owner (2026-11-09): "i want all the capabilities of pixelflow programming but in an easier snappier env." WO-016 delivered multi-screen PGM/PVW, drag-drop, free roaming, snapping and presets.

## Investigation FIRST (starting points, not yet done)
- Layer properties the device advertises in `deviceconfig/device/layer_2.xml`, also the preset parameter groups in `preset_param.xml` "3-x": source, window, FlipType, Borders, Shadow, Mask, Crop, ImageQuality, CutFill, KeyFrame, CutoutGeneral; plus opacity/transparency, lock and aspect ratio. Map each to its PixelFlow handler under `src/pages/editor1/components/LayerAttribute/presenter/layerAttrEventHandle/*` and the endpoint in the API catalog.
- Transition effects beyond Cut/Fade (manual §6.2.2 switchEffect: Dip, Wipe patterns, Stinger, DVE), T-bar, per-screen freeze/FTB from Programming, BKG/LOGO layers, layer presets (`layers/layer-preset/*`), preset groups/playlists, preset thumbnails.
- Keyboard workflow: arrow nudge, Delete, copy/paste layers, multi-select and align.

## Source audit follow-up (WO-032)

The reviewed [Programming inventory](../../docs/pixelflow-parity/programming.md) now identifies 26 feature groups and their current implementation evidence. The [full matrix and implementation sequence](../../docs/pixelflow-parity/README.md) records other-tab gaps too. Existing source/aspect/fit/alignment, live geometry, keyframe timing/curve and relative/absolute preset controls are recognized; remaining effects, crop/keying, native composites, OSD, gallery management and playlist work keep this WO OPEN.

## WO-036 follow-up (2026-11-11)

Layer opacity, flip, mono/invert, device lock, border, mask, shadow, colour adjustment and source crop are in the inspector ([WO-036](036_WO_pixelflow-review-audio.md)), hardware QA pending. Still open here: layer freeze (endpoint not established), keying and Cut & Fill, crop capacity pre-check, transitions beyond Cut/Fade, T-bar, layer presets, preset playlists, OSD, multiselect/clipboard, gallery management.
