import { fail } from './pixelhue.js';
import { normaliseScreens } from './studio-screens.js';
import { integer, name, choice, verified } from './studio-common.js';
import { configuration, xmlFile } from './configuration.js';
import { readPresets, applyPreset } from './studio-presets.js';

// layer_2.xml <Window Roam="0">: 0 = layers may roam anywhere (PixelFlow behaviour), 1 = inside the screen only.
async function layerRoam(client) {
  await configuration(client);
  return xmlFile(client.configurationXml, 'deviceconfig/device/layer_2.xml').match(/<Window\b[^>]*\bRoam="(\d)"/)?.[1] !== '1';
}

export async function readProgramming(client) {
  const [screenResponse, layerResponse, interfaceResponse, presets, roam] = await Promise.all([
    client.call('screen/list-detail'), client.call('layers/list-detail'), client.call('interface/list-detail'), readPresets(client), layerRoam(client)]);
  const screens = normaliseScreens(screenResponse.data?.list);
  if (!Array.isArray(layerResponse.data?.list) || !Array.isArray(interfaceResponse.data?.list)) throw fail('Programming data was not returned.', 502);
  const layers = layerResponse.data.list.filter(l => [2, 4].includes(l.layerIdObj?.type) && screens.some(s => s.id === l.layerIdObj.attachScreenId))
    .map(l => {
      const screen = screens.find(s => s.id === l.layerIdObj.attachScreenId);
      return { id: l.layerId, screenId: screen.id, scene: l.layerIdObj.sceneType, type: l.layerIdObj.type,
        name: l.general?.name || `Layer ${l.serial ?? l.layerId}`, sourceType: l.source?.general?.sourceType,
        sourceId: l.source?.general?.sourceId, sourceName: l.source?.general?.sourceName || '',
        window: { ...l.window, x: l.window.x - screen.x, y: l.window.y - screen.y },
        zorder: l.zorder ?? 0, enabled: l.enable !== 0 };
    });
  const sources = interfaceResponse.data.list.filter(i => i.auxiliaryInfo?.connectorInfo?.interfaceType === 2 && i.auxiliaryInfo.connectorInfo.workMode !== 2)
    .map(i => ({ id: i.interfaceId, type: 2, connectorType: i.auxiliaryInfo.connectorInfo.type,
      name: i.general?.name || `Input ${i.interfaceId}`, connected: [1, 2, 3, 4].includes(i.state),
      width: i.actualTiming?.horizontal?.addTime, height: i.actualTiming?.vertical?.addTime }));
  for (const screen of screens) for (const type of [3, 4]) sources.push({ id: screen.id, type, name: `${screen.name} ${type === 3 ? 'PGM' : 'PVW'}`,
    width: screen.width, height: screen.height, connected: true });
  return { session: client.session, device: client.deviceInfo(), screens, layers, sources, presets, roam };
}
// Device limits from layer_2.xml: X/Y ±500000 (global), width/height 64–131070.
function geometry(window, screen, roam) {
  if (!window) throw fail('Layer dimensions required.');
  if (!roam) {
    integer(window.x, 'Layer X', 0, screen.width - 64); integer(window.y, 'Layer Y', 0, screen.height - 64);
    integer(window.width, 'Layer width', 64, screen.width - window.x); integer(window.height, 'Layer height', 64, screen.height - window.y);
  } else {
    integer(window.width, 'Layer width', 64, 131070); integer(window.height, 'Layer height', 64, 131070);
    integer(window.x + screen.x, 'Layer X', -500000, 500000); integer(window.y + screen.y, 'Layer Y', -500000, 500000);
  }
  return { width: window.width, height: window.height, x: window.x + screen.x, y: window.y + screen.y };
}
function sourcePayload(state, request, screen) {
  const source = state.sources.find(s => s.id === request.id && s.type === request.type);
  if (!source || ([3, 4].includes(source.type) && source.id === screen.id)) throw fail('Choose an input or another screen as the source.');
  return { general: { sourceId: source.id, sourceType: source.type, ...(source.connectorType ? { connectorType: source.connectorType } : {}) },
    primary: { sourceId: source.id, sourceType: source.type } };
}
export async function applyProgramming(client, request) {
  const state = await readProgramming(client);
  if (String(request.action).startsWith('preset-')) return applyPreset(client, request, state, readProgramming);
  if (['take', 'cut'].includes(request.action)) {
    const swapEnable = request.swap === false ? 0 : 1;
    const time = request.time ?? 500; integer(time, 'Transition duration', 0, 10000);
    const ids = Array.isArray(request.screenIds) ? request.screenIds : [request.screenId];
    const requested = ids.map(id => state.screens.find(s => s.id === id));
    if (!requested.length || requested.some(s => !s) || new Set(ids).size !== ids.length) throw fail('Choose current screens.', 409);
    const targets = requested.filter(s => s.enabled); // disabled screens (enable 0) are not switchable, as in PixelFlow
    if (!targets.length) throw fail('The shown screens are disabled on the device. Show an enabled screen.', 409);
    const payload = targets.map(screen => ({ screenId: screen.id, direction: 0, swapEnable,
      ...(request.action === 'take' ? { effectSelect: 1, screenGuid: screen.guid, switchEffect: { type: 1, time } } : {}) }));
    await client.call(`screen/${request.action}`, payload, { timeoutMs: 20000 });
    return { ...await readProgramming(client), transition: { action: request.action, time } };
  }
  const screen = state.screens.find(s => s.id === request.screenId);
  if (!screen) throw fail('Choose a current screen.', 409);
  if (request.action === 'pgm-lock') {
    // pgmEdit 0 = PGM editing forbidden. The device stores it but does not enforce it (WO-022), so Studio does.
    const locked = choice(request.locked, [true, false], 'PGM lock');
    await client.call('screen/pgm-edit', [{ screenId: screen.id, pgmEdit: locked ? 0 : 1 }]);
    return verified(() => readProgramming(client), next => next.screens.find(s => s.id === screen.id)?.pgmLocked === locked, 'the PGM lock');
  }
  const pgmTarget = request.action === 'create' ? request.scene === 2 : state.layers.find(l => l.id === request.id && l.screenId === screen.id)?.scene === 2;
  if (pgmTarget && screen.pgmLocked) throw fail(`PGM of ${screen.name} is locked. Unlock it to edit PGM layers.`, 409);
  if (request.action === 'create') {
    const scene = choice(request.scene, [2, 4], 'programming scene');
    const source = sourcePayload(state, request.source || {}, screen);
    const window = geometry(request.window || { x: 0, y: 0, width: Math.min(640, screen.width), height: Math.min(360, screen.height) }, screen, state.roam);
    const layerName = name(request.name || 'Layer', 'Layer name');
    await client.call('layers/create', { layerIdObj: { attachScreenId: screen.id, attachScreenType: 0, screenGuid: screen.guid,
      sceneType: scene, type: screen.type === 4 ? 4 : 2 },
      general: { name: layerName }, namePrefix: layerName + ' ', source, window, enable: 1,
      locked: 0, aspectRatio: { aspectRatio: 5, locked: 0 } }, { timeoutMs: 80000 });
    return verified(() => readProgramming(client), next => next.layers.some(l => l.screenId === screen.id && l.scene === scene && !state.layers.some(old => old.id === l.id)), 'the new layer');
  }
  const layer = state.layers.find(l => l.id === request.id && l.screenId === screen.id);
  if (!layer) throw fail('Programming layer no longer exists. Refresh.', 409);
  if (request.action === 'window') {
    const window = geometry(request.window, screen, state.roam);
    await client.call('layers/window', [{ layerId: layer.id, window }]);
    return verified(() => readProgramming(client), next => {
      const actual = next.layers.find(l => l.id === layer.id)?.window;
      return actual && ['x', 'y', 'width', 'height'].every(key => actual[key] === request.window[key]);
    }, 'the layer position');
  }
  if (request.action === 'source') {
    const source = sourcePayload(state, request.source || {}, screen);
    await client.call('layers/source', [{ layerId: layer.id, source }]);
    return verified(() => readProgramming(client), next => next.layers.some(l => l.id === layer.id && l.sourceId === request.source.id && l.sourceType === request.source.type), 'the layer source');
  }
  if (request.action === 'delete') {
    await client.call('layers', [{ layerId: layer.id, sn: client.serial }], { method: 'DELETE' });
    return verified(() => readProgramming(client), next => !next.layers.some(l => l.id === layer.id), 'layer deletion');
  }
  if (request.action === 'zorder') {
    const para = choice(request.to, [1, 2, 3, 4], 'stack order');
    await client.call('layers/zorder', [{ layerId: layer.id, zorder: { type: 1, para } }]);
    return readProgramming(client);
  }
  throw fail('Unsupported programming action.');
}
