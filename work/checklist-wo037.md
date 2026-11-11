# WO-037 hardware checklist (P20)

Not tried on the device. Compare with PixelFlow.

## Device → Source backup
- [ ] Block appears and shows the pairs PixelFlow shows.
- [ ] Backup on; add a pair of two same-capacity inputs; PixelFlow lists it.
- [ ] Manual, In use = Backup: the layer shows the backup input. Back to Auto.
- [ ] Primary preferred on/off. Remove the pair. Backup off.
- [ ] Note any error text exactly.

## Device → Self-test
- [ ] Block shows the power-on check summary (or is hidden: note that).
- [ ] Run self-test on an idle device; it finishes and lists the checks.

## Outputs → Advanced · format and colour
On a spare output.
- [ ] Sampling RGB ↔ YCbCr 4:4:4, range Full ↔ Limited, gamut.
- [ ] Hue / saturation / brightness, then Reset colour and Apply.
- [ ] Copy to all outputs.
- [ ] Try YCbCr 4:2:2 at 4K60 and note whether the device refuses.

## Programming → Layer inspector → Keying / Cut & Fill
- [ ] Keying: Luma on a layer with a dark background; threshold/gain. Chroma with a green key colour. Smart.
- [ ] Cut & Fill on: does the layer stay in Studio's layer list? Does PixelFlow show a cut layer?
- [ ] Choose a cut source, invert, change width, Reset. Cut & Fill off.
- [ ] If the layer disappears or anything is refused, note the exact message — the device's layer model here is assumed.

## Programming → Layer inspector → Layer presets
- [ ] Presets made in PixelFlow are listed (if the list is empty although PixelFlow has some, note it: the list route is taken from the Companion module).
- [ ] Save this layer as a preset; it appears in PixelFlow.
- [ ] Apply it to another layer; rename; delete.

## Screens → Test pattern and colour
On a spare Main screen.
- [ ] Pattern White, then Checkerboard with another spacing, then Grid with line width and motion. Off.
- [ ] Brightness / hue, then Reset colour.
- [ ] Note whether line patterns look right vertically (the vertical spacing field is taken from PixelFlow's code).

## Programming → Duplicate / Mirror; MVR → Apply layout
- [ ] Duplicate a PVW layer; Mirror a layer (appears on the opposite side, flipped).
- [ ] MVR tab: is "Apply layout…" shown? Apply one on a moment you can afford to lose the MVR arrangement; note what the list shows.

## Programming → Backgrounds: Edit and Capture PGM
- [ ] Capture PGM: a new background appears. Rename it. Delete it.
- [ ] A background in use on a screen cannot be deleted.

## Inputs → Advanced → Detailed timing and EDID file
On a spare HDMI/DP input.
- [ ] The timing shown matches PixelFlow's detailed timing. Change the refresh, apply, check in PixelFlow, set it back.
- [ ] Export EDID… gives a .bin; Import EDID file… with that same file succeeds.

## Screens → Format
On a spare Main screen with an output mapped.
- [ ] Sampling and bit depth. Dynamic range HDR10 (depth and gamut follow), then back to SDR.
- [ ] Note any refusal text (bandwidth is checked by the device only).
