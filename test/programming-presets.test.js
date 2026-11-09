import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { applyScreens } from '../lib/studio-screens.js';
import { moveWindow, snapWindow, dropWindow, canvasOf } from '../public/program-stage.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}

test('program layers roam off-screen within device limits; Roam="1" keeps them inside (WO-016)', async t => {
  const { client, mock } = await fixture(t);
  const state = await readProgramming(client); assert.equal(state.roam, true);
  const off = { x: -900, y: 5000, width: 640, height: 360 };
  const next = await applyProgramming(client, { action: 'window', screenId: 1, id: 20, window: off });
  assert.deepEqual(next.layers.find(l => l.id === 20).window, off);
  assert.deepEqual(mock.layers.find(l => l.layerId === 20).window, { x: -1000, y: 5050, width: 640, height: 360 });
  await assert.rejects(applyProgramming(client, { action: 'window', screenId: 1, id: 20, window: { ...off, x: 600000 } }), /Layer X/);
  await assert.rejects(applyProgramming(client, { action: 'window', screenId: 1, id: 20, window: { ...off, width: 200000 } }), /width/);
  client.configurationXml = '<File><path>deviceconfig/device/layer_2.xml</path><data><Window Support="1" Roam="1"/></data></File>';
  client.configurationPromise = Promise.resolve(null);
  await assert.rejects(applyProgramming(client, { action: 'window', screenId: 1, id: 20, window: off }), /Layer X/);
});

test('Take/Cut address every shown screen in one request', async t => {
  const { client, mock } = await fixture(t);
  await applyProgramming(client, { action: 'take', screenIds: [1, 2], time: 400 });
  assert.deepEqual(mock.writes.find(w => w.path === 'screen/take').body.map(b => [b.screenId, b.screenGuid, b.switchEffect.time]), [[1, 'main-screen', 400], [2, 'aux-screen', 400]]);
  await assert.rejects(applyProgramming(client, { action: 'cut', screenIds: [1, 99] }), /current screens/);
  await assert.rejects(applyProgramming(client, { action: 'cut', screenIds: [1, 1] }), /current screens/);
});

test('presets list, load, save from a scene, rename and delete with documented payloads', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  assert.deepEqual(state.presets.map(p => [p.serial, p.name, p.screens]), [[1, 'Opening', ['Main screen']]]);
  const posts = () => mock.writes.filter(w => w.path.startsWith('preset/'));
  await applyProgramming(client, { action: 'preset-load', guid: 'preset-a', target: 2 });
  assert.deepEqual(posts()[0], { path: 'preset/apply', method: 'POST', body: { serial: 1, presetId: 'preset-a', targetRegion: 2,
    auxiliary: { keyFrame: { enable: 1 }, switchEffect: { type: 1, time: 0 }, swapEnable: 1, effect: { enable: 1 } } } });
  state = await applyProgramming(client, { action: 'preset-save', name: 'Keynote', scene: 4, screenIds: [1] });
  const created = posts().find(w => w.path === 'preset/create').body;
  const pvw = mock.layers.filter(l => l.layerIdObj.attachScreenId === 1 && l.layerIdObj.sceneType === 4);
  assert.deepEqual(created, { serial: 2, name: 'Keynote', loadType: 1, type: 1, sourceRegion: 4, switchEffect: { time: 0, type: 0 }, params: ['3'],
    screens: [{ guid: 'main-screen', layers: pvw.map(l => ({ serial: l.serial, type: l.layerIdObj.type })) }], interfaces: [] });
  assert.ok(created.screens[0].layers.length > 0);
  assert.ok(state.presets.some(p => p.name === 'Keynote'));
  state = await applyProgramming(client, { action: 'preset-rename', guid: 'preset-2', name: 'Keynote B' });
  assert.deepEqual(posts().at(-1).body, [{ guid: 'preset-2', oldName: 'Keynote', name: 'Keynote B' }]);
  state = await applyProgramming(client, { action: 'preset-delete', guid: 'preset-a' });
  assert.deepEqual(posts().at(-1).body, ['preset-a']); assert.deepEqual(state.presets.map(p => p.name), ['Keynote B']);
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'preset-load', guid: 'missing', target: 4 }), /no longer exists/);
  await assert.rejects(applyProgramming(client, { action: 'preset-load', guid: 'preset-2', target: 3 }), /Unsupported/);
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: '', scene: 4, screenIds: [1] }), /1–64/);
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'x', scene: 4, screenIds: [] }), /Choose the screens/);
  assert.equal(mock.writes.length, writes);
});

test('stage geometry: free move/resize, snapping to edges and neighbours, centred drops', () => {
  const screen = { width: 1920, height: 1080 };
  assert.deepEqual(moveWindow({ x: 0, y: 0, width: 640, height: 360 }, -800, 2000), { x: -800, y: 2000, width: 640, height: 360 });
  assert.deepEqual(moveWindow({ x: 100, y: 100, width: 640, height: 360 }, 700, 0, 'nw'), { x: 676, y: 100, width: 64, height: 360 });
  assert.deepEqual(snapWindow({ x: 6, y: 1075 - 360, width: 640, height: 360 }, screen, [], 10), { x: 0, y: 720, width: 640, height: 360 });
  assert.deepEqual(snapWindow({ x: 648, y: 300, width: 640, height: 360 }, screen, [{ x: 0, y: 0, width: 640, height: 360 }], 10).x, 640);
  assert.deepEqual(snapWindow({ x: 0, y: 0, width: 1915, height: 360 }, screen, [], 10, 'se'), { x: 0, y: 0, width: 1920, height: 360 });
  // WO-023: native resolution, centred on the drop point, never scaled to the screen.
  assert.deepEqual(dropWindow({ width: 3840, height: 2160 }, screen, { x: 960, y: 540 }), { x: -960, y: -540, width: 3840, height: 2160 });
  assert.deepEqual(dropWindow({}, screen, { x: 100, y: 100 }), { x: -860, y: -440, width: 1920, height: 1080 });
  // Aspect-locked resize keeps the ratio and anchors the opposite corner.
  assert.deepEqual(moveWindow({ x: 0, y: 0, width: 1600, height: 900 }, 320, 0, 'se', 16 / 9), { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(moveWindow({ x: 100, y: 100, width: 1600, height: 900 }, 0, -90, 'nw', 16 / 9), { x: -60, y: 10, width: 1760, height: 990 });
  assert.deepEqual(snapWindow({ x: 0, y: 0, width: 1915, height: 1077 }, screen, [], 10, 'se', 16 / 9), { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(canvasOf(screen), { mx: 384, my: 216, width: 2688, height: 1512 });
});

test('disabled placeholder Main screens are hidden like PixelFlow and never reach the device (WO-018/019)', async t => {
  const { client, mock } = await fixture(t);
  const state = await readProgramming(client);
  assert.ok(!state.screens.some(s => s.id === 5), 'enable-0 Main screen hidden');
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'Spare', scene: 4, screenIds: [1, 5] }), /Choose the screens/);
  await assert.rejects(applyProgramming(client, { action: 'take', screenIds: [5] }), /current screens/);
  assert.equal(mock.writes.length, writes);
  // The mock enforces the device rule itself, so a regression that sends a disabled screen fails here.
  await assert.rejects(client.call('preset/create', { serial: 9, name: 'raw', screens: [{ guid: 'spare-screen', layers: [] }] }, { method: 'POST' }), /code 8210/);
});

test('screens are created enabled with the ucenter body, mapped with a reference interface, and delete leaves a hidden placeholder (WO-019)', async t => {
  const { client, mock } = await fixture(t);
  let state = await applyScreens(client, { action: 'create', name: 'Screen 3', type: 2 });
  const created = state.screens.find(s => s.name === 'Screen 3'); assert.ok(created);
  const body = mock.writes.find(w => w.path === 'screen/create-empty-screen').body;
  assert.deepEqual({ ...body, guid: typeof body.guid }, { type: 2, namePrefix: '', name: 'Screen 3', layout: { x: 0, y: 0 }, guid: 'string',
    CanvasList: null, snList: [client.serial], workMode: 0, createType: 0, operationType: 0, keyPosition: null });
  assert.equal(mock.screens.find(s => s.screenId === created.id).enable, 1);
  await assert.rejects(applyScreens(client, { action: 'create', name: 'Screen 3', type: 2 }), /already exists/);
  const output = state.outputs.find(o => o.role === 'Output' && !state.screens.some(s => s.outputs.some(x => x.id === o.id)));
  state = await applyScreens(client, { action: 'update', id: created.id, window: { x: 2900, y: 0, width: 1920, height: 1080 },
    outputs: [{ id: output.id, pos: { x: 0, y: 0, width: 1920, height: 1080 } }] });
  const mosaic = mock.writes.filter(w => w.path === 'screen/crop-mosaic').at(-1).body[0].mosaic;
  assert.equal(mosaic.interfaceId, output.id); assert.deepEqual(mosaic.outputs[0].area, [{ index: 0, x: 0, y: 0, width: 1920, height: 1080, enable: 1 }]);
  assert.equal(state.screens.find(s => s.id === created.id).outputs[0].pos.x, 2900);
  await assert.rejects(client.call('screen/crop-mosaic', [{ screenId: created.id, mosaic: { ...mosaic, interfaceId: 0 } }]), /code 8212/);
  state = await applyScreens(client, { action: 'delete', id: created.id });
  assert.ok(!state.screens.some(s => s.id === created.id)); assert.equal(mock.screens.find(s => s.screenId === created.id).enable, 0);
});

test('preset save picks a slot, refuses silent overwrite, overwrites on confirmation, rejects duplicate names (WO-022)', async t => {
  const { client, mock } = await fixture(t);
  let state = await applyProgramming(client, { action: 'preset-save', name: 'Wide', scene: 2, serial: 7, screenIds: [1] });
  assert.deepEqual(state.presets.map(p => [p.serial, p.name, p.sourceRegion]), [[1, 'Opening', 4], [7, 'Wide', 2]]);
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'Tight', scene: 4, serial: 1, screenIds: [1] }), /Slot 1 holds Opening/);
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'Wide', scene: 4, serial: 9, screenIds: [1] }), /already named Wide/);
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'Bad', scene: 4, serial: 129, screenIds: [1] }), /1–128/);
  assert.equal(mock.writes.length, writes);
  state = await applyProgramming(client, { action: 'preset-save', name: 'Tight', scene: 4, serial: 1, overwrite: true, screenIds: [1] });
  assert.deepEqual(state.presets.map(p => [p.serial, p.name, p.sourceRegion]), [[1, 'Tight', 4], [7, 'Wide', 2]]);
  assert.equal(mock.writes.filter(w => w.path === 'preset/create').at(-1).body.serial, 1);
});

test('PGM lock toggles pgmEdit and blocks PGM layer edits server-side; PVW stays editable (WO-022)', async t => {
  const { client, mock } = await fixture(t);
  let state = await applyProgramming(client, { action: 'pgm-lock', screenId: 1, locked: true });
  assert.equal(state.screens.find(s => s.id === 1).pgmLocked, true);
  assert.deepEqual(mock.writes.at(-1), { path: 'screen/pgm-edit', method: 'PUT', body: [{ screenId: 1, pgmEdit: 0 }] });
  const pgm = state.layers.find(l => l.screenId === 1 && l.scene === 2), pvw = state.layers.find(l => l.screenId === 1 && l.scene === 4);
  const writes = mock.writes.length, source = state.sources.find(s => s.type === 2);
  await assert.rejects(applyProgramming(client, { action: 'window', screenId: 1, id: pgm.id, window: { ...pgm.window, x: pgm.window.x + 10 } }), /PGM of Main screen is locked/);
  await assert.rejects(applyProgramming(client, { action: 'delete', screenId: 1, id: pgm.id }), /locked/);
  await assert.rejects(applyProgramming(client, { action: 'create', screenId: 1, scene: 2, source }), /locked/);
  assert.equal(mock.writes.length, writes);
  await applyProgramming(client, { action: 'window', screenId: 1, id: pvw.id, window: { ...pvw.window, x: pvw.window.x + 10 } });
  await applyProgramming(client, { action: 'take', screenIds: [1] });
  state = await applyProgramming(client, { action: 'pgm-lock', screenId: 1, locked: false });
  await applyProgramming(client, { action: 'window', screenId: 1, id: pgm.id, window: { ...pgm.window, x: pgm.window.x + 10 } });
});

test('new layers are created aspect-locked to the source; lock toggles; resource shortage is explained (WO-023)', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  const source = state.sources.find(s => s.type === 2 && s.width);
  state = await applyProgramming(client, { action: 'create', screenId: 1, scene: 4, source: { id: source.id, type: 2 },
    window: { x: -200, y: -100, width: source.width, height: source.height }, name: 'Native' });
  const body = mock.writes.filter(w => w.path === 'layers/create').at(-1).body;
  assert.deepEqual([body.locked, body.aspectRatio, body.window.width, body.window.height], [1, { aspectRatio: 8, locked: 1 }, source.width, source.height]);
  const created = state.layers.find(l => l.name === 'Native'); assert.equal(created.aspectLocked, true);
  state = await applyProgramming(client, { action: 'aspect', screenId: 1, id: created.id, locked: false });
  assert.deepEqual(mock.writes.at(-1).body, [{ layerId: created.id, aspectRatio: 8, locked: 0 }]);
  assert.equal(state.layers.find(l => l.id === created.id).aspectLocked, false);
  state = await applyProgramming(client, { action: 'aspect', screenId: 1, id: created.id, locked: true });
  assert.equal(state.layers.find(l => l.id === created.id).aspectLocked, true);
  const other = state.sources.find(s => s.type === 2 && s.id !== source.id);
  state = await applyProgramming(client, { action: 'source', screenId: 1, id: created.id, source: { id: other.id, type: 2 } });
  assert.equal(state.layers.find(l => l.id === created.id).sourceId, other.id, 'drop-on-layer swaps the source in place');
  mock.behavior.resourceShort = true;
  await assert.rejects(applyProgramming(client, { action: 'source', screenId: 1, id: created.id, source: { id: source.id, type: 2 } }), /no free layer resources/);
  await assert.rejects(applyProgramming(client, { action: 'create', screenId: 1, scene: 4, source: { id: source.id, type: 2 } }), /no free layer resources/);
});

test('layer keyframe and aspect presets write PixelFlow bodies with readback; invalid values write nothing (WO-024)', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  const layer = state.layers.find(l => l.screenId === 1 && l.scene === 4);
  assert.deepEqual(layer.keyFrame, { enable: 0, speedType: 3, startTime: 0, animationTime: 1000 });
  state = await applyProgramming(client, { action: 'keyframe', screenId: 1, id: layer.id, keyFrame: { enable: 1, speedType: 0, animationTime: 500 } });
  assert.deepEqual(mock.writes.at(-1).body, [{ layerId: layer.id, keyFrame: { enable: 1, speedType: 0, startTime: 0, animationTime: 500 } }]);
  assert.equal(state.layers.find(l => l.id === layer.id).keyFrame.animationTime, 500);
  state = await applyProgramming(client, { action: 'aspect', screenId: 1, id: layer.id, mode: 3, locked: true });
  assert.deepEqual(mock.writes.at(-1).body, [{ layerId: layer.id, aspectRatio: 3, locked: 1 }]);
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'keyframe', screenId: 1, id: layer.id, keyFrame: { animationTime: 0 } }), /animationTime/);
  await assert.rejects(applyProgramming(client, { action: 'keyframe', screenId: 1, id: layer.id, keyFrame: { speed: 1 } }), /Unsupported/);
  await assert.rejects(applyProgramming(client, { action: 'aspect', screenId: 1, id: layer.id, mode: 6 }), /Unsupported/);
  assert.equal(mock.writes.length, writes);
});

test('relative presets store chosen layers and parameter groups; load flags follow PixelFlow (WO-024)', async t => {
  const { client, mock } = await fixture(t);
  const state = await readProgramming(client);
  const pvw = state.layers.filter(l => l.screenId === 1 && l.scene === 4);
  await applyProgramming(client, { action: 'preset-save', name: 'Rel', scene: 4, serial: 5, relative: true, params: ['3-3', '3-4', '3-12'], layerIds: [pvw[0].id], screenIds: [1, 2] });
  const body = mock.writes.filter(w => w.path === 'preset/create').at(-1).body;
  assert.deepEqual([body.loadType, body.params, body.screens.length, body.screens[0].layers.map(l => l.serial)], [2, ['3-3', '3-4', '3-12'], 1, [mock.layers.find(l => l.layerId === pvw[0].id).serial]]);
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'R2', scene: 4, relative: true, params: [], layerIds: [pvw[0].id], screenIds: [1] }), /settings a relative/);
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'R2', scene: 4, relative: true, params: ['3-9'], layerIds: [], screenIds: [1] }), /Choose the layers/);
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'R2', scene: 4, relative: true, params: ['9-9'], layerIds: [pvw[0].id], screenIds: [1] }), /settings a relative/);
  assert.equal(mock.writes.length, writes);
  await applyProgramming(client, { action: 'preset-load', guid: 'preset-5', target: 2, keyframes: true, effect: true, time: 800 });
  assert.deepEqual(mock.writes.at(-1).body.auxiliary, { keyFrame: { enable: 0 }, switchEffect: { type: 1, time: 800 }, swapEnable: 1, effect: { enable: 0 } });
  await applyProgramming(client, { action: 'preset-load', guid: 'preset-5', target: 2, keyframes: true, effect: false });
  assert.equal(mock.writes.at(-1).body.auxiliary.keyFrame.enable, 1, 'keyframes only run with the take effect');
});

test('auto-take loads to PVW, waits for the stored layout, then takes the preset screens; no Take without confirmation (WO-024)', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  const layer = state.layers.find(l => l.screenId === 1 && l.scene === 4);
  await applyProgramming(client, { action: 'window', screenId: 1, id: layer.id, window: { ...layer.window, x: 300 } });
  await applyProgramming(client, { action: 'preset-save', name: 'Look', scene: 4, serial: 6, screenIds: [1] });
  await applyProgramming(client, { action: 'window', screenId: 1, id: layer.id, window: { ...layer.window, x: 900 } });
  mock.behavior.presetApplyDelay = 600;
  state = await applyProgramming(client, { action: 'preset-autotake', guid: 'preset-6', time: 400 });
  const apply = mock.writes.findLastIndex(w => w.path === 'preset/apply'), take = mock.writes.findLastIndex(w => w.path === 'screen/take');
  assert.ok(apply >= 0 && take > apply, 'apply then take');
  assert.equal(mock.writes[apply].body.targetRegion, 4);
  assert.deepEqual(mock.writes[take].body.map(b => [b.screenId, b.switchEffect.time]), [[1, 400]]);
  assert.ok(state.autoTake.loadedMs >= 500, 'waited for the delayed load');
  mock.behavior.presetApplyDelay = 0; mock.behavior.ignorePresetApply = true;
  await applyProgramming(client, { action: 'window', screenId: 1, id: layer.id, window: { ...layer.window, x: 1200 } });
  const takes = mock.writes.filter(w => w.path === 'screen/take').length;
  await assert.rejects(applyProgramming(client, { action: 'preset-autotake', guid: 'preset-6' }), /not confirmed.*Take was not sent/);
  assert.equal(mock.writes.filter(w => w.path === 'screen/take').length, takes);
});

test('layer panel geometry helpers: align, fill output, native 1:1 (WO-024)', async () => {
  const { alignWindow, outputTile, nativeWindow } = await import('../public/layer-inspector.js');
  const screen = { x: -100, y: 50, width: 3840, height: 1080, outputs: [
    { pos: { x: -100, y: 50, width: 1920, height: 1080 } }, { pos: { x: 1820, y: 50, width: 1920, height: 1080 } }] };
  const w = { x: 2500, y: 300, width: 640, height: 360 };
  assert.deepEqual(alignWindow(w, screen, 'left'), { ...w, x: 0 });
  assert.deepEqual(alignWindow(w, screen, 'right'), { ...w, x: 3200 });
  assert.deepEqual(alignWindow(w, screen, 'bottom'), { ...w, y: 720 });
  assert.deepEqual(alignWindow(w, screen, 'center'), { ...w, x: 1600, y: 360 });
  assert.deepEqual(outputTile(w, screen), { x: 1920, y: 0, width: 1920, height: 1080 }, 'tile under the layer centre');
  assert.equal(outputTile(w, { ...screen, outputs: [] }), null);
  assert.deepEqual(nativeWindow(w, { width: 1280, height: 720 }), { x: 2180, y: 120, width: 1280, height: 720 });
  assert.equal(nativeWindow(w, { width: null }), null);
});
