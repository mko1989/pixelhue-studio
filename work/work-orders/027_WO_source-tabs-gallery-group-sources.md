# WO-027 — Source tabs like PixelFlow (Inputs, Screens, Groups, Backgrounds, Logos), graphics upload, group sources

**Status: DONE (2026-11-09; 128 offline tests, mock Chrome, live P20 gallery read + Screen-3 background on/off restored; device upload and logo placement are owner QA)**

Owner (2026-11-09): "the created group should be available as source in the programming sources list. and the sources should be split into tabs like in pixelflow inputs, screens, backgrounds, also ability to upload graphics. the main idea is same functionality as pixelflow. no bullshit"

## Investigation FIRST
- **PixelFlow source tabs** (`editor1/components/SourcePanel/components/SoureListPanel.tsx:116-240`) come from the device XML:
  - Input always; Screen when PGM is supported (switchers);
  - Gallery when `Features.Pictures.Support` with picture types;
  - Text OSD when the OSD layer config supports it;
  - **Bkg** when `layer_16.xml Window.Support`; **LogoPicture** when the LOGO picture type is supported;
  - LiveBKG under Bkg when the screen has `Features.LiveBKG` (absent on P20, WO-025).
- **Live P20 feature.xml `Pictures Support=1`:**
  - type 1 BKG (≤ 65535 px) and type 2 LOGO (≤ 512×512) supported; 3 OSD not;
  - storage 512 MB / 255 pictures; product limit 7680×4320.
  - Layers: `layer_16` BKG, `layer_32` LOGO, 128/256 Cut/Fill.
- **Gallery API (live, read-only):**
  - `GET picture/list?type=1|2` returns `{pictureId, pictureObj{type}, general{name, width, height}, path[{type 0 thumb jpg | 1 bmp, url}]}`. 15 BKG pictures, 0 LOGO; `picture/capacity` 115.8/512 MB; `picture/progress {percent, pictureId, type, status}`.
  - Thumbnails are served from the device web root: `GET http://P20:8088/picture/bkg/<file>.jpg` → 200 image/jpeg (also `picture/export?pictureId&pictureType=0&type=1`).
  - Upload (`api/picture/picture.ts:55`, `gallery-source-list-panel/gallery.ts:264`): `PUT picture/import` multipart with `pictureFile` plus `description` = JSON `{type:1, pictureObj:{type}, general:{name, width, height}}` (LOGO size clamped to 512), 300 s timeout, then progress polling.
- **Background use:** each screen has a BKG layer (type 16) per scene (live: Screens 1, 2, 3 PGM/PVW, all `enable 0`; Screen 1's points at picture 3 "led-grid", `sourceType 5`). PixelFlow `bkgLayerReplaceSource` writes `layers/source {general:{sourceId: pictureId, sourceType: 5 BKG}}`. Enable/disable goes through `/ucenter/layers/switch [{layerId, enable, sn}]` (PixelFlow desktop); the commented device route is `layers/switch`.
- **Logo use** (`layerCreateHandle.ts:140`): one LOGO layer (type 32) per screen scene; an existing one is deleted, then a layer is created with `sourceType 6 (Logo)`.
- **Group sources:** WO-025 groups exist only as placed layer pairs; nothing lists a reusable "group" source. A group source (A, B, layout) is app data, not device data. It is persisted per device serial outside the repo (`~/.pixelhue-studio/group-sources.json`, overridable with `PIXELHUE_STUDIO_DATA`), so git and Syncthing never see server-written files. Groups already placed on the device (`GRP<n>` layer pairs) are offered too.

## What was done
- `public/source-tabs.js` (new): the Sources column has tabs **Inputs | Screens | Groups | Backgrounds | Logos**. Backgrounds/Logos appear only when the gallery advertises the picture type (P20: both). Drag keys: `type:id`, `g:<id>`, `b:<pictureId>`, `l:<pictureId>`.
  - **Groups** lists saved group sources plus groups already on screen. "New group…" saves a source (A, B, layout, name) and ✕ removes it. Dragging a group places it as a group (WO-025) centred on the drop point at combined native size; double-click places it in PVW.
  - **Backgrounds/Logos** show device thumbnails, an upload button (PNG/JPEG/BMP; size read in the browser) and capacity used. A background dropped anywhere on a stage becomes that screen scene's BKG and is switched on. A logo is placed at native size centred on the drop point, replacing the scene's logo.
- `lib/gallery.js` (new):
  - `gallerySupport` (feature.xml `Pictures` types and max sizes) and `readGallery` (`picture/list?type=1|2`, `picture/capacity`);
  - `uploadPicture`: validates type/mime/name/size, builds multipart (`pictureFile` + `description` JSON as PixelFlow, LOGO clamped to the max), `PUT picture/import` with a 300 s timeout, then waits up to 60 s for the new picture;
  - `streamThumb` proxies the device's web-root thumbnail (path-checked).
- `lib/pixelhue.js` `requestJson` sends Buffer bodies with their own content type.
- `server.js`: `GET /api/gallery`, `GET /api/gallery/thumb` and `PUT /api/gallery/upload` (raw body ≤ 64 MB), all session-guarded and serialised.
- `lib/bkg-logo.js` (new): `readBackgrounds` (type-16 layer per screen scene); `applyBkg` (`layers/source {sourceType 5}` + `layers/switch [{layerId, enable, sn}]`, verified); `applyLogo` (deletes the scene's type-32 layer, creates a new one with `sourceType 6`, native size, locked). LOGO layers are now normal editable program layers. PGM lock covers bkg/logo.
- `lib/group-sources.js` (new): per-serial JSON in `$PIXELHUE_STUDIO_DATA` or `~/.pixelhue-studio` (outside git/Syncthing, atomic write). Device groups (`GRP` pairs) are listed too.
- `public/program-stage.js` draws the enabled background thumbnail inside the screen frame. Each cell header has a **BKG on/off** chip when the scene has a background picture.
- Mock: Pictures XML, `picture/list|capacity|import` (multipart parsed), web-root thumbnails, BKG layers, `layers/switch`, picture names on source.
- Tests: `test/gallery-sources.test.js` (5; in CI FILES), using a temp `PIXELHUE_STUDIO_DATA`. The browser QA script also uses a temp data dir; it had written `P20-MOCK` entries to `~/.pixelhue-studio`, which were removed.

## What was VERIFIED
- `npm test` **128/128**:
  - gallery support and listing; multipart contract (content type, description, LOGO clamp, filename sanitising); bad type/mime rejected with zero writes;
  - BKG source + switch bodies, readback and off, error paths with zero writes;
  - logo placement, replacement and move;
  - group-source save/list/delete persisted to the data dir, plus listing a placed device group;
  - HTTP routes: session guard, thumbnail proxy, raw upload.
- Mock Chrome full flow:
  - Groups tab: save "Wide pair", drag it onto PVW, then align, resize and ungroup;
  - Backgrounds tab: thumbnail, drag sets the BKG (layer 904 on, picture 1), BKG chip turns it off;
  - Logos tab: real file upload through the file chooser, then drag to place;
  - plus all earlier flows and 390px mobile.
- **Live P20:**
  - gallery support `{bkg ≤ 65535, logo ≤ 512}`, 15 pictures, thumbnails served (200 image/jpeg);
  - **Screen 3 PVW background set to "In 1-1-Capture3" and switched on, read back as on, then off**, which proves the device `layers/switch` route;
  - restored to empty source and off, identical to before.
- Not run on hardware: uploading to the device gallery and placing a logo (both write the shared gallery). Owner QA.
