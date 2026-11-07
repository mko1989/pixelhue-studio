# Pixelhue Studio

A small local Node.js app for configuring Pixelhue inputs in bulk and arranging P20/Q8 multiviewer windows. Portable distributions include Node.js. Running from source requires Node.js 22 or newer, with no npm dependencies or UI build step.

```sh
cd mvr-app
npm start
```

Open **http://127.0.0.1:3210** in your browser and enter the device IP in the top bar. The connection controls, detected model and serial stay together in the header.

| Model | Input setup | Capacity choices | Multiviewer editing |
| --- | --- | --- | --- |
| P10 | 4 HDMI/DP + 2 SDI inputs | SL / 4K | Disabled |
| P20 | 8 HDMI/DP + 4 SDI inputs | DL / 4K | Supported |
| P80 | Actual inputs from installed cards | 4K only | Disabled |
| Q8 | Actual inputs from installed cards | Reported capacity, fixed | Supported |

The app detects the model from the serial-verified discovery record, or authenticated node information when using an explicit API port. P10/P80 open directly into Inputs creator and do not query screen/layer endpoints. The server rejects Multiviewer writes for those models.

## Connect and edit Multiviewer

1. Run this app on a computer that can reach the device over the network.
2. Enter the device address in the top bar and click **Connect**. The app discovers the HTTP API port through HTTPS port 19998, matches the entered IP and verifies the serial using the device's own API. Other discovered NovaStar devices do not require you to enter a serial. If necessary, enter a known API port under **Connection options**; the serial field remains an optional override.
3. Select an MVR output and window. Drag to position it, drag a corner to resize, or type exact X/Y/width/height values. Coordinates are pixels relative to the top-left of the MVR output.
4. Click **Apply layout**. Only changed MVR window geometry is sent. The app reads the device back and reports success only when all requested positions and sizes match.

Arrow keys move the selected window by 1 pixel; Shift moves by 10. Ctrl/Cmd+Z undoes an edit, Ctrl/Cmd+Shift+Z redoes it. The Snap menu controls drag snapping; Keep aspect ratio applies to the selected window independently. Save layout downloads JSON with the current geometry and ratio locks, including pending edits. Load layout stages the file for the same device serial, MVR output, resolution, and window IDs; it does not apply it automatically. Refresh rereads the device and discards pending edits after confirmation.

**Fix aspect ratios** reads the actual resolution of connected direct-input sources on the selected MVR output, fits their windows to those ratios, and locks each one for subsequent numeric/corner resizing. It uses signal timing, not the EDID setting. Disconnected inputs, invalid/missing signal timings, cropped/other source types, and PGM/PVW windows are left unchanged. The inspector shows connected input resolution.

The action normally shrinks within each window's existing rectangle while retaining its centre. If the ratio cannot fit there at the 64×64 minimum, it tries a minimum-size placement in nearby free output space. Unfittable windows are reported and kept unchanged. It stages the correction as one undoable action; click Apply layout to send geometry and native `layers/aspect-ratio` locks (OriginalRatio=8, locked=1), then verify readback. New source-ratio locks require a connected direct input; resizing a connected input with stale ratio settings requires running the fix again.

Windows cannot overlap: pointer movement/resizing, numeric edits, alignment, keyboard movement, imported layouts and server writes all check this. Edge touching is allowed. The server orders geometry changes so shrinking/moving neighbours free space before another window uses it. A direct swap with no collision-free write order is rejected; move one window into free space and Apply first. Ratio locks are included in undo/redo and JSON layouts; applied locks are recovered from device readback on Refresh.

Existing source-ratio locks on disconnected inputs or PGM/PVW windows remain editable using their retained window ratio. Position-only moves do not require a current input signal or a new aspect-lock command. If a connected input changes ratio, run Fix aspect ratios before resizing to its new ratio, or turn off Keep aspect ratio. Save layout downloads JSON locally and does not write to the device or change any locks.

The canvas is a geometry preview, not a video monitor. Create the initial MVR windows by selecting a layout in PixelFlow. The Multiviewer tab moves/resizes existing windows; it does not create windows or change sources, templates, PGM, or PVW layers. Saved layouts depend on stable window IDs; recreate them if PixelFlow regenerates the windows.

For the local PixelFlow Q8 simulator, enter **127.0.0.1** as the device address; its advertised API port is discovered automatically. The simulator used for verification exposed two MVR outputs and 72 physical input ports across six installed cards. Counts depend on the card configuration. Empty MVR outputs need initial windows created in PixelFlow.

## Inputs creator

Inputs creator adapts to the connected model. **P20** lists Inputs 1–8 with **HDMI 2.0 / DP 1.2** selection and SDI Inputs 9–12. **P10** lists four HDMI/DP inputs and SDI Inputs 5–6. Missing cards are omitted. **P80 and Q8** enumerate actual input connectors on their installed cards, with each physical port kept fixed; there is no assumed input count or HDMI/DP pair switching. Output and MVR interfaces are excluded. Q8 retains each reported capacity and work mode; the capacity and port selectors are fixed. Inactive ports are labelled. Names and supported EDIDs can still be configured.

Configure supported capacity and source names individually or in bulk. HDMI/DP (and supported DVI) inputs also expose EDID width/height/frame rate/timing standard. EDID frame rates use Hz, including fractional rates such as 59.94. Imported EDID files and detailed timings are kept until you edit the EDID fields; editing replaces them with a preset timing. Device-managed capacities are read-only and bulk capacity choices preserve them. Other connector types expose their detected signal rather than an invented EDID editor.

Row and bulk capacity choices follow the detected model, and the server rejects unsupported capacity changes before any write. An existing unsupported/legacy value can be preserved during name or EDID edits; it appears as a disabled current-value entry and cannot be used for a new port/capacity configuration. Device-managed values are preserved.

SDI does not use EDID. Its rows show detected signal timing; bulk HDMI/DP selection and EDID presets leave SDI untouched. SDI name/capacity changes preserve existing connector routing and exclude the optical ports on the same card.

To configure multiple inputs at once:

1. Select the rows to configure, or use **Select all**.
2. Set the bulk port, capacity, EDID preset and optional name pattern (for example `Camera {n}`). Leave individual bulk options at **Keep** to preserve those fields.
3. Click **Fill selected** to stage the settings. You can still edit individual rows.
4. Click **Apply inputs** to send the pending changes and verify device readback.

Capacity/port changes first use PixelFlow's resource-assessment endpoint. The server writes only the affected input connector pairs and resolves interface IDs again after switching ports, before applying names and EDIDs. Output, MVR and AUX connector modes are excluded. Input changes may interrupt signal acquisition or affect sources used by live layers. Changes across modes, names and EDIDs are sequential and can partially succeed; after an error, refresh inputs to inspect actual settings.

The P10/P20 slot/pair mappings follow their backboard configurations in the supplied PixelFlow source. P80/Q8 inputs require a reported input interface joined to its actual card connector. Names are limited to 32 UTF-8 bytes, matching PixelFlow. Device firmware enforces bandwidth and timing limits beyond the editor's basic validation.

## Firmware limits

Free placement is subject to what the device firmware accepts. The supplied PixelFlow source locks input sizes on devices with `Features.Layer.TemplateFixedInput.Support === 1` and checks overlaps and screen boundaries. A third-party editor cannot remove hardware/firmware restrictions. If a write is rejected, changed, or silently ignored, the app reports an error and retains the pending edit for inspection; click Refresh to see the actual device state. Apply may partially change a batch before a firmware error; it does not perform an automatic rollback.

MVR output dimensions come from `screen.timing.horizontal.addTime` / `vertical.addTime`, falling back to `mosaic.window`. If neither is available, the app warns that 1920×1080 is assumed. Minimum editable window size is 64×64. Overlap rules and per-source scaling limits are left to the device, which may reject a layout even if it fits on the canvas.

**Hardware verification remains necessary:** Q8 IP-only connection, input name/EDID writes, repeated MVR geometry Apply and aspect locks on both outputs were verified against the local PixelFlow simulator. Simulator results and automated tests do not prove physical firmware behavior.

## Connection details

The integration follows the supplied `companion-module-pixelhue-switcher-2.2.7`:

- Discover at `https://DEVICE:19998/unico/v1/ucenter/device-list` and use the selected device's advertised HTTP port.
- Read `/unico/v1/node/open-detail`; sign an HS256 JWT with payload `{SN: sn}`, secret `startTime`, and no timestamp. Send the raw token as `Authorization`.
- Read `/unico/v1/screen/list-detail` and `/unico/v1/layers/list-detail`. MVR screens have `screenIdObj.type === 8`; layer membership comes from `layerIdObj.attachScreenId`.
- Write `PUT /unico/v1/layers/window` with `[{layerId, window: {x, y, width, height}}]`.

Input settings follow the supplied PixelFlow source maps: read `interface/list-detail` and `node/subcard/mode?nodeId=1&startSlotId=0&endSlotId=100`; assess with `system/auxiliary/assess/subcard-mode`, then write `node/subcard/mode`, `interface/general`, and `interface/preset-thumb-timing`.

The Node server handles device communication, so browser CORS does not affect the P20 connection. Discovery accepts the device's self-signed certificate, matching Companion; subsequent API traffic uses HTTP. Tokens remain in server memory. This app has one active device connection per process; another tab switching devices invalidates older tabs' Apply sessions. Use Refresh to load the current connection. Do not edit the same layout simultaneously in multiple tabs or in PixelFlow.

By default the web server listens only on `127.0.0.1`. `PORT=3211 npm start` changes the port. For access from a tablet on a trusted LAN, use `HOST=0.0.0.0 npm start` and browse to the computer's IP on port 3210. There is no user authentication; keep this local control app on a trusted network. No server-side runtime files are written.

## Portable distributions

The UI uses locally embedded [Rewir Light](https://github.com/warszawskie-kroje/rewir) throughout, including controls and numeric fields. Font files, attribution and the SIL Open Font License are included under `public/fonts`; no external font service or system font installation is needed.

Prepared archives are in [dist](dist/README.md), with a bundled Node.js runtime and launchers:

- Intel Mac: `Pixelhue-Studio-1.4.0-macos-intel.zip`
- Apple Silicon Mac: `Pixelhue-Studio-1.4.0-macos-silicon.zip`
- Windows x64: `Pixelhue-Studio-1.4.0-windows-x64.zip`
- Ubuntu x64: `Pixelhue-Studio-1.4.0-ubuntu-x64.tar.gz`

Extract the full archive, then launch `Start Pixelhue Studio.command` on Mac, `Start Pixelhue Studio.cmd` on Windows, or `Start Pixelhue Studio.sh` on Ubuntu. The launcher opens your browser and prints the URL; keep the terminal window open and use Ctrl+C to stop. No separate Node/npm installation is required. The default port is 3210, with automatic fallback through 3220 if occupied. `PORT` overrides this choice; `PIXELHUE_NO_BROWSER=1` disables automatic browser opening.

These are portable folders, not signed installers or notarized macOS `.app` bundles. Runtime compatibility follows [Node 22's platform requirements](https://github.com/nodejs/node/blob/v22.23.4/BUILDING.md#platform-list). See each archive's `README.txt` and `build-info.json` for usage and runtime provenance. `dist/SHASUMS256.txt` and `manifest.json` describe archive checksums; `verification.json` records performed checks and native execution limits.

To rebuild on macOS/Linux with Node 22+, `tar`, `zip`, and `unzip`:

```sh
npm run build:dist
npm run verify:dist
```

The builder downloads pinned official Node 22.23.4 runtimes and checks their SHA-256 hashes against the official release checksums before extracting them. Its cache is `.dist-cache/`. It packages only application source, web assets, runtime/license, launcher and build metadata. The verifier checks archive hashes, source hashes, native binary formats, archive contents, and the extracted native launcher when running on a matching supported build host. Other target execution still requires target OS QA.

## Verification

```sh
npm test
```

The Node test suite covers authentication, IP-only discovery in the presence of another device, serial/model verification, MVR membership, geometry limits, rejected and ignored writes, P10/P20/P80/Q8 input mapping and batch writes, P10/P80 MVR rejection, resource assessment, refreshed interface IDs, EDID payloads, stale sessions, origin checks, resize math, and layout import validation. Tests need permission to listen on local loopback sockets.

See [WO-008](../work/work-orders/008_WO_ui-rewir.md) for the UI/font update, [WO-007](../work/work-orders/007_WO_mvr-repeat-apply.md) for the repeated Apply/source-lock fix and [the checklist](../work/checklist-mvr.md) for hardware QA.
