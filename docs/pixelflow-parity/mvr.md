# PixelFlow mvr inventory

[Audit overview](README.md) · Reviewed records: [JSON](features/mvr.json)

Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.

## MVR-01 · Window/source editor

**Studio: implemented. Placement: Primary.**

Inputs; screen PGM/PVW and layers by support; create/drop; move/resize; delete; source switching.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/mvr/components/MVRSourceList.tsx:49` in `index-CFxZFQwf.js.map`.

Studio: `public/editor.js`, `public/mvr-sources.js`, `lib/mvr-layers.js`.

## MVR-02 · Aspect and signal geometry

**Studio: partial. Placement: Primary.**

Aspect modes; lock; source-driven ratio; no overlap/bounds; window minimum and input-window count limits.

Availability: Model, installed card, role and feature XML determine availability.

Studio fixes connected input/screen ratio with configured UMD height and locks dropped sources; complete PixelFlow mode picker is missing. Replacement drops keep X/Y and fit the video plus actual UMD strip inside the previous full window bounds.

PixelFlow: `src/pages/mvr/components/MVRAttr.tsx:44` in `index-CFxZFQwf.js.map`.

Studio: `public/mvr-geometry.js`, `lib/mvr-signals.js`, `lib/mvr-umd.js`, `lib/source-aspect.js`.

## MVR-03 · Native grid/templates

**Studio: partial. Placement: Primary.**

Grid/snap settings; add template; auto arrange; edit/delete template; delete all; zoom/fit; clear content.

Availability: Built-in templates via layers/template; custom templates need CustomMVRTemplate, Support=0 on the live P20.

Studio local layout save/load, clear and canvas editor are not the native device template library.

PixelFlow: `src/pages/mvr/components/MVRToolbar.tsx:54` in `index-CFxZFQwf.js.map`.

Studio: `public/editor.js`, `public/app.js`.

## MVR-04 · Background

**Studio: missing. Placement: Advanced.**

MVR background colour; reset.

Availability: MVR screen XML BackgroundColor; Support=0 in the live P20 screen_8.xml, so PixelFlow does not show it there.

PixelFlow: `src/pages/mvr/components/MVR-attr-bg/index.tsx:20` in `index-CFxZFQwf.js.map`.

## MVR-05 · Window border

**Studio: missing. Placement: Advanced.**

Border width/height; colour; enable/style.

Availability: Hidden by PixelFlow on N/P series including the P20 (MVRAttr.tsx:453, N_DEVICE_LIST). Q8/P80 only.

PixelFlow: `src/pages/mvr/components/MVR-attr-border/index.tsx:24` in `index-CFxZFQwf.js.map`.

## MVR-06 · UMD

**Studio: partial. Placement: Advanced.**

Enable; text/source labels; position/style; colours; field support.

Availability: The UMD enable/colour editor is hidden by PixelFlow on N/P series including the P20 (MVRAttr.tsx:453). Q8/P80 only.

Studio accounts for reported UMD height in sizing; no UMD styling/editor yet.

PixelFlow: `src/pages/mvr/components/MVR-attr-umd/index.tsx:19` in `index-CFxZFQwf.js.map`.

Studio: `lib/mvr-umd.js`.

## MVR-07 · MVR output setup

**Studio: missing. Placement: Advanced.**

Connector independent/copy; resolution/frame; aspect policy; delete-window warnings.

Availability: Model, installed card, role and feature XML determine availability.

PixelFlow: `src/pages/devices/components/device-info/mvr-attr/index.tsx:55` in `index-CPe5AUX3.js.map`.
