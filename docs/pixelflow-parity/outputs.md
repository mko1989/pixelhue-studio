# PixelFlow outputs inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/outputs.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## OUTPUTS-01 · Physical output inventory

**Studio: implemented. Placement: Primary.**

Main/AUX/MVR role; name; connector type; slot; capacity; primary/backup.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-base-attr/index.tsx:59` in `index-CPe5AUX3.js.map`.

Studio: `public/outputs-ui.js`, `lib/studio-outputs.js`.

## OUTPUTS-02 · Output timing

**Studio: partial. Placement: Primary.**

Preset/custom width/height/frame; detailed timings; grouped connector timing; active-screen ownership.

Availability: Model, installed card, role and feature XML determine availability.

Studio offers standard presets from device resolution XML with capacity/scan/range filtering, preserves fractional Hz and standard/custom mode, and assesses bandwidth before writes. Screen/genlock changes need confirmation. Full detailed blanking/porch timing editing and grouped screen-owned timing workflows remain incomplete.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-base-attr/components/outputAttrSettingPanel/index.tsx:15` in `index-CPe5AUX3.js.map`.

Studio: `public/outputs-ui.js`, `lib/studio-outputs.js`, `lib/output-options.js`, `lib/output-capacity.js`.

## OUTPUTS-03 · Output format

**Studio: partial. Placement: Advanced.**

Bit depth; sampling; gamut; dynamic range; HDR parameters.

Availability: Model, installed card, role and feature XML determine availability.

Studio only edits bit depth.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-base-attr/OutputBaseField.tsx:19` in `index-CPe5AUX3.js.map`.

Studio: `public/outputs-ui.js`, `lib/studio-outputs.js`.

## OUTPUTS-04 · HDCP policy

**Studio: partial. Placement: Advanced.**

HDCP selection; connector/group modes; screen-owned restrictions.

Availability: Model, installed card, role and feature XML determine availability.

Studio enable switch preserves version; complete version/group policy is missing.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-base-attr/components/hdcpPanel/index.tsx:13` in `index-CPe5AUX3.js.map`.

Studio: `public/outputs-ui.js`, `lib/studio-outputs.js`.

## OUTPUTS-05 · Output colour correction

**Studio: missing. Placement: Advanced.**

Colour temperature; RGB brightness/contrast; hue; saturation; reset.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-output-attr/index.tsx:37` in `index-CPe5AUX3.js.map`.

## OUTPUTS-06 · Output test pattern

**Studio: partial. Placement: Advanced.**

Enable; pattern type; brightness; grid spacing/width; motion.

Availability: Feature XML VideoInterfaceTestPattern; Support=0 on the live P20, where PixelFlow hides the whole section.

Studio toggles existing pattern only; preserves its parameters.

PixelFlow: `src/pages/devices/components/output-attr-panel/index.tsx:73` in `index-CPe5AUX3.js.map`.

Studio: `public/outputs-ui.js`, `lib/studio-outputs.js`.

## OUTPUTS-07 · Copy/split and backup

**Studio: partial. Placement: Advanced.**

Select connector copies; independent/copy/split; optical backup.

Availability: Model, installed card, role and feature XML determine availability.

P20 DL/4K capacity changes now apply the working-mode-specific XML copy topology after assessment and confirmation; copy timing readouts follow the primary. Manual copy/split/backup editing and other models remain missing.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-mode-setting/index.tsx:22` in `index-CPe5AUX3.js.map`.

Studio: `lib/output-capacity.js`, `lib/output-options.js`, `public/outputs-ui.js`.

## OUTPUTS-08 · Optical module mode

**Studio: missing. Placement: Advanced.**

Default/single-mode/multimode/custom parameters.

Availability: Optical output module support.

PixelFlow: `src/pages/devices/components/output-attr-panel/optModeSetting/index.tsx:15` in `index-CPe5AUX3.js.map`.

## OUTPUTS-09 · ST2110 outputs

**Studio: missing. Placement: Advanced.**

Stream settings; SDP loading; source/destination; primary/backup networking.

Availability: Installed ST2110 output card; screen ownership restriction.

PixelFlow: `src/pages/devices/components/output-attr-panel/st2110-output-attr/OutputNewVideoAttr/index.tsx:26` in `index-CPe5AUX3.js.map`.

## OUTPUTS-10 · Rotation placeholder

**Studio: not-rendered. Placement: None.**

Commented output advanced rotation panel.

Availability: Model, installed card, role and feature XML determine availability.

This particular panel is commented out. Screen connector rotation is a separate working feature and is included under Screens.

PixelFlow: `src/pages/devices/components/output-attr-panel/output-advanced-attr/index.tsx:13` in `index-CPe5AUX3.js.map`.
