import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { moveWindow, snapWindow, dropWindow } from '../public/program-stage.js';
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
    auxiliary: { keyFrame: { enable: 1 }, switchEffect: { type: 0, time: 0 }, swapEnable: 1, effect: { enable: 1 } } } });
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
  assert.deepEqual(dropWindow({ width: 3840, height: 2160 }, screen, { x: 960, y: 540 }), { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(dropWindow({}, screen, { x: 100, y: 100 }), { x: -380, y: -170, width: 960, height: 540 });
});

test('disabled screens (enable 0) are skipped by preset save and Take/Cut, never sent to the device (WO-018)', async t => {
  const { client, mock } = await fixture(t);
  const state = await readProgramming(client);
  assert.equal(state.screens.find(s => s.id === 5).enabled, false);
  const saved = await applyProgramming(client, { action: 'preset-save', name: 'Mixed', scene: 4, screenIds: [1, 5] });
  assert.deepEqual(saved.skipped, ['Spare screen']);
  assert.deepEqual(mock.writes.find(w => w.path === 'preset/create').body.screens.map(s => s.guid), ['main-screen']);
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'preset-save', name: 'Spare only', scene: 4, screenIds: [5] }), /Spare screen is disabled on the device/);
  await assert.rejects(applyProgramming(client, { action: 'take', screenIds: [5] }), /disabled on the device/);
  assert.equal(mock.writes.length, writes);
  await applyProgramming(client, { action: 'cut', screenIds: [1, 5] });
  assert.deepEqual(mock.writes.at(-1).body.map(b => b.screenId), [1]);
  // The mock enforces the device rule itself, so a regression that sends a disabled screen fails here.
  await assert.rejects(client.call('preset/create', { serial: 9, name: 'raw', screens: [{ guid: 'spare-screen', layers: [] }] }, { method: 'POST' }), /code 8210/);
});
