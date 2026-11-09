**Status: IN PROGRESS**

## Investigation FIRST

Owner requests copying claude.md rules to the agent instruction file; a new pixelhue-studio project folder connected to GitHub; instant/completed-drag MVR writes; and a fast full-client foundation with tabs ordered Device, Inputs, Outputs, Screens, Programming, MVR, native discovery and no input-video preview.

- Prior WOs 001–010 preserve input model/capacity policies, MVR overlap/UMD/source-lock and repeated-Apply protections. WO-013 provides the endpoint catalog. Existing source is clean at 9640220 on origin/main.
- Created a local clone into workspace/pixelhue-studio, retaining history and changing origin to the existing https://github.com/mko1989/pixelhue-studio.git. Copied claude.md verbatim to workspace AGENTS.md and project AGENTS.md/claude.md; copied work-order memory into the new project. Generated old distribution/runtime caches remain in the original folder.
- Existing app has only MVR/Inputs tabs. `public/app.js` uses one busy flag, explicit Apply and full-state adopt that clears undo history. Autosave needs a separate coalescing write queue and reconciliation that preserves edits made after the submitted snapshot; no writes on pointermove or cancelled drags.
- Server session/origin guards and serialized device writes must cover new panels. Add bounded, typed application routes instead of an unrestricted API proxy. Inputs retain existing tested behavior; other tabs load lazily and use metadata/canvas graphics only.
- Live read-only discovery: both 127.0.0.1 and P20 192.168.0.7 answer HTTPS :19998 `/unico/v1/ucenter/device-list?clientType=8`, advertising P20 model 28944 and HTTP :8088. Thus the device itself supplies the discovery service without needing desktop PixelFlow. Filter to supported Pixelhue models and verify serials on connect; support a bounded LAN service search when no seed/service is known.
- Catalog/vendor contracts identify direct-device operations: node/general/beacon/genlock/mode; interface general/preset-thumb-timing/color-depth/color-space/hdcp/test-pattern; screen/create-empty-screen, crop-mosaic, base/general, thumb-timing, freeze/ftb/take/cut; layers/create/window/source/zorder/delete. Scope controls to advertised device capabilities and actual IDs; preserve unrelated data. Device-mode changes can restore configuration and need a deliberate explicit action, not autosave.
- Implement a usable first full-client foundation rather than claiming complete PixelFlow parity: device identity/setup, existing Inputs, output bulk setup, screen/output mapping, text-source programming with layer geometry/routing/stacking and transitions, and autosaved MVR. No live-preview stream APIs.

## What was done

Pending.

## What was verified

Initial source/discovery evidence above; implementation checks pending. Live production writes are not needed for automated development QA.
