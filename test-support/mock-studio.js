import http from 'node:http';
import { createMockDevice } from './mock-p20.js';
import { umdXml } from './mvr-umd.js';
import { installAudio } from './mock-audio.js';
import { outputXml, enrichOutput, outputWriteError } from './mock-output-advanced.js';
import { screenXml, enrichScreen, screenExtraError } from './mock-screen-extras.js';
import { layerPresetXml, installLayerPresets } from './mock-layer-presets.js';
import { layerXml, enrichEffects, applyEffectWrite, applyCutFillWrite } from './mock-effects.js';

export function createMockStudio({ model = 'P20', audioFeature = true } = {}) {
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
    i.testPattern = { enable: 0, type: 5, bright: 3, grid: 7 }; enrichOutput(i);
  }
  let selfCheckPolls = 0, selfChecked = false, capture = null;
  // Built-in MVR layouts (WO-037): cells are fractions of the output; applying replaces every MVR window.
  const mvrTemplates = [{ templateId: 3, templateIdObj: { moduleType: 0, type: 1 }, cells: [{ x: 0, y: 0, width: 0.5, height: 0.5 }, { x: 0.5, y: 0, width: 0.5, height: 0.5 }], layout: [{ type: 0 }] },
    { templateId: 9, templateIdObj: { moduleType: 1, type: 1 }, cells: [] }];
  const audio = installAudio(interfaces), sourceBackup = { enable: 0, primaryFirst: 0, backup: [] };
  screens[0].guid = 'mvr-screen';
  screens.push({ screenId: 1, guid: 'main-screen', screenIdObj: { type: 2 }, general: { name: 'Main screen' },
    mosaic: { type: 2, window: { x: -100, y: 50, width: 1920, height: 1080 }, outputs: [] }, enable: 1, freeze: 0, ftb: { enable: 0 }, keyPosition: [1] },
  { screenId: 2, guid: 'aux-screen', screenIdObj: { type: 4 }, general: { name: 'AUX screen' },
    mosaic: { type: 2, window: { x: 0, y: 0, width: 1280, height: 720 }, outputs: [] }, enable: 1, freeze: 0, ftb: { enable: 0 }, keyPosition: [2] },
  // P20 placeholder Main screen reported with enable 0 (live Screen 2/3/4, WO-018).
  { screenId: 5, guid: 'spare-screen', screenIdObj: { type: 2 }, general: { name: 'Spare screen' },
    mosaic: { type: 0, window: { x: 0, y: 0, width: 1920, height: 1080 }, outputs: [] }, enable: 0, freeze: 0, ftb: { enable: 0 }, keyPosition: [3] });
  for (const s of screens.filter(s => s.screenIdObj.type !== 8)) enrichScreen(s);
  const source = layers[0].source.general;
  for (const [id, scene, x] of [[20, 2, -80], [21, 4, -60]]) layers.push({ layerId: id,
    layerIdObj: { attachScreenId: 1, attachScreenType: 0, sceneType: scene, screenGuid: 'main-screen', type: 2 },
    general: { name: scene === 2 ? 'Program layer' : 'Preview layer' }, source: { general: { ...source, sourceName: `Input ${scene}` } },
    window: { x, y: 70, width: 640, height: 360 }, enable: 1, zorder: 1 });
  for (const l of layers.filter(l => [20, 21].includes(l.layerId))) enrichEffects(l);
  const node = { nodeId: 1, modelId: { P20: 28944, P10: 28945, P80: 30006, Q8: 29974 }[model],
    general: { name: 'Studio device' }, version: 'V2.0.0', status: 1, mode: { workMode: 4, masterSlave: 0 }, layerMode: 0,
    fanMode: 2, deviceBeacon: 0, time: { timestamp: 1794248988, timezone: 70 }, antiStatic: { enable: 0, time: 100 }, genlock: { type: 0, sourceId: 0, phase: { enable: 0 } }, online: 1,
    subcards: base.cards.map(c => ({ slotId: c.slotId, modelId: c.modelId, online: 1, cardType: c.cardType })) };
  const presets = [{ guid: 'preset-a', serial: 1, name: 'Opening', type: 1, loadType: 1, sourceRegion: 4, params: ['3'],
    screens: [{ guid: 'main-screen', name: 'Main screen', layers: [{ serial: 1, type: 2 }] }], interfaces: [] }];
  // Serials are per screen and scene on the P20 (live: PGM and PVW each have serial 1, WO-024).
  const nextSerial = (screenId, scene) => 1 + Math.max(0, ...layers.filter(l => l.layerIdObj?.attachScreenId === screenId && l.layerIdObj?.sceneType === scene && l.serial != null).map(l => l.serial));
  for (const l of layers) l.serial ??= nextSerial(l.layerIdObj?.attachScreenId, l.layerIdObj?.sceneType);
  // Gallery and BKG layers (WO-027), shaped like live P20 picture/list and layers/list-detail.
  const pictures = [{ pictureId: 1, isUsed: 2, pictureObj: { id: 1, type: 1 }, general: { name: 'Grid', width: 1920, height: 1080 }, path: [{ type: 0, url: '/picture/bkg/grid_1.jpg' }] }];
  for (const scene of [2, 4]) layers.push({ layerId: 900 + scene, serial: 0, layerIdObj: { attachScreenId: 1, attachScreenType: 0, screenGuid: 'main-screen', sceneType: scene, type: 16 },
    general: { name: '' }, source: { general: { sourceType: 0, sourceId: 0, sourceName: '' } }, window: { x: -100, y: 50, width: 1920, height: 1080 }, enable: 0, zorder: 0 });
  const ethernet = { mode: 0, infos: [{ index: 0, mac: '54:B5:6C:00:00:01', dhcp: 0, ip: '192.168.0.20', netmask: '255.255.255.0', gateway: '192.168.0.1', interfaceType: 25, autoDNS: 0, dns: [] }] };
  behavior.geometryDelay = 0; behavior.ignoreSetup = false;
  const config = umdXml.replace('<Features>', `<DCS><Device><Features><Device>
    <LayerModes Support="1" Editable="1"><Enum Value="0"/><Enum Value="1"/></LayerModes>
    <FanMode Support="1" Editable="1"><Enum Value="1"/><Enum Value="2"/></FanMode>
    <AntiStatic Support="1" Editable="1"><Enable Support="1"/><Time Support="1" Editable="1" Value="100" Min="100" Max="2000"/></AntiStatic></Device>
    ${layerPresetXml}
    <DeviceModes Support="1" Editable="1"><DeviceMode Value="4"/><DeviceMode Value="8"/></DeviceModes>
    <Pictures Support="1" Editable="0"><Picture type="1" Support="1"><Width Min="0" Max="65535"/><Height Min="0" Max="65535"/></Picture>
      <Picture type="2" Support="1"><Width Min="0" Max="512"/><Height Min="0" Max="512"/></Picture><Picture type="3" Support="0"><Width Max="16384"/><Height Max="8192"/></Picture></Pictures>
    <PowerCtrl Support="1" Editable="1"><Type><Enum Value="0"/><Enum Value="1"/><Enum Value="2"/></Type></PowerCtrl>
    <Genlock Support="1" Editable="1"><Type><Enum Value="0"/><Enum Value="1"/><Enum Value="2"/></Type></Genlock>`)
    .replace('</Features>', `</Features><Timezone Support="1" Editable="1" Value="70"><Enum Value="0" Offset="-660" Name="Pacific/Midway"/><Enum Value="35" Offset="60" Name="Europe/Warsaw"/><Enum Value="70" Offset="480" Name="Asia/Shanghai"/></Timezone><DeviceSelfTest Support="1" Editable="1" IsBlock="0"/><SourceBackup Support="1" Editable="1"><SwitchStrategy Value="1"/><CapacityStrategy Value="0"/></SourceBackup>${audioFeature ? '<Audio Support="1" Editable="1"><AudioMatrix Support="1" Editable="1"/><AudioDante Support="0" Editable="0"/></Audio>' : ''}</Device></DCS>`).replace('</Files>', `${layerXml}${outputXml}${screenXml}</Files>`);
  const customGets = ['node/detail', 'node/config-file', 'node/ethernet', 'preset', 'picture/list', 'picture/capacity', 'audio/matrix-detail', 'node/clock', 'system/ctrl/source-backup', 'node/selfcheck', 'layers/layer-preset/list-detail', 'layers/template', 'picture/progress'];
  const effectPaths = ['layers/opacity', 'layers/lock', 'layers/border', 'layers/mask', 'layers/shadow', 'layers/crop', 'layers/image-quality', 'layers/cutout'];
  const cutFillPaths = ['layers/cut-fill-switch', 'layers/relative', 'layers/curve', 'layers/reset-cut'];
  const layerPresetPaths = ['create', 'apply-modify', 'delete', 'apply', 'apply-access'].map(p => `layers/layer-preset/${p}`), layerPresets = installLayerPresets(layers, screens);
  const customPuts = ['picture', 'picture/general', 'picture/capture', 'picture/capture/save', ...effectPaths, ...cutFillPaths, ...layerPresetPaths, 'node/selfcheck', 'system/ctrl/source-backup', 'audio/matrix-mapping', 'audio/matrix-base', 'picture/import', 'layers/switch', 'layers/general', 'layers/key-frame', 'screen/pgm-edit', 'preset/apply', 'preset/create', 'preset/update-name', 'preset/delete', 'node/ethernet', 'node/clock', 'node/anti-static', 'node/power', 'system/restore-factory', 'node/general', 'node/beacon', 'node/fan/mode', 'node/layer-mode', 'node/genlock', 'node/mode',
    'interface/color-depth', 'interface/color-space', 'interface/color-range', 'interface/color-gamut', 'interface/image-quality', 'interface/hdcp', 'interface/test-pattern', 'screen/create-empty-screen', 'screen/crop-mosaic',
    'screen/test-pattern', 'screen/image-quality', 'screen/freeze', 'screen/ftb', 'screen/take', 'screen/cut', 'screen', 'layers/template/select', 'layers/create', 'layers/copy', 'layers/source', 'layers/zorder', 'layers'];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'), path = url.pathname.replace('/unico/v1/', '');
    if (request.method === 'GET' && url.pathname.startsWith('/picture/')) { // device web-root thumbnails
      if (!pictures.some(p => p.path.some(x => x.url === url.pathname))) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); return;
    }
    if (request.method === 'PUT' && path === 'picture/import') { // multipart: description + pictureFile
      let raw = Buffer.alloc(0); for await (const chunk of request) raw = Buffer.concat([raw, chunk]);
      const text = raw.toString('latin1'), desc = JSON.parse(text.match(/name="description"\r\n\r\n([^\r]*)\r\n/)[1]);
      writes.push({ path, method: 'PUT', body: { description: desc, contentType: request.headers['content-type'], fileBytes: raw.length } });
      const id = Math.max(0, ...pictures.map(p => p.pictureId)) + 1, folder = desc.pictureObj.type === 2 ? 'logo' : 'bkg';
      pictures.push({ pictureId: id, isUsed: 2, pictureObj: { id, type: desc.pictureObj.type }, general: desc.general, path: [{ type: 0, url: `/picture/${folder}/up_${id}.jpg` }] });
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 0, data: {} })); return;
    }
    if (!(request.method === 'GET' ? customGets : customPuts).includes(path)) {
      if (path === 'layers/window' && behavior.geometryDelay) await new Promise(r => setTimeout(r, behavior.geometryDelay));
      return original(request, response);
    }
    requests.push({ path, method: request.method });
    const send = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 0, data })); };
    if (!request.headers.authorization) { response.writeHead(401).end(); return; }
    if (request.method === 'GET') {
      if (path === 'node/detail') { if (node.status === 10 && --selfCheckPolls <= 0) node.status = 1; return send(node); }
      if (path === 'node/ethernet') return send({ nodeId: 1, state: 0, ethernet });
      if (path === 'audio/matrix-detail') return send(audio.detail());
      if (path === 'node/clock') return send({ nodeId: 1, time: node.time });
      if (path === 'system/ctrl/source-backup') return send({ sourceBackup });
      if (path === 'layers/template') return send(url.searchParams.get('moduleType') === '0' ? mvrTemplates : []);
      if (path === 'layers/layer-preset/list-detail') return send({ totalCount: layerPresets.presets.length, list: layerPresets.presets });
      if (path === 'node/selfcheck') { // checkType 0 = power-on check, 1 = last device test
        const tested = url.searchParams.get('checkType') === '1';
        return send({ nodeId: 1, checkType: tested ? 1 : 0, parts: tested && !selfChecked ? [] : [{ slotId: 100, modelId: node.modelId, boardId: 0, section: [
          { sequence: 1, type: 1, index: 0, name: 'Temperature', value: '50', showBrief: 1, state: 0 }, { sequence: 2, type: 2, index: 0, name: 'Fan', value: '2400', showBrief: 1, state: behavior.fanFault ? 1 : 0 }] }] });
      }
      if (path === 'preset') return send({ list: presets, page: 1, totalPage: 1, totalCount: presets.length });
      if (path === 'picture/list') { const t = Number(url.searchParams.get('type')); return send({ list: pictures.filter(p => !t || p.pictureObj.type === t), page: 1, totalPage: 1 }); }
      if (path === 'picture/capacity') return send({ type: 1, usedCapacity: 1.5, totalCapacity: 512 });
      if (path === 'picture/progress') { if (capture && --capture.polls <= 0) capture.status = behavior.captureFails ? 255 : 2; return send({ pictureProgress: capture ? { type: 1, percent: capture.status === 2 ? 100 : 50, status: capture.status } : { type: 0, percent: 0, status: 0 } }); }
      response.setHeader('Content-Type', 'application/xml'); response.end(config); return;
    }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); writes.push({ path, body, method: request.method });
    if (behavior.ignoreSetup && path.startsWith('node/')) return send({});
    if (path === 'system/ctrl/source-backup') { // device rules: whole object, real inputs, distinct sides; 8297 for keyed sources
      const next = body.sourceBackup, isInput = id => interfaces.some(i => i.interfaceId === id && i.auxiliaryInfo.connectorInfo.interfaceType === 2);
      const bad = request.method !== 'PUT' || !next || ![0, 1].includes(next.enable) || !Array.isArray(next.backup) || next.backup.some(p => !Number.isInteger(p.id) || !isInput(p.primarySourceId) || !isInput(p.backupSourceId) || p.primarySourceId === p.backupSourceId || ![0, 1].includes(p.switchMode));
      const keyed = !bad && next.backup.some(p => behavior.keyedSources?.includes(p.primarySourceId));
      if (bad || keyed) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: keyed ? 8297 : 8210, message: keyed ? 'source used by cut fill' : 'manage param invalid' })); return; }
      if (!behavior.ignoreBackup) Object.assign(sourceBackup, structuredClone(next));
      return send({});
    }
    if (['screen/test-pattern', 'screen/image-quality'].includes(path)) {
      const error = behavior.ignoreScreenExtras ? null : screenExtraError(screens, path, body);
      if (error) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: error })); return; }
      return send({});
    }
    if (layerPresetPaths.includes(path)) {
      const result = layerPresets.handle(path, request.method, body, behavior);
      if (Array.isArray(result)) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: result[0], message: result[1] })); return; }
      return send(result.data);
    }
    if (cutFillPaths.includes(path)) {
      const refused = applyCutFillWrite(layers, path, body);
      if (refused) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: refused[0], message: refused[1] })); return; }
      return send({});
    }
    if (effectPaths.includes(path)) {
      const error = behavior.ignoreEffects ? null : applyEffectWrite(layers, path, body);
      if (error) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: error })); return; }
      return send({});
    }
    if (path.startsWith('audio/')) { // POST only, like PixelFlow; refused bodies answer with a device error code.
      const error = request.method === 'POST' ? audio.write(path, body, behavior) : 'method not allowed';
      if (error) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: error })); return; }
      return send({});
    }
    if (path === 'layers/switch') for (const change of body) layers.find(l => l.layerId === change.layerId).enable = change.enable;
    if (path === 'layers/source') for (const change of body) { const pic = pictures.find(p => p.pictureId === change.source.general.sourceId); if (pic && [5, 6].includes(change.source.general.sourceType)) change.source.general.sourceName = pic.general.name; }
    if (path === 'layers/general') for (const change of body) layers.find(l => l.layerId === change.layerId).general = { ...layers.find(l => l.layerId === change.layerId).general, ...change.general };
    if (path === 'layers/key-frame') for (const change of body) layers.find(l => l.layerId === change.layerId).keyFrame = change.keyFrame;
    if (path === 'preset/apply' && body.targetRegion === 4 && !behavior.ignorePresetApply) {
      // Load the stored windows into PVW by serial, after an optional delay (asynchronous on hardware).
      const preset = presets.find(p => p.guid === body.presetId), load = () => { for (const entry of preset?.screens || []) {
        const scr = screens.find(x => x.guid === entry.guid);
        for (const l of entry.layers) { const live = layers.find(x => x.layerIdObj.attachScreenId === scr?.screenId && x.layerIdObj.sceneType === 4 && x.serial === l.serial); if (live && l.window) live.window = structuredClone(l.window); }
      } };
      if (behavior.presetApplyDelay) setTimeout(load, behavior.presetApplyDelay); else load();
    }
    if (path === 'screen/pgm-edit') for (const change of body) screens.find(x => x.screenId === change.screenId).pgmEdit = change.pgmEdit;
    if (path === 'preset/create') {
      // Device rule seen on P20 V2.0.0 (WO-018): presets may only name enabled screens.
      const off = body.screens.map(b => screens.find(x => x.guid === b.guid)).find(x => !x || x.enable === 0);
      if (off) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: `manage param invalid: check screen faild: screen ${off?.screenId} is not enabled` })); return; }
      // P20 replaces an existing serial (WO-022 live test).
      const same = presets.findIndex(p => p.serial === body.serial); if (same >= 0) presets.splice(same, 1);
      // The device stores each layer's window (live GET preset shows screens[].layers[].window).
      const stored = { ...body, screens: body.screens.map(entry => { const scr = screens.find(x => x.guid === entry.guid); return { ...entry, name: scr?.general?.name,
        layers: entry.layers.map(l => { const live = layers.find(x => x.layerIdObj.attachScreenId === scr?.screenId && x.layerIdObj.sceneType === body.sourceRegion && x.serial === l.serial);
          return { ...l, window: live && structuredClone(live.window), enable: 1 }; }) }; }) };
      presets.push({ ...stored, guid: same >= 0 ? `preset-${body.serial}-overwritten` : `preset-${body.serial}` });
    }
    if (path === 'preset/update-name') for (const change of body) presets.find(p => p.guid === change.guid).name = change.name;
    if (path === 'preset/delete') for (const guid of body) presets.splice(presets.findIndex(p => p.guid === guid), 1);
    if (path === 'node/ethernet') ethernet.infos[0] = { ...ethernet.infos[0], ...body.ethernet.infos[0] };
    if (path.startsWith('picture')) { // gallery rules: DELETE answers with the ids it kept (pictures in use); capture is POST then save
      const refuse = message => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message })); };
      if (path === 'picture') {
        if (request.method !== 'DELETE' || !Array.isArray(body.pictureIds)) return refuse('picture param invalid');
        const kept = body.pictureIds.filter(id => { const index = pictures.findIndex(p => p.pictureId === id && p.isUsed !== 1 && !behavior.keepPictures); if (index < 0) return true; pictures.splice(index, 1); return false; });
        return send(kept);
      }
      const picture = pictures.find(p => p.pictureId === body.pictureId) || (capture?.pictureId === body.pictureId ? capture : null);
      if (path === 'picture/general') { if (request.method !== 'PUT' || !picture || !body.name) return refuse('picture param invalid'); picture.general.name = body.name; return send({}); }
      if (path === 'picture/capture') {
        const known = body.source?.type === 0 ? screens.some(x => x.screenId === body.source.id && x.screenIdObj.type !== 8) : body.source?.type === 1 && interfaces.some(i => i.interfaceId === body.source.id);
        if (request.method !== 'POST' || !known || node.status !== 1) return refuse('capture param invalid');
        capture = { pictureId: Math.max(0, ...pictures.map(p => p.pictureId)) + 1, status: 1, polls: 2, general: { name: '', width: 1920, height: 1080 } };
        return send({ pictureId: capture.pictureId, general: capture.general });
      }
      if (request.method !== 'PUT' || !capture || capture.pictureId !== body.pictureId || capture.status !== 2 || body.type !== 1 || !body.name) return refuse('capture save invalid');
      pictures.push({ pictureId: capture.pictureId, isUsed: 2, pictureObj: { id: capture.pictureId, type: 1 }, general: { ...capture.general, name: body.name }, path: [{ type: 0, url: `/picture/bkg/cap_${capture.pictureId}.jpg` }] });
      capture = null; return send({});
    }
    if (path === 'node/selfcheck') { // device rule: POST only, refused while busy
      if (request.method !== 'POST' || body.nodeId !== 1 || node.status !== 1) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: 'node busy' })); return; }
      node.status = 10; selfCheckPolls = 2; selfChecked = true; return send({});
    }
    if (path === 'node/clock' || path === 'node/anti-static') { // device rules: clock is PUT, anti-static is POST with 100–2000 ms
      const bad = path === 'node/clock' ? request.method !== 'PUT' || ![0, 35, 70].includes(body.time?.timezone) || !Number.isInteger(body.time?.timestamp)
        : request.method !== 'POST' || ![0, 1].includes(body.antiStatic?.enable) || !(body.antiStatic.time >= 100 && body.antiStatic.time <= 2000);
      if (bad) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: 'manage param invalid' })); return; }
      if (path === 'node/clock') node.time = body.time; else node.antiStatic = body.antiStatic;
    }
    if (path === 'node/general') node.general = body.general;
    if (path === 'node/beacon') node.deviceBeacon = body.enable;
    if (path === 'node/fan/mode') node.fanMode = body.mode;
    if (path === 'node/layer-mode') node.layerMode = body.layerMode;
    if (path === 'node/mode') node.mode = body.mode;
    if (path === 'node/genlock') node.genlock = body.genlock;
    if (path.startsWith('interface/')) {
      const key = path.split('/')[1], field = { 'color-depth': 'colorDepth', 'color-space': 'colorSpace', 'color-range': 'colorRange', 'color-gamut': 'colorGamut', 'image-quality': 'imageQuality', hdcp: 'hdcp', 'test-pattern': 'testPattern' }[key];
      const refused = body.map(change => { const row = interfaces.find(i => i.interfaceId === change.interfaceId); return row ? outputWriteError(row, field, change[field]) : 'interface invalid'; }).find(Boolean);
      if (refused) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: refused })); return; }
      if (!behavior.ignoreOutputAdvanced || !['colorSpace', 'colorRange', 'colorGamut', 'imageQuality'].includes(field)) for (const change of body) {
        const row = interfaces.find(i => i.interfaceId === change.interfaceId); row[field] = { ...row[field], ...change[field] };
      }
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
    if (behavior.resourceShort && ['layers/create', 'layers/source', 'layers/copy'].includes(path)) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ code: 8212, message: 'manage mio error: create layer {...} resource not enough' })); return;
    }
    if (path === 'layers/template/select') {
      const template = mvrTemplates.find(t => t.templateId === body.templateId && t.templateIdObj.type === body.templateType && t.templateIdObj.moduleType === body.moduleType), screen = screens.find(s => s.screenId === body.screenId);
      if (!template || screen?.screenIdObj.type !== 8 || body.sceneType !== 2 || behavior.templateScaling) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: behavior.templateScaling ? 8307 : 8210, message: 'template invalid' })); return; }
      for (let i = layers.length - 1; i >= 0; i--) if (layers[i].layerIdObj.attachScreenId === screen.screenId) layers.splice(i, 1);
      const w = screen.timing.horizontal.addTime, h = screen.timing.vertical.addTime, input = interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2 && i.auxiliaryInfo.connectorInfo.workMode === 0);
      template.cells.forEach((c, i) => layers.push({ layerId: 700 + i, layerIdObj: { attachScreenId: screen.screenId }, general: { name: `Window ${i + 1}` }, source: { general: { sourceType: 2, sourceId: input.interfaceId } },
        window: { x: Math.round(c.x * w), y: Math.round(c.y * h), width: Math.round(c.width * w), height: Math.round(c.height * h) } }));
    }
    if (path === 'layers/copy') for (const item of body) { // the copy keeps every property of its source; only window and flip are given
      const from = layers.find(l => l.layerId === item.layerId); if (!from || !item.window || ![0, 1, 2, 3].includes(item.flipType)) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 8210, message: 'layer param invalid' })); return; }
      const id = Math.max(...layers.map(l => l.layerId)) + 1, copy = structuredClone(from);
      layers.push({ ...copy, layerId: id, cutId: 0, window: { ...item.window }, general: { ...copy.general, flipType: item.flipType, name: `${item.namePrefix}${id}` }, serial: nextSerial(from.layerIdObj.attachScreenId, from.layerIdObj.sceneType), zorder: Math.max(...layers.map(l => l.zorder || 0)) + 1 });
    }
    if (path === 'layers/create') {
      const id = Math.max(...layers.map(l => l.layerId)) + 1;
      layers.push({ ...body, layerId: id, serial: nextSerial(body.layerIdObj.attachScreenId, body.layerIdObj.sceneType), zorder: layers.filter(l => l.layerIdObj.attachScreenId === body.layerIdObj.attachScreenId).length + 1 });
      if (body.layerIdObj.type === 8) layers.at(-1).UMD ??= [{ enable: behavior.mvrUmd ?? 1 }];
    }
    if (path === 'layers/source') for (const change of body) layers.find(l => l.layerId === change.layerId).source = change.source;
    if (path === 'layers') for (const change of body) layers.splice(layers.findIndex(l => l.layerId === change.layerId), 1);
    if (path === 'layers/zorder') for (const change of body) {
      const layer = layers.find(l => l.layerId === change.layerId), group = layers.filter(l => l.layerIdObj.attachScreenId === layer.layerIdObj.attachScreenId && l.layerIdObj.sceneType === layer.layerIdObj.sceneType);
      layer.zorder = change.zorder.para === 3 ? Math.max(...group.map(l => l.zorder)) + 1 : change.zorder.para === 4 ? Math.min(...group.map(l => l.zorder)) - 1 : layer.zorder + (change.zorder.para === 1 ? 1 : -1);
    }
    return send({});
  });
  return { ...base, server, node, primary, ethernet, presets, pictures, audio, sourceBackup, layerPresets: layerPresets.presets };
}
