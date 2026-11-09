# P20 MVR hardware QA

Offline and mock checks are recorded in [WO-001](work-orders/001_WO_mvr-editor.md). Run these with the intended device/firmware:

- [ ] Start `pixelhue-studio` with Node 22+ and connect using the P20 IP.
- [ ] Confirm the displayed serial and MVR output dimensions match the device.
- [ ] Confirm all existing MVR windows appear, and no PGM/PVW layers are listed.
- [ ] Move one MVR window, Apply, and confirm both device readback and the physical multiviewer output.
- [ ] Resize an input MVR window and an output MVR window separately. Record firmware restrictions.
- [ ] Try overlap within the output. Confirm movement/resizing/import is blocked with a visible explanation, and Apply also rejects overlapping geometry (WO-006).
- [ ] Save a known layout, move a window, load the saved layout, Apply, and confirm restoration.
- [ ] Change layout in PixelFlow, then Refresh. Confirm the editor reflects the new window IDs.
- [ ] Record P20 firmware version and accepted/rejected geometry in WO-001.

## Inputs creator and IP discovery (WO-002)

- [ ] Restart the Node process and reload the browser. Enter only the P20 IP while another NovaStar device is present; confirm the P20 serial is selected automatically.
- [ ] Open Inputs creator. Verify Inputs 1–12: eight HDMI/DP inputs and four SDI inputs, with capacities, names and signal data matching PixelFlow. Missing cards should be omitted. EDID controls should appear only on HDMI/DP rows.
- [ ] Change one logical input from HDMI to DP. Apply; confirm its HDMI partner is disabled and other inputs/MVR/AUX/output modes stay unchanged.
- [ ] Change capacity on one input. Check resource assessment rejection when limits would be exceeded; verify accepted configuration physically.
- [ ] Select multiple inputs, set a name pattern and EDID preset, Fill selected, then Apply inputs. Confirm staged settings do not write until Apply.
- [ ] Verify fractional EDID frame rates (59.94 Hz), names, and source renegotiation on physical inputs.
- [ ] Verify imported EDID files/detailed timings remain unchanged when only changing names.
- [ ] Record firmware compatibility and any device-reported errors in WO-002.
- [ ] Bulk-edit all 12 inputs including SDI names/capacities. Verify SDI routing and optical ports remain unchanged, and bulk EDID settings only affect HDMI/DP inputs (WO-003).

## Multi-model setup and top bar (WO-004)

- [ ] Verify address, Connect button, connection options, detected model and serial are all in the top bar on desktop/tablet.
- [ ] Connect by IP to P10 and P80. Confirm the detected model/serial and initial Device tab; Multiviewer must be disabled.
- [ ] Verify P10 lists four HDMI/DP and two SDI inputs. Bulk-apply names, capacities and HDMI/DP EDIDs; check source acquisition and unchanged output/optical connectors.
- [ ] Verify P80 lists actual installed input connectors, including their correct port types and capacities. Check output/MVR interfaces are absent and fixed physical ports cannot be switched by bulk HDMI/DP choice.
- [ ] Apply P80 names, supported capacities and EDIDs. Verify device-managed capacities and SDI/no-EDID connectors stay intact. Record card models and firmware tested.
- [ ] Reconnect to P20. Confirm its Multiviewer tab and all twelve inputs remain usable.

## Capacity policy and distributions (WO-005)

- [ ] Verify row/bulk capacity choices against physical devices: P20 DL/4K, P10 SL/4K, P80 4K only.
- [ ] Verify device-managed current values remain unchanged during name/EDID changes.
- [ ] Extract and run the matching package on Intel Mac, Apple Silicon Mac, Windows x64 and Ubuntu x64. Confirm browser opening, connection, Apply/readback, and Ctrl+C shutdown.
- [ ] On each target OS, verify runtime access to the device's discovery/API ports and record OS/firmware/card versions tested.

## MVR input ratios and overlap prevention (WO-006)

- [ ] Connect 16:9, 4:3 and portrait inputs with known actual timings. In MVR, run Fix aspect ratios and verify only connected direct-input windows change/lock.
- [ ] Confirm disconnected inputs and PGM/PVW windows remain unchanged even when stale EDID/timing values exist.
- [ ] Apply and verify geometry plus native aspect locks on the P20 and physical multiviewer output. Confirm firmware accepts the aspect-ratio endpoint and fitted input sizes.
- [ ] Resize corrected windows using corner handles and numeric fields; confirm the source ratio persists and neighbours never overlap. Confirm each window has its own lock.
- [ ] Test Undo/Redo, save/load, and Refresh after Apply for ratio-lock persistence.
- [ ] Test a cramped minimum-size window: find free placement or report insufficient room without overlapping. Confirm new locks require a connected input and resizing a connected input with stale timing requires rerunning the fix; position-only edits to existing locks stay possible (WO-007).

## Repeated Apply and established source locks (WO-007)

- [ ] Disconnect an input after applying its source-ratio lock. Move and resize its MVR window with the retained ratio; confirm Apply still updates the P20. New source locks must still require a connected input.
- [ ] Move/resize a PGM/PVW MVR window that already has a native source-ratio lock. Run Fix aspect ratios and confirm these windows stay editable and retain their locks.
- [ ] Apply multiple edits with Save layout between them. Confirm the physical output follows every Apply and saving changes no device settings.
- [ ] Change a connected input from 16:9 to 4:3. Confirm position-only moves remain possible before correction; rerun Fix aspect ratios and Apply to update its size. Confirm resizing with stale source-ratio metadata still produces an actionable error.

## Rewir interface and portable font delivery (WO-008)

- [ ] Launch v1.3.0 on each target OS without Rewir installed and without internet access. Verify the font displays in both tabs, controls and numeric fields.
- [ ] Check desktop/tablet fit, input-table scrolling/sticky headers, readable signal metadata and visible Apply controls. On a phone, check the stacked MVR properties and horizontal input-table scrolling.
- [ ] Confirm real-device connection, MVR editing/Apply/Save and bulk input settings work with the simplified labels and styling.

## Q8 support (WO-009)

- [x] Local PixelFlow simulator: IP-only discovery at 127.0.0.1, Q8 identity, two MVR outputs and installed-card input enumeration (72 ports in the tested configuration).
- [x] Simulator: HDMI name/EDID and SDI name changes, readback, and restoration of original settings and card modes.
- [x] Simulator: temporary MVR windows on both outputs, repeated geometry Apply/native aspect locks; Chrome Save/Apply cycles and restoration of the original empty layout.
- [x] Chrome: 72 input rows, fixed Q8 capacity/port selectors, no SDI EDID controls, input Apply/readback, desktop/mobile fit and no page errors.
- [ ] Physical Q8: confirm installed card/port labels, reported capacities, name/EDID acquisition and both physical MVR outputs. Record firmware/card versions and any geometry restrictions.

## Screen sources and UMD compensation (WO-010)

- [x] Read P20 device XML: OccupyHeight and input/PGM/PVW VWidth all report 24 output pixels. Stage and save the live corrected layout without Apply; verify device state remains unchanged.
- [x] Automated/API/browser: input and Screen 1/2/3 PGM/PVW corrections, UMD on/off, fixed strip height during resize, complete-window collision prevention, Undo/Redo, Save/Load and repeated Apply/readback.
- [ ] Physical P20/Q8: run Fix aspect ratios and Apply; confirm input and screen video areas keep their actual ratio above the label strip, including wide/portrait screens. Verify native Custom locks retain compensated geometry on hardware.
- [ ] Toggle UMD in PixelFlow, Refresh, rerun Fix, and Apply. Confirm a disabled strip adds zero and an enabled strip uses the reported device height.


## Full client and automatic MVR saves (WO-014)

This section supersedes manual MVR Apply instructions above for v1.6.0-alpha.1; other setup panels still use explicit Apply/Save.

- [x] Offline 98 tests; Chrome mock workflows across all six tabs and mobile fit, with zero live-video endpoint requests.
- [x] Live P20 read-only native discovery, capability setup, Inputs/Outputs/Screens/Programming/MVR loading; no physical writes performed.
- [x] Mock/browser: MVR numeric edits, drag completion, edits during saves, uncommitted typing, rejection/retry, Undo/Redo and UMD-aware input/PGM/PVW fix plus Save/Load automatically reach readback.
- [ ] Physical P20/Q8: move/resize repeatedly and verify the MVR output after release, without an Apply click; repeat with Fix, Undo/Redo and layout import. Save alone must not write.
- [ ] With PixelFlow closed, Find devices / Scan LAN on the actual subnet, select a device, then switch devices and confirm stale sessions cannot write.
- [ ] Each intended model/firmware: validate advertised Device controls and physical genlock/beacon/name behavior. Only test work-mode/profile resets on a backed-up configuration.
- [ ] Physical outputs: verify names, primary custom timing, depth, HDCP and pattern toggling; copy ports keep timing/routing and other settings.
- [ ] Physical screens: create Main/AUX, map/unmap outputs, set global origin/dimensions, tile outputs and verify physical mapping/freeze/blackout/deletion.
- [ ] Physical programming: create PVW layers, route inputs/other screens, drag/resize, stack/delete; verify Take/Cut duration and swap/copy behavior on physical outputs and MVR.
- [ ] Run alpha portable builds on Apple Silicon, Windows and Ubuntu; Intel Mac launcher is checked locally during distribution verification.
