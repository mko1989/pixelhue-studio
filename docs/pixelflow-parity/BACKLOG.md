# Parity implementation and acceptance checklist

[Reviewed feature list](README.md) is the source of scope. IDs below refer to the JSON/Markdown records. Full parity remains open; completing the audit or the first input controls does not close the client work.

| Order | Work package | Feature IDs / acceptance |
| --- | --- | --- |
| 1 | Inputs Advanced foundation | INPUTS-05/06/07/11: Mac compatibility, native tiled pairs, HDCP and advertised image quality. Offline verification plus browser checks; physical writes still require hardware QA. |
| 2 | Complete input setup | INPUTS-02/03/04/08/09/12/13/14/18: metadata, detailed EDID/file transfer, dependent colour/HDR constraints, keying/deinterlace/gain and card allocation. |
| 3 | Output and screen setup | OUTPUTS-02 through 09; SCREENS-02 through 13: spatial output assignment, detailed timing/format/HDR, HDCP ownership, patterns/colour, copy/split/backup, AOI/rotation/blending/bezel. |
| 4 | Programming inspector | PROGRAMMING-05 through 09 and 11 landed in WO-036 (opacity, flip, mono/invert, lock, border, mask, shadow, colour, crop; hardware QA pending). Remaining: layer freeze, keying, Cut & Fill, crop capacity pre-check, keyframe preview and supported 3D. |
| 5 | Programming workflow | PROGRAMMING-04/15/16/18 through 24: multiselect/clipboard, supported native composites, persistent source organization, gallery CRUD/capture/export, OSD, layer presets and playlists. Keep the GRP workaround labelled. |
| 6 | MVR completion | MVR-02 through 07: preserve ratio+UMD/no-overlap behavior; native templates, background/border/UMD editor, output mode/timing. |
| 7 | Device completion | DEVICE-01/03/05 through 25: sync/internal timing, network modes, backup pairs/device backup, HDR/effect sync, internal source/time/standby, diagnostics and installed card configuration. |
| 8 | Audio | AUDIO-01/02 done in WO-036 (hardware QA pending). AUDIO-04 screen audio is excluded by owner decision (routing only). AUDIO-03 Dante and AUDIO-05 input audio source remain conditional on other hardware. |
| 9 | Projects and maintenance | GLOBAL-01 through 09, GLOBAL-13/14: project/resource backup/restore, firmware/log tools, peripheral/controller/Companion integration, preferences/help/customization. |
| Conditional | LED/controller families | SCREENS-14 through 18, GLOBAL-10/11/12 and controller-only DEVICE fields: topology, receiving cards, calibration and monitor workflows only when model scope expands and hardware advertises support. |

For each package:

- Trace the **rendered control → handler → API payload** and feature/card/role/working-mode gates. Do not infer support from a returned default object or a route name.
- Preserve untouched nested fields and actual interface IDs; validate the entire requested batch before its first write. Respect resource assessments and destructive-change confirmations.
- Use compact rows, bulk edits and collapsed Advanced. Geometry sends should retain the existing low-latency queue/readback/reconciliation behavior.
- Test rejection/no partial writes, firmware ignoring a successful acknowledgement, changed connection/session, disabled ports and card-specific exclusions. Verify at least one appropriate hardware path when available and record what remains untested.
- Update the corresponding feature records with implementation evidence and WO verification. Regenerate reports. Keep `partial` until the listed controls and workflows are covered.

Live input-video rendering stays excluded by owner decision. All other missing/partial records remain tracked here; unsupported P20 features are conditional rather than silently declared implemented.
