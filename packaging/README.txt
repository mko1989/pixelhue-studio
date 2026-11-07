PIXELHUE STUDIO __VERSION__

Portable application: extract the entire archive before starting.
Node.js is included. No npm install or separate Node installation is needed.

macOS Intel / Apple Silicon:
  Use the archive matching your Mac. Double-click "Start Pixelhue Studio.command".
  The portable launcher is not a signed/notarized macOS .app. If macOS blocks it,
  review the extracted files and use Open from its context menu, or launch it
  from Terminal with: ./"Start Pixelhue Studio.command"

Windows x64:
  Extract the ZIP, then double-click "Start Pixelhue Studio.cmd".

Ubuntu x64:
  Extract the tar.gz, then run: ./"Start Pixelhue Studio.sh"
  If your file manager does not preserve permissions, run:
    chmod +x "Start Pixelhue Studio.sh" runtime/bin/node

The app opens your default browser. Keep its terminal window open while using
it; press Ctrl+C to stop. If no browser opens, use the URL printed in that window.
Default: http://127.0.0.1:3210 (tries ports 3211-3220 if 3210 is already occupied).
For a fixed port, set PORT before launching. Set PIXELHUE_NO_BROWSER=1 to disable
automatic browser opening. The server binds only to this computer by default.

Device support:
  P20: multiviewer window editor and all 12 inputs; capacity DL or 4K.
  P10: inputs only (4 HDMI/DP + 2 SDI); capacity SL or 4K.
  P80: inputs only, using installed cards; capacity 4K only.
  Q8: multiviewer and installed-card inputs; reported capacities stay fixed.
      For a local PixelFlow simulator, enter 127.0.0.1 (automatic API port).
      Create initial MVR windows in PixelFlow, then move/resize them here.

Enter the device IP in the top bar. The app detects the device model.
In Inputs, edit rows individually or select rows and use Fill selected.
Fill only stages changes. Apply inputs sends them and checks device readback.
SDI has no EDID; its routing is preserved. Capacity/port changes can interrupt
input signals. Device-managed capacities remain unchanged.

MVR: Fix aspect ratios reads actual connected input resolutions on the current
output, corrects their window sizes without overlaps, and locks each input ratio.
Disconnected inputs and PGM/PVW windows stay unchanged. Review, then click Apply
layout to write geometry/native aspect locks and verify device readback. Locks
survive resize, undo/redo, layout save/load and refresh after Apply.
Manual geometry edits/imports also reject overlaps. Touching edges are allowed.
If a ratio cannot fit at the 64 px minimum, free space is tried before skipping
that window. Impossible direct position swaps need an intermediate free position.
Established source-ratio locks stay editable when an input disconnects and on
PGM/PVW windows. If a connected input changes ratio, run Fix aspect ratios before
resizing, or turn off Keep aspect ratio. Save layout only downloads a local JSON
file; it does not write device settings or change locks.

The interface uses embedded Rewir Light. No internet connection or font
installation is needed. Attribution and SIL Open Font License text are included
in app/public/fonts/README.txt and app/public/fonts/OFL.txt.

Node.js runtime version and original download checksum are in build-info.json.
runtime/LICENSE contains Node.js and third-party license notices.
Builds were prepared on Intel macOS. Native runtime execution on Windows,
Ubuntu and Apple Silicon, and physical device operation, require target QA.
