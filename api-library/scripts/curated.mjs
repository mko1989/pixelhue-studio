const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const integer = { type: 'integer' };
const array = (items) => ({ type: 'array', items });
const window = object({ x: integer, y: integer, width: integer, height: integer });
const operation = (method, path, summary, tags, extra = {}) => ({ method, path: '/unico/v1/' + path, summary, tags, ...extra });

export const curated = [
  operation('GET', 'ucenter/device-list', 'Discover devices and their advertised API ports', ['discovery', 'IP', 'serial', 'models'],
    { serverKind: 'discovery', authentication: 'none', defaultPort: 19998, protocol: 'https',
      notes: ['Discovery uses a self-signed certificate. Match the entered host and verify the SN through open-detail; do not redirect to unrelated devices.'],
      queryExample: { clientType: 8 } }),
  operation('GET', 'node/open-detail', 'Read device serial and startup time for authentication', ['authentication', 'JWT', 'serial', 'startTime'],
    { authentication: 'none', queryExample: { nodeId: 1 } }),
  operation('GET', 'node/detail', 'Read node identity, model and configuration metadata', ['device', 'model', 'firmware'], { queryExample: { nodeId: 1 } }),
  operation('GET', 'node/config-file', 'Read device XML configuration and capabilities', ['XML', 'UMD', 'height', 'capabilities', '24px'],
    { queryExample: { nodeId: 1, para: 0 }, responseType: 'text',
      notes: ['The result can exceed 8 MB. Parse feature.xml UMD OccupyHeight and layer_8.xml UMD Borders VWidth by source type. The checked P20 reports 24 pixels; other devices must be read rather than assumed.'] }),
  operation('GET', 'screen/list-detail', 'Read screen IDs, dimensions, MVR outputs and PGM/PVW sources', ['screen', 'resolution', 'multiviewer', 'PGM', 'PVW'],
    { notes: ['MVR screen type is 8. Resolve screen sourceId against screenId, separately from input interfaceId. Source dimensions use mosaic.window; disabled physical outputs can still have valid preview dimensions.'] }),
  operation('GET', 'layers/list-detail', 'Read layers, windows, source identities, UMD and aspect locks', ['layer', 'window', 'MVR', 'geometry', 'UMD'],
    { queryExample: { attachScreenId: 7 }, notes: ['Filter MVR membership by layerIdObj.attachScreenId. source.general.sourceType: input=2, PGM=3, PVW=4.'] }),
  operation('PUT', 'layers/window', 'Move and resize layer windows in pixels', ['position', 'resize', 'window', 'geometry', 'MVR'],
    { requestSchema: array(object({ layerId: integer, window })),
      exampleBody: [{ layerId: 10, window: { x: 0, y: 0, width: 640, height: 384 } }],
      notes: ['Example IDs must be replaced from device readback. For 16:9 video and an enabled 24 px UMD strip, 640×384 contains 640×360 video. Studio checks complete rectangles for overlap and output bounds, and verifies readback.'] }),
  operation('PUT', 'layers/aspect-ratio', 'Set native layer aspect mode and lock', ['ratio', 'aspect', 'lock', 'MVR'],
    { requestSchema: array(object({ layerId: integer, aspectRatio: { enum: [5, 8] }, locked: { enum: [0, 1] } })),
      exampleBody: [{ layerId: 10, aspectRatio: 5, locked: 1 }],
      notes: ['5=Custom, 8=Original. UMD-aware resizing needs content height = window.height minus the detected UMD height; a plain outer-rectangle ratio is insufficient. Studio uses Custom for compensated geometry.'] }),
  operation('PUT', 'layers/umd', 'Set layer under-monitor display labels and appearance', ['UMD', 'label', 'caption', 'tally'],
    { notes: ['Consult IMVRLayerUMDRequestType and source observations for exact field casing. Companion sends UMD; vendor DTOs may use umd. Do not assume these spellings are interchangeable.'] }),
  operation('PUT', 'layers/source', 'Assign an input, PGM or PVW screen source to a layer', ['source', 'routing', 'input', 'screen'],
    { exampleBody: [{ layerId: 10, source: { general: { sourceId: 1, sourceType: 3 } } }] }),
  operation('GET', 'interface/list-detail', 'Read connectors, input signals, timing, names and EDIDs', ['input', 'port', 'connector', 'EDID', 'signal', 'resolution'],
    { notes: ['Input interface role is auxiliaryInfo.connectorInfo.interfaceType=2. Use actualTiming for connected-input ratios, not preset EDID. Raw connected state values are 1–4; disabled/offline connectors remain ineligible.'] }),
  operation('PUT', 'interface/general', 'Set input or connector names', ['name', 'rename', 'input', 'connector'],
    { requestSchema: array(object({ interfaceId: integer, general: object({ name: { type: 'string' } }) })),
      exampleBody: [{ interfaceId: 1, general: { name: 'Camera 1' } }], notes: ['Studio enforces 1–32 UTF-8 bytes for names, following PixelFlow.'] }),
  operation('PUT', 'interface/preset-thumb-timing', 'Set a connector EDID preset timing', ['EDID', 'resolution', 'frame rate', 'input', 'HDMI', 'DP'],
    { requestSchema: array(object({ interfaceId: integer, presetThumbTiming: object({ width: integer, height: integer,
      frame: { type: 'number' }, standardType: integer, interlaced: { enum: [0, 1] }, timingSelect: { const: 0 } }) })),
      exampleBody: [{ interfaceId: 1, presetThumbTiming: { width: 1920, height: 1080, frame: 59.94, standardType: 6, interlaced: 0, timingSelect: 0 } }],
      notes: ['frame is Hz, including fractional rates. Vendor code uses interlaced=0 for progressive; the manual contains conflicting wording. SDI does not use EDID. Detailed/file EDIDs should be retained unless explicitly replaced.'] }),
  operation('GET', 'node/subcard/mode', 'Read installed input cards, connectors, capacities and port modes', ['card', 'slot', 'capacity', 'HDMI', 'DP', 'SDI'],
    { queryExample: { nodeId: 1, startSlotId: 0, endSlotId: 100 },
      notes: ['Join actual card connectors to reported input interfaces. Placeholder cards, missing interfaces and output/MVR connectors must not become invented inputs.'] }),
  operation('PUT', 'system/auxiliary/assess/subcard-mode', 'Assess card resources before changing ports or capacity', ['assessment', 'bandwidth', 'capacity', 'resources'],
    { notes: ['Use the same subcard mode payload as the intended node/subcard/mode write. Nonzero assessment states are rejected by Studio before writing.'] }),
  operation('PUT', 'node/subcard/mode', 'Change connector work mode or capacity', ['capacity', 'port', 'card', 'routing', 'SL', 'DL', '4K'],
    { notes: ['Assess first. Preserve unrelated connectors and copyInfo. Interface IDs can change after mode changes; refresh them before name/EDID writes. Studio policy: P20 DL/4K, P10 SL/4K, P80 4K; Q8 capacities remain device-reported/read-only. This is app policy, not a universal firmware capability guarantee.'] }),
];

export const auth = {
  basePath: '/unico/v1', deviceProtocol: 'http', defaultDevicePort: 8088,
  flow: ['Discover the advertised HTTP port or provide apiPort explicitly.', 'GET node/open-detail returns sn and startTime.',
    'Sign HS256 JWT payload {SN: sn}, secret String(startTime), without iat/exp.', 'Send the raw JWT in Authorization, without a Bearer prefix.'],
  alternative: 'POST system/auth/login is documented by the manual; it is a separate username/password flow.',
  response: { successCodes: [0, 200], envelope: ['code', 'message', 'data'], textException: 'node/config-file returns XML' },
  modelIds: { P10: 28945, P20: 28944, Q8: 29974, P80: 30006 },
  source: ['Companion src/services/ApiClient.ts', 'Companion src/utils/utils.ts', 'Studio lib/pixelhue.js', 'Manual pages 4–5'],
};

export const enums = {
  sourceType: { 0: 'Empty', 1: 'No source', 2: 'Input', 3: 'PGM screen', 4: 'PVW screen', 5: 'BKG image', 6: 'LOGO image',
    7: 'IPC', 8: 'Cropped source', 9: 'Mosaic source', 10: 'IPC mosaic screen', 11: 'Internal source', 12: 'Internal shape',
    13: 'USB drive', 14: 'Image OSD', 15: 'Text OSD', 16: 'Volume unit meter' },
  aspectRatio: { 5: 'Custom', 8: 'Original' }, capacity: { 0: 'SL', 1: 'DL', 2: '4K', 65535: 'Auto (manual context)' },
  layerType: { 2: 'Normal', 4: 'AUX', 8: 'MVR', 16: 'BKG', 32: 'LOGO' },
  sceneType: { 1: 'Neither PGM nor PVW', 2: 'PGM', 4: 'PVW' },
  timingStandard: { 0: 'Custom', 1: 'DMT', 2: 'CVT', 3: 'CVT-RB v1', 4: 'CVT-RB v2', 5: 'CVT-RB v3', 6: 'CEA', 7: 'SMPTE' },
  connectorType: { 2: 'DVI SL', 3: 'DVI DL', 4: 'HDMI 1.3', 5: 'HDMI 1.4', 6: 'HDMI 2.0', 7: 'DP 1.1 SL',
    8: 'DP 1.2', 9: '3G-SDI', 13: '12G-SDI', 14: '6G-SDI', 17: 'DP 1.1 DL', 34: 'HDMI 2.1', 35: 'DP 1.4' },
  provenance: 'Manual field tables, vendor source enums and Studio model/connector mappings. Enum values are context-specific.',
};
