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

MVR: Fix aspect ratios fits connected inputs and PGM/PVW screen sources to their
actual source dimensions. Enabled UMD height comes from the device configuration
XML (the tested P20 reports 24 output pixels). Disabled UMD adds no height.
The video ratio uses window height minus UMD height. The inspector shows the
height and the canvas marks the strip. Unknown heights are reported and skipped.
Apply layout writes geometry and locks, then verifies device readback.
Numeric/corner resizing retains the video ratio and fixed strip height.
Full rectangles, including UMD, cannot overlap. Touching edges are allowed.
Undo/redo and Save/Load retain locks. Save downloads a local JSON file and does
not write device settings. Old layouts retain geometry with upgraded ratio locks.
After changing sources or UMD, Refresh and run Fix aspect ratios again.

The interface uses embedded Rewir Light. No internet connection or font
installation is needed. Attribution and SIL Open Font License text are included
in app/public/fonts/README.txt and app/public/fonts/OFL.txt.

Node.js runtime version and original download checksum are in build-info.json.
runtime/LICENSE contains Node.js and third-party license notices.
Builds were prepared on Intel macOS. Native runtime execution on Windows,
Ubuntu and Apple Silicon, and physical device operation, require target QA.
