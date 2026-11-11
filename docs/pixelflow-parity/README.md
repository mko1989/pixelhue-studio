# PixelFlow → Studio feature inventory

Audit of the local `extracted-source` snapshot, 10 November 2026, reviewed again on 11 November 2026 (WO-036). **123 reviewed feature groups** (19 implemented, 38 partial, 63 missing, 2 excluded, 1 not rendered), backed by **3,097 unique application source files in 79 source maps**. No conflicting source variants or parser errors. This is the parity checklist; Studio does **not** have full PixelFlow functionality yet.

| Studio area | Inventory | Groups | Main remaining work |
| --- | --- | ---: | --- |
| Device | [Device](device.md) | 25 | Full sync/internal timing, source/device backups, diagnostics, clock, standby, internal sources, card-specific setup |
| Inputs | [Inputs](inputs.md) | 18 | Detailed EDID/file import/export, full HDR metadata, keying, deinterlace allocation, gain, optical/IP/ST2110 |
| Outputs | [Outputs](outputs.md) | 10 | Detailed timing, format/HDR, correction, full patterns, copy/split/backup, optical/IP |
| Screens | [Screens](screens.md) | 18 | Spatial mosaic editor, groups, detailed timing/HDR, AOI, rotation, blending, bezel compensation, patterns |
| Programming | [Programming](programming.md) | 26 | Layer freeze, keying/Cut & Fill, crop capacity checks, motion, clipboard/multiselect, native composites, OSD, gallery management, layer presets/playlists |
| MVR | [MVR](mvr.md) | 7 | Native templates, background/border/UMD editor, connector setup |
| Audio | [Audio](audio.md) | 5 | Matrix, mute and test tone are implemented (WO-036). Screen audio is excluded by owner decision (routing only). Remaining: input audio source and Dante, neither offered by PixelFlow on the P20 |
| Global tools | [Projects, maintenance, peripherals](global.md) | 14 | Project/resource files, firmware/log management, peripheral/controller integrations |

PixelFlow's P/Q menu (`src/config/topMenu.ts`, `NPQD_MENUS`) is **Device → Screens → Edit → MVR → Audio Matrix**. Inputs and Outputs are Device subpanels; Studio keeps the requested **Device → Inputs → Outputs → Screens → Programming → MVR** order. Studio's Audio tab appears only when the connected device advertises the matrix. Global tools live in menus rather than main tabs.

LED cabinets, receiving-card topology, calibration, monitoring and controller-panel setup occur in the same build but belong to other product families. They are recorded with gates, not treated as controls every P20 should show. Static source presence does not prove firmware support. “Implemented” describes the listed Studio controls; “partial” identifies a narrower implementation. Native hardware remains the final authority for resource limits.

New input controls are in a **collapsed Advanced section**: per-input and bulk Mac compatibility, native Mac 1×2 tiled pairs (left/right, groups 1–16), input HDCP, advertised colour overrides and image-quality fields. XML determines editable fields and ranges; sparse card overrides inherit unspecified connector settings while explicit unsupported fields stay hidden. Native Mac groups are separate from Programming GRP pairs, network source groups and native composite/mosaic sources.

The intentional functional exclusions are **live input video preview** (owner: use MVR) and **screen audio** volume/mute/source (owner, 2026-11-11: only audio routing is wanted). Signal metadata, stream configuration, gallery stills, native Live BKG and composite sources remain in scope when hardware supports them. Commented-out output-rotation UI is marked `not-rendered`; working screen connector rotation is recorded separately.

## What PixelFlow itself hides on a P20

Checked against the live P20 XML in WO-036. These groups stay in the inventory for other models, but they are not gaps on the owner's P20 because PixelFlow does not show them there: MVR window border and UMD editor (N/P series), MVR background (`screen_8.xml` BackgroundColor Support=0), custom MVR templates, output test-pattern section (`VideoInterfaceTestPattern` Support=0), fan mode, HDR conversion switch, display-effect sync, no-signal layer colour, standby, Dante, and every LED/controller, ST2110/IP, optical-module, COM/IPC and KVM group.

Still shown by PixelFlow on a P20 and not yet in Studio (after WO-037): one-switch global HDCP, output HDR/dynamic range, detailed EDID/timing editing, screen patterns/AOI/blending groups, layer freeze, keying and Cut & Fill, layer presets, preset playlists, OSD, gallery management, project import/export and firmware/log tools.

## Compact UI rule

Primary controls occupy dense rows and the main canvas. Selection-specific controls use a narrow inspector. Infrequent controls sit in collapsed **Advanced** sections, grouped by signal, image, routing and maintenance. Use bulk edits wherever the firmware supports batches. Hide unsupported settings using the connected device/card/role/working mode XML; show existing values without silently resetting nested parameters. Apply geometry promptly and verify actual device readback. No empty controls, duplicated app titles or large informational cards.

## Search and evidence

The reviewed machine-readable records are in [`features/`](features/) with stable IDs, control lists, Studio status/evidence, availability and intended placement. The [source census](census/index.json) has per-module hashes, original paths/line numbers, English labels, JSX controls, imported APIs and candidate gating expressions. Shared business components can supply additional nested controls; the reviewed groups describe these rather than counting every JSX node as a feature. Comments are excluded from parsed controls. Counts are groups/references, not a claim of 123 independent API endpoints.

```sh
# Find a feature/gap directly; no dependency installation needed.
rg -ni 'mac|mosaic|backup|cut.fill' docs/pixelflow-parity/features
node tools/audit/query.mjs inputs mac
node tools/audit/source.mjs src/components/common/compatibility-mode/index.tsx 1 120
# Source reader checks the extracted text against its audited SHA-256.
```

API payloads and route search are in the existing [Node API library](../../api-library/README.md). A defined API alone does not mean a UI feature is implemented. Inspect the source call site and connected hardware configuration before adding writes.

## Regenerate and validate

```sh
# Babel is an audit-time dependency only, never a Studio runtime dependency.
npm --prefix api-library install --ignore-scripts
node tools/audit/pixelflow.mjs --parser=api-library/node_modules/@babel/parser/lib/index.js
node tools/audit/report.mjs
node --test test/pixelflow-audit.test.js
```

Census extraction is reproducible from the local source maps. `features/*.json` are manually reviewed; changing the snapshot requires re-review of these records. The census includes all 3,097 application sources; UI evidence is organized by module and also indexed for shared components. It does not run PixelFlow, enumerate every runtime combination, or replace device testing.

[Implementation sequence and acceptance checklist](BACKLOG.md) · [Work order WO-032](../../work/work-orders/032_WO_pixelflow-feature-audit.md) · [Programming parity WO-017](../../work/work-orders/017_WO_pixelflow-programming-parity.md)
