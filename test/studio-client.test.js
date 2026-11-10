import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readDevice, applyDevice } from '../lib/studio-device.js';
import { readOutputs, applyOutputs } from '../lib/studio-outputs.js';
import { readScreens, applyScreens } from '../lib/studio-screens.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { createMockStudio } from '../test-support/mock-studio.js';
import { createApp } from '../server.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t, model = 'P20') {
  const mock = createMockStudio({ model }), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); const state = await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, port, state };
}

test('device-specific setup uses advertised mode choices and verifies writes, preserving other genlock fields', async t => {
  const { client, mock } = await fixture(t);
  const before = await readDevice(client);
  assert.deepEqual(before.options.workModes.map(m => m.value), [4, 8]); assert.deepEqual(before.options.fanModes, [1, 2]);
  assert.equal(before.node.name, 'Studio device'); assert.ok(before.inputs.length);
  const state = await applyDevice(client, { name: 'Control desk', beacon: 1, fanMode: 1, layerMode: 1,
    genlock: { type: 2, sourceId: before.inputs[0].id } });
  assert.equal(state.node.name, 'Control desk'); assert.equal(state.node.beacon, 1); assert.equal(state.node.fanMode, 1);
  assert.deepEqual(mock.node.genlock.phase, { enable: 0 });
  const writes = mock.writes.length;
  await assert.rejects(applyDevice(client, { name: 'Must not write', workMode: 8 }), /Confirm the mode change/);
  await assert.rejects(applyDevice(client, { fanMode: 99 }), /Unsupported/);
  assert.equal(mock.writes.length, writes);
  assert.equal((await applyDevice(client, { workMode: 8, confirmModeChange: true })).node.mode.workMode, 8);
  mock.behavior.ignoreSetup = true;
  await assert.rejects(applyDevice(client, { name: 'Ignored' }), /did not retain/);
});

test('outputs enumerate physical Main/AUX/MVR ports, protect copies and batch timing/name/color settings', async t => {
  const { client, mock } = await fixture(t);
  const state = await readOutputs(client), primary = state.outputs.find(o => o.id === mock.primary.interfaceId);
  assert.ok(state.outputs.some(o => o.role === 'MVR')); assert.ok(state.outputs.some(o => o.role === 'AUX'));
  const copied = state.outputs.find(o => o.workMode === 1); assert.equal(copied.timingEditable, false);
  const timing = { width: 1920, height: 1080, frame: 50, standardType: 6, interlaced: 0 };
  await assert.rejects(applyOutputs(client, [{ id: copied.id, timing }]), /fixed\/copy timing/);
  await assert.rejects(applyOutputs(client, [{ id: mock.interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2).interfaceId, name: 'No' }]), /Unknown/);
  assert.equal(mock.writes.length, 0);
  const next = await applyOutputs(client, [{ id: primary.id, name: 'Projector', timing, colorDepth: 10, hdcp: 1, testPattern: 1 }]);
  const actual = next.outputs.find(o => o.id === primary.id); assert.equal(actual.name, 'Projector'); assert.deepEqual(actual.timing, timing);
  assert.equal(actual.hdcp, 1); assert.equal(actual.testPattern, 1);
  assert.equal(mock.primary.testPattern.grid, 7); assert.equal(mock.primary.testPattern.type, 5);
  assert.equal(mock.writes.find(w => w.path === 'interface/preset-thumb-timing').body[0].presetThumbTiming.timingSelect, 3);
  mock.behavior.ignoreEdid = true;
  await assert.rejects(applyOutputs(client, [{ id: primary.id, timing: { ...timing, frame: 60 } }]), /did not retain/);
});

test('screen creation/mapping uses actual output IDs, protects MVR and rejects conflicting owners and out-of-bounds tiles', async t => {
  const { client, mock } = await fixture(t);
  let state = await readScreens(client); assert.ok(state.screens.every(s => s.type !== 8));
  await assert.rejects(applyScreens(client, { action: 'delete', id: 8 }), /no longer exists/);
  const tile = { id: mock.primary.interfaceId, pos: { x: 0, y: 0, width: 1920, height: 1080 } };
  state = await applyScreens(client, { action: 'update', id: 1, window: { x: -100, y: 50, width: 1920, height: 1080 }, outputs: [tile] });
  assert.equal(state.screens.find(s => s.id === 1).outputs[0].pos.x, -100);
  await assert.rejects(applyScreens(client, { action: 'update', id: 2, window: { x: 0, y: 0, width: 1920, height: 1080 }, outputs: [tile] }), /matching Main\/AUX/);
  const count = state.screens.length;
  state = await applyScreens(client, { action: 'create', name: 'Stage', type: 2 }); assert.equal(state.screens.length, count + 1);
  const created = state.screens.find(s => s.name.startsWith('Stage'));
  await assert.rejects(applyScreens(client, { action: 'update', id: created.id, window: { x: 0, y: 0, width: 1920, height: 1080 }, outputs: [tile] }), /belongs to/);
  state = await applyScreens(client, { action: 'freeze', id: created.id, enable: 1 }); assert.equal(state.screens.find(s => s.id === created.id).freeze, 1);
  state = await applyScreens(client, { action: 'ftb', id: created.id, enable: 1 }); assert.equal(state.screens.find(s => s.id === created.id).ftb, 1);
  state = await applyScreens(client, { action: 'delete', id: created.id }); assert.ok(!state.screens.some(s => s.id === created.id));
  assert.ok(mock.screens.some(s => s.screenId === 8), 'MVR is untouched');
});

test('programming routes translate global origins and support creation/source/stacking/transitions without MVR writes', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client); assert.ok(state.layers.every(l => l.type !== 8));
  const layer = state.layers.find(l => l.id === 20); assert.equal(layer.window.x, 20); assert.equal(layer.window.y, 20);
  state = await applyProgramming(client, { action: 'window', screenId: 1, id: 20, window: { x: 40, y: 60, width: 640, height: 360 } });
  assert.equal(mock.layers.find(l => l.layerId === 20).window.x, -60); assert.equal(mock.layers.find(l => l.layerId === 20).window.y, 110);
  const before = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'window', screenId: 1, id: 10, window: { x: 0, y: 0, width: 640, height: 360 } }), /no longer exists/);
  assert.equal(mock.writes.length, before);
  const source = state.sources.find(s => s.type === 2);
  state = await applyProgramming(client, { action: 'create', screenId: 1, scene: 4, source, name: 'Camera' });
  const created = state.layers.find(l => l.name === 'Camera'); assert.ok(created); assert.equal(created.scene, 4); assert.equal(created.window.x, 0);
  await applyProgramming(client, { action: 'source', screenId: 1, id: created.id, source: { type: 3, id: 2 } });
  await applyProgramming(client, { action: 'zorder', screenId: 1, id: created.id, to: 3 });
  await applyProgramming(client, { action: 'take', screenId: 1, time: 300, swap: false });
  await applyProgramming(client, { action: 'cut', screenId: 1 });
  assert.deepEqual(mock.writes.find(w => w.path === 'screen/take').body[0].switchEffect, { type: 1, time: 300 });
  assert.equal(mock.writes.find(w => w.path === 'screen/cut').body[0].swapEnable, 1);
  state = await applyProgramming(client, { action: 'delete', screenId: 1, id: created.id }); assert.ok(!state.layers.some(l => l.id === created.id));
});

test('full-client HTTP resources preserve origin/session guards and discovery is separate from connection', async t => {
  const { mock, port } = await fixture(t);
  const app = createApp({ discover: async () => ({ devices: [{ host: '127.0.0.1', apiPort: port, model: 'P20', serial: 'P20-MOCK' }] }) });
  const appPort = await listen(app); t.after(() => close(app)); const url = `http://127.0.0.1:${appPort}/api/`;
  const discovery = await (await fetch(url + 'discovery')).json(); assert.equal(discovery.devices.length, 1);
  assert.equal((await fetch(url + 'device?session=wrong')).status, 409);
  const connect = await (await fetch(url + 'connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', apiPort: port }) })).json();
  for (const resource of ['device', 'outputs', 'screens', 'programming', 'input-advanced']) {
    assert.equal((await fetch(url + `${resource}?session=${connect.session}`)).status, 200);
    assert.equal((await fetch(url + `${resource}?session=wrong`)).status, 409);
  }
  const before = mock.writes.length;
  const write = (headers, session) => fetch(url + 'device', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ session, changes: { name: 'Not authorized' } }) });
  assert.equal((await write({}, 'wrong')).status, 409);
  assert.equal((await write({ Origin: 'http://unrelated.example' }, connect.session)).status, 403); assert.equal(mock.writes.length, before);
});
