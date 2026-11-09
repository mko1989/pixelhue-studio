import { fail } from './pixelhue.js';
import { normaliseOutputs } from './studio-outputs.js';
import { clone, name, integer, choice, batch, verified } from './studio-common.js';

export function normaliseScreens(screens) {
  if (!Array.isArray(screens)) throw fail('No screen list returned.', 502);
  return screens.filter(s => [2, 4, 32].includes(s.screenIdObj?.type)).map(s => ({
    id: s.screenId, guid: s.guid, type: s.screenIdObj.type, name: s.general?.name || `Screen ${s.screenId}`,
    width: s.mosaic?.window?.width || s.timing?.horizontal?.addTime || 1920,
    height: s.mosaic?.window?.height || s.timing?.vertical?.addTime || 1080,
    x: s.mosaic?.window?.x || 0, y: s.mosaic?.window?.y || 0,
    layout: s.layout || { x: 0, y: 0 }, outputs: (s.mosaic?.outputs || []).map(o => ({ id: o.interfaceId,
      name: o.name || `Output ${o.interfaceId}`, pos: o.pos, crop: o.crop })),
    enabled: s.enable !== 0, preview: s.preview, freeze: s.freeze ?? 0, ftb: s.ftb?.enable ?? 0,
    timing: s.thumbTiming || null, keyPosition: s.keyPosition || [] }));
}
export async function readScreens(client) {
  const [screens, interfaces] = await Promise.all([client.call('screen/list-detail'), client.call('interface/list-detail')]);
  return { session: client.session, device: client.deviceInfo(), screens: normaliseScreens(screens.data?.list),
    outputs: normaliseOutputs(interfaces.data?.list).filter(o => o.role !== 'MVR' && o.workMode === 0) };
}
function rect(value, label = 'Screen') {
  if (!value) throw fail(`${label} dimensions required.`);
  integer(value.x, `${label} X`, -100000, 100000); integer(value.y, `${label} Y`, -100000, 100000);
  integer(value.width, `${label} width`, 64, 16384); integer(value.height, `${label} height`, 64, 16384);
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, value[key]]));
}

export async function applyScreens(client, request) {
  const state = await readScreens(client);
  if (request.action === 'create') {
    const type = choice(request.type, [2, 4], 'screen type');
    const prefix = name(request.name || 'Screen', 'Screen name prefix');
    const used = new Set(state.screens.flatMap(s => s.keyPosition));
    let key = 1; while (used.has(key)) key++;
    await client.call('screen/create-empty-screen', { type, namePrefix: prefix + ' ', layout: { x: 0, y: 0 }, keyPosition: [key] });
    return verified(() => readScreens(client), next => next.screens.some(s => !state.screens.some(old => old.id === s.id)), 'the new screen');
  }
  const screen = state.screens.find(s => s.id === request.id);
  if (!screen) throw fail('Screen no longer exists. Refresh screens.', 409);
  if (request.action === 'delete') {
    await client.call('screen', [{ screenId: screen.id }], { method: 'DELETE' });
    return verified(() => readScreens(client), next => !next.screens.some(s => s.id === screen.id), 'screen deletion');
  }
  if (['freeze', 'ftb'].includes(request.action)) {
    const enable = choice(request.enable, [0, 1], request.action);
    await client.call(`screen/${request.action}`, [{ screenId: screen.id,
      [request.action]: request.action === 'freeze' ? enable : { enable, time: 300 } }]);
    return verified(() => readScreens(client), next => next.screens.find(s => s.id === screen.id)?.[request.action] === enable, request.action);
  }
  if (request.action !== 'update') throw fail('Unsupported screen action.');
  if (![2, 4].includes(screen.type)) throw fail('This screen uses LED topology; LCD output mapping is unavailable.', 409);
  const window = rect(request.window);
  if (!Array.isArray(request.outputs) || request.outputs.length > state.outputs.length) throw fail('Supply current output mappings.');
  const seen = new Set();
  const mappings = request.outputs.map(o => {
    const output = state.outputs.find(item => item.id === o.id);
    if (!output || seen.has(o.id)) throw fail('Unknown or duplicate screen output.');
    if ((screen.type === 4) !== (output.role === 'AUX')) throw fail('Choose outputs of the matching Main/AUX type.');
    const owner = state.screens.find(s => s.id !== screen.id && s.outputs.some(item => item.id === o.id));
    if (owner) throw fail(`${output.name} belongs to ${owner.name}. Remove that mapping first.`, 409);
    seen.add(o.id);
    const pos = rect(o.pos, 'Output tile');
    if (pos.x < 0 || pos.y < 0 || pos.x + pos.width > window.width || pos.y + pos.height > window.height) throw fail('Output tiles must fit inside their screen.');
    return { output, pos };
  });
  const raw = (await client.call('screen/list-detail')).data.list.find(s => s.screenId === screen.id);
  const oldOutputs = raw.mosaic?.outputs || [];
  const mosaic = { ...clone(raw.mosaic), type: 2, splice: { row: 1, column: Math.max(1, mappings.length) }, window,
    outputs: mappings.map(({ output, pos }) => ({ ...clone(oldOutputs.find(o => o.interfaceId === output.id) || {}),
      interfaceId: output.id, name: output.name,
      pos: { ...pos, x: window.x + pos.x, y: window.y + pos.y },
      crop: { x: 0, y: 0, width: pos.width, height: pos.height } })) };
  await client.call('screen/crop-mosaic', [{ screenId: screen.id, mosaic }], { timeoutMs: 20000 });
  return verified(() => readScreens(client), next => {
    const actual = next.screens.find(s => s.id === screen.id);
    return actual && ['x', 'y', 'width', 'height'].every(key => actual[key] === window[key]) &&
      actual.outputs.length === mappings.length && mappings.every(({ output, pos }) => {
        const tile = actual.outputs.find(o => o.id === output.id)?.pos;
        return tile && tile.x === window.x + pos.x && tile.y === window.y + pos.y && tile.width === pos.width && tile.height === pos.height;
      });
  }, 'the screen layout');
}
