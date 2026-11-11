# WO-036 hardware checklist (P20)

None of this has been tried on the device; it was unreachable while it was built. Compare each result with PixelFlow.

`[~]` = the device part was proven by script on the live P20 in WO-039 (see that work order for exactly what); the on-screen result and the comparison with PixelFlow are still yours to check. `[ ]` = not run.

## Audio tab
- [~] Audio tab appears after connecting; inputs down, outputs across, Audio In/Out ports listed.
- [~] Click a crosspoint with Pair on: both channels route. PixelFlow shows the same matrix.
- [~] Click another input for the same output: the old route disappears.
- [ ] Alt-click routes a single channel.
- [~] M on an output channel mutes it; T sends a test tone; both clear again.
- [ ] Clear all removes every route.
- [ ] If routes are refused: note the error text (device audio may need enabling first).

## Programming → Layer inspector
Use a PVW layer on a spare screen.
- [~] Opacity slider, Flip H, Flip V, Mono, Invert.
- [~] Locked on device: PixelFlow shows the layer locked; unlock again.
- [~] Border on, width/height, each style, colour, Reset border.
- [~] Mask left/right/top/bottom, Reset mask.
- [~] Shadow on, offset, feather, Reset shadow.
- [~] Colour: brightness, contrast, saturation, hue, Reset colour.
- [~] Source crop on an input layer, Reset crop.
- [ ] Note any "no free layer resources" message and which effect caused it.

## Device tab
- [ ] Device clock shows the same time as PixelFlow.
- [ ] Use this computer's time, then Set clock with another zone; check in PixelFlow.
- [~] Electrostatic protection on, 500 ms; PixelFlow shows the same; set back.
