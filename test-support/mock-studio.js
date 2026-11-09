import http from 'node:http';
import { createMockDevice } from './mock-p20.js';
import { umdXml } from './mvr-umd.js';

export function createMockStudio({ model = 'P20' } = {}) {
  const base = createMockDevice({ model }), original = base.server.listeners('request')[0];
  const { interfaces, screens, layers, writes, requests, behavior } = base;
  const primary = interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 4);
  for (const [id, role, type, mode, port] of [[400000, 4, 6, 1, 1], [400001, 8, 4, 0, 10], [400002, 16, 4, 0, 9]]) {
    interfaces.push({ ...structuredClone(primary), interfaceId: id, interfaceIdObj: { nodeId: 1, slotId: role === 4 ? primary.interfaceIdObj.slotId : 100, connectorId: port },
      general: { name: role === 4 ? 'Output copy' : role === 8 ? 'AUX output' : 'MVR output' },
      auxiliaryInfo: { online: 1, connectorInfo: { interfaceType: role, type, workMode: mode, capacity: 2,
        ...(mode === 1 ? { copyInfo: { id: primary.interfaceId, type } } : {}) } } });
  }
  for (const i of interfaces.filter(i => [4, 8, 16].includes(i.auxiliaryInfo.connectorInfo.interfaceType))) {
    i.presetThumbTiming ||= { width: 1920, height: 1080, frame: 60, standardType: 6, interlaced: 0 };
    i.colorDepth = { preset: 8, actual: 8 }; i.hdcp = { enable: 0, preset: 1, actual: 1 };
    i.testPattern = { enable: 0, type: 5, bright: 3, grid: 7 };
  }
  screens[0].guid = 'mvr-screen';
  screens.push({ screenId: 1, guid: 'main-screen', screenIdObj: { type: 2 }, general: { name: 'Main screen' },
    mosaic: { type: 2, window: { x: -100, y: 50, width: 1920, height: 1080 }, outputs: [] }, enable: 1, freeze: 0, ftb: { enable: 0 }, keyPosition: [1] },
  { screenId: 2, guid: 'aux-screen', screenIdObj: { type: 4 }, general: { name: 'AUX screen' },
    mosaic: { type: 2, window: { x: 0, y: 0, width: 1280, height: 720 }, outputs: [] }, enable: 1, freeze: 0, ftb: { enable: 0 }, keyPosition: [2] },
  // P20 placeholder Main screen reported with enable 0 (live Screen 2/3/4, WO-018).
  { screenId: 5, guid: 'spare-screen', screenIdObj: { type: 2 }, general: { name: 'Spare screen' },
    mosaic: { type: 0, window: { x: 0, y: 0, width: 1920, height: 1080 }, outputs: [] }, enable: 0, freeze: 0, ftb: { enable: 0 }, keyPosition: [3] });
  const source = layers[0].source.general;
  for (const [id, scene, x] of [[20, 2, -80], [21, 4, -60]]) layers.push({ layerId: id,
    layerIdObj: { attachScreenId: 1, attachScreenType: 0, sceneType: scene, screenGuid: 'main-screen', type: 2 },
    general: { name: scene === 2 ? 'Program layer' : 'Preview layer' }, source: { general: { ...source, sourceName: `Input ${scene}` } },
    window: { x, y: 70, width: 640, height: 360 }, enable: 1, zorder: 1 });
  const node = { nodeId: 1, modelId: { P20: 28944, P10: 28945, P80: 30006, Q8: 29974 }[model],
    general: { name: 'Studio device' }, version: 'V2.0.0', mode: { workMode: 4, masterSlave: 0 }, layerMode: 0,
    fanMode: 2, deviceBeacon: 0, genlock: { type: 0, sourceId: 0, phase: { enable: 0 } }, online: 1,
    subcards: base.cards.map(c => ({ slotId: c.slotId, modelId: c.modelId, online: 1, cardType: c.cardType })) };
  const presets = [{ guid: 'preset-a', serial: 1, name: 'Opening', type: 1, loadType: 1, sourceRegion: 4, params: ['3'],
    screens: [{ guid: 'main-screen', name: 'Main screen', layers: [{ serial: 1, type: 2 }] }], interfaces: [] }];
  layers.forEach((l, i) => { l.serial ??= i + 1; });
  const ethernet = { mode: 0, infos: [{ index: 0, mac: '54:B5:6C:00:00:01', dhcp: 0, ip: '192.168.0.20', netmask: '255.255.255.0', gateway: '192.168.0.1', interfaceType: 25, autoDNS: 0, dns: [] }] };
  behavior.geometryDelay = 0; behavior.ignoreSetup = false;
  const config = umdXml.replace('<Features>', `<DCS><Device><Features><Device>
    <LayerModes Support="1" Editable="1"><Enum Value="0"/><Enum Value="1"/></LayerModes>
    <FanMode Support="1" Editable="1"><Enum Value="1"/><Enum Value="2"/></FanMode></Device>
    <DeviceModes Support="1" Editable="1"><DeviceMode Value="4"/><DeviceMode Value="8"/></DeviceModes>
    <PowerCtrl Support="1" Editable="1"><Type><Enum Value="0"/><Enum Value="1"/><Enum Value="2"/></Type></PowerCtrl>
    <Genlock Support="1" Editable="1"><Type><Enum Value="0"/><Enum Value="1"/><Enum Value="2"/></Type></Genlock>`)
    .replace('</Features>', '</Features></Device></DCS>');
  const customGets = ['node/detail', 'node/config-file', 'node/ethernet', 'preset'];
  const customPuts = ['screen/pgm-edit', 'preset/apply', 'preset/create', 'preset/update-name', 'preset/delete', 'node/ethernet', 'node/power', 'system/restore-factory', 'node/general', 'node/beacon', 'node/fan/mode', 'node/layer-mode', 'node/genlock', 'node/mode',
    'interface/color-depth', 'interface/hdcp', 'interface/test-pattern', 'screen/create-empty-screen', 'screen/crop-mosaic',
    'screen/freeze', 'screen/ftb', 'screen/take', 'screen/cut', 'screen', 'layers/create', 'layers/source', 'layers/zorder', 'layers'];
  const server = http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname.replace('/unico/v1/', '');
    if (!(request.method === 'GET' ? customGets : customPuts).includes(path)) {
      if (path === 'layers/window' && behavior.geometryDelay) await new Promise(r => setTimeout(r, behavior.geometryDelay));
      return original(request, response);
    }
    requests.push({ path, method: request.method });
    const send = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 0, data })); };
    if (!request.headers.authorization) { response.writeHead(401).end(); return; }
    if (request.method === 'GET') {
      if (path === 'node/detail') return send(node);
      if (path === 'node/ethernet') return send({ nodeId: 1, state: 0, ethernet });
      if (path === 'preset') return send({ list: presets, page: 1, totalPage: 1, totalCount: presets.length });
      response.setHeader('Content-Type', 'application/xml'); response.end(config); return;
    }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); writes.push({ path, body, method: request.method });
    if (behavior.ignoreSetup && path.startsWith('node/')) return send({});
    if (path === 'screen/pgm-edit') for (const change of body) screens.find(x => x.screenId === change.screenId).pgmEdit = change.pgmEdit;
    if (path === 'preset/create') {
      // Device rule seen on P20 V2.0.0 (WO-018): presets may only name enabled screens.
      const off = body.screens.map(b => screens.find(x => x.guid === b.guid)).find(x => !x || x.enable === 0);
      if (off) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: `manage param invalid: check screen faild: screen ${off?.screenId} is not enabled` })); return; }
      // P20 replaces an existing serial (WO-022 live test).
      const same = presets.findIndex(p => p.serial === body.serial); if (same >= 0) presets.splice(same, 1);
      presets.push({ ...body, guid: same >= 0 ? `preset-${body.serial}-overwritten` : `preset-${body.serial}` });
    }
    if (path === 'preset/update-name') for (const change of body) presets.find(p => p.guid === change.guid).name = change.name;
    if (path === 'preset/delete') for (const guid of body) presets.splice(presets.findIndex(p => p.guid === guid), 1);
    if (path === 'node/ethernet') ethernet.infos[0] = { ...ethernet.infos[0], ...body.ethernet.infos[0] };
    if (path === 'node/general') node.general = body.general;
    if (path === 'node/beacon') node.deviceBeacon = body.enable;
    if (path === 'node/fan/mode') node.fanMode = body.mode;
    if (path === 'node/layer-mode') node.layerMode = body.layerMode;
    if (path === 'node/mode') node.mode = body.mode;
    if (path === 'node/genlock') node.genlock = body.genlock;
    if (path.startsWith('interface/')) for (const change of body) {
      const row = interfaces.find(i => i.interfaceId === change.interfaceId), key = path.split('/')[1];
      const field = { 'color-depth': 'colorDepth', hdcp: 'hdcp', 'test-pattern': 'testPattern' }[key]; row[field] = { ...row[field], ...change[field] };
    }
    if (path === 'screen/create-empty-screen') {
      // P20 rule (WO-019): only the full ucenter body (snList/guid/name) yields an enabled screen.
      const id = Math.max(...screens.map(s => s.screenId)) + 1, full = Array.isArray(body.snList) && body.snList.length && body.guid && body.name;
      screens.push({ screenId: id, guid: body.guid || `screen-${id}`, screenIdObj: { type: body.type }, general: { name: body.name || body.namePrefix + id },
        mosaic: { window: { x: 0, y: 0, width: 0, height: 0 }, outputs: [] }, keyPosition: body.keyPosition, enable: full ? 1 : 0 });
    }
    if (path === 'screen/crop-mosaic' && body.some(c => c.mosaic.outputs.length && c.mosaic.interfaceId !== c.mosaic.outputs[0].interfaceId)) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ code: 8212, message: 'manage mio error: creatCropMosaicsNewScreen get ref interfaceId[0] connector info err' })); return;
    }
    if (path === 'screen/crop-mosaic') for (const change of body) screens.find(s => s.screenId === change.screenId).mosaic = change.mosaic;
    if (['screen/freeze', 'screen/ftb'].includes(path)) for (const change of body) {
      const key = path.split('/')[1]; screens.find(s => s.screenId === change.screenId)[key] = change[key];
    }
    if (path === 'screen') for (const change of body) {
      // P20 keeps deleted Main screens as disabled placeholders (WO-019).
      const gone = screens.find(s => s.screenId === change.screenId);
      if (gone.screenIdObj.type === 2) Object.assign(gone, { enable: 0, mosaic: { type: 0, window: { x: 0, y: 0, width: 0, height: 0 }, outputs: [] } });
      else screens.splice(screens.indexOf(gone), 1);
      for (let i = layers.length - 1; i >= 0; i--) if (layers[i].layerIdObj.attachScreenId === change.screenId) layers.splice(i, 1);
    }
    if (path === 'layers/create') {
      const id = Math.max(...layers.map(l => l.layerId)) + 1;
      layers.push({ ...body, layerId: id, zorder: layers.filter(l => l.layerIdObj.attachScreenId === body.layerIdObj.attachScreenId).length + 1 });
    }
    if (path === 'layers/source') for (const change of body) layers.find(l => l.layerId === change.layerId).source = change.source;
    if (path === 'layers') for (const change of body) layers.splice(layers.findIndex(l => l.layerId === change.layerId), 1);
    if (path === 'layers/zorder') for (const change of body) {
      const layer = layers.find(l => l.layerId === change.layerId), group = layers.filter(l => l.layerIdObj.attachScreenId === layer.layerIdObj.attachScreenId && l.layerIdObj.sceneType === layer.layerIdObj.sceneType);
      layer.zorder = change.zorder.para === 3 ? Math.max(...group.map(l => l.zorder)) + 1 : change.zorder.para === 4 ? Math.min(...group.map(l => l.zorder)) - 1 : layer.zorder + (change.zorder.para === 1 ? 1 : -1);
    }
    return send({});
  });
  return { ...base, server, node, primary, ethernet, presets };
}
