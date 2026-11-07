import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { normaliseInputs, readInputs, applyInputs, planInputs } from '../lib/inputs.js';
import { createMockDevice } from '../test-support/mock-p20.js';
import { createApp } from '../server.js';

const close = (server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
const edid = { width: 3840, height: 2160, frame: 30, standardType: 6, interlaced: 0 };

test('P10 maps four HDMI/DP inputs and two SDI inputs, excluding optical/output connectors', () => {
  const mock = createMockDevice({ model: 'P10' });
  const rows = normaliseInputs(mock.interfaces, mock.cards, 'P10');
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row.label), ['Input 1', 'Input 2', 'Input 3', 'Input 4', 'Input 5', 'Input 6']);
  assert.ok(rows.slice(0, 4).every((row) => row.slotId === 100 && !row.fixedPort));
  assert.ok(rows.slice(4).every((row) => row.slotId === 0 && row.family === 'SDI' && !row.supportsEdid));
  assert.deepEqual(rows.slice(4).map((row) => row.ports.map((port) => port.index)), [[0, 1], [2, 3]]);
});
test('P80 uses installed input interfaces, supports DP 1.4, and preserves managed capacities', () => {
  const mock = createMockDevice({ model: 'P80' });
  const rows = normaliseInputs(mock.interfaces, mock.cards, 'P80');
  assert.equal(rows.length, 16);
  assert.ok(rows.every((row) => row.slotId !== 2 && row.ports.length === 1 && row.fixedPort));
  assert.equal(rows[8].ports[0].label, 'DP 1.4'); assert.equal(rows[8].supportsEdid, true);
  assert.equal(rows[12].family, 'SDI'); assert.equal(rows[12].supportsEdid, false);
  assert.equal(rows[15].capacity, 255); assert.equal(rows[15].capacityEditable, false);
  const change = { key: rows[15].key, portKey: rows[15].portKey, capacity: 255, name: 'SDI managed' };
  assert.equal(planInputs([change], { inputs: rows }).length, 1);
  assert.throws(() => planInputs([{ ...change, capacity: 2 }], { inputs: rows }), /supported capacity/);
  // Removed/offline card interfaces must not leave invented rows behind.
  assert.equal(normaliseInputs(mock.interfaces.filter((input) => input.interfaceIdObj.slotId !== 1), mock.cards, 'P80').length, 8);
});

for (const model of ['P10', 'P80']) test(`${model} input-only HTTP connection, batch apply and MVR guard`, async (t) => {
  const mock = createMockDevice({ model }), devicePort = await listen(mock.server), app = createApp(), appPort = await listen(app);
  t.after(async () => { await close(app); await close(mock.server); });
  const base = `http://127.0.0.1:${appPort}/api/`;
  const send = (path, body, method = 'PUT') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await send('connect', { host: '127.0.0.1', apiPort: devicePort }, 'POST');
  assert.equal(response.status, 200);
  const connected = await response.json();
  assert.equal(connected.device.model, model); assert.equal(connected.capabilities.mvr, false);
  assert.deepEqual(connected.screens, []); assert.deepEqual(connected.layers, []);
  assert.ok(mock.requests.every((request) => !request.path.startsWith('screen/') && !request.path.startsWith('layers/')));
  const state = await (await fetch(base + `inputs?session=${connected.session}`)).json();
  assert.equal(state.inputs.length, model === 'P10' ? 6 : 16);
  const output = structuredClone(mock.cards.find((card) => card.cardType === 2));
  const optical = structuredClone(model === 'P10' ? mock.cards[1].connectors.filter((port) => port.index >= 4) : []);
  const originalModes = mock.cards.flatMap((card) => card.connectors.map((port) => ({ slot: card.slotId, index: port.index, mode: port.workMode })));
  const changes = state.inputs.map((row) => ({ key: row.key,
    portKey: model === 'P10' && !row.fixedPort ? row.ports[0].key : row.portKey,
    capacity: row.capacityEditable ? 2 : row.capacity, name: `${model} source ${row.number}`,
    ...(row.supportsEdid ? { edid } : {}),
  }));
  const applied = await send('inputs', { session: connected.session, changes });
  assert.equal(applied.status, 200);
  const updated = await applied.json();
  assert.ok(updated.inputs.every((row) => row.ports.find((port) => port.key === row.portKey).name === `${model} source ${row.number}`));
  assert.deepEqual(mock.cards.find((card) => card.cardType === 2), output);
  if (model === 'P10') assert.deepEqual(mock.cards[1].connectors.filter((port) => port.index >= 4), optical);
  else assert.deepEqual(mock.cards.flatMap((card) => card.connectors.map((port) => ({ slot: card.slotId, index: port.index, mode: port.workMode }))), originalModes);
  const timings = mock.writes.find((write) => write.path === 'interface/preset-thumb-timing').body;
  assert.equal(timings.length, model === 'P10' ? 4 : 12);
  assert.ok(timings.every((timing) => mock.interfaces.find((input) => input.interfaceId === timing.interfaceId).type !== 13));
  const before = mock.writes.length;
  assert.equal((await send('windows', { session: connected.session, changes: [{ id: 10, window: { x: 0, y: 0, width: 640, height: 360 } }] })).status, 403);
  assert.equal(mock.writes.length, before);
});
test('verified discovery model selects P80 without querying MVR endpoints', async () => {
  const calls = [];
  const client = new PixelhueClient(async (request) => {
    calls.push(request.path);
    if (request.path.endsWith('device-list')) return { data: { list: [
      { SN: 'OTHER', ip: '192.168.0.99', modelId: 28944, protocols: [{ linkType: 'http', port: 1234 }] },
      { SN: 'P80', ip: '192.168.0.10', modelId: 30006, protocols: [{ linkType: 'http', port: 1234 }] },
    ] } };
    if (request.path.endsWith('open-detail')) return { data: { sn: 'P80', startTime: '12345' } };
    throw new Error('Unexpected model or MVR request');
  });
  assert.equal((await client.connect({ host: '192.168.0.10' })).device.model, 'P80');
  assert.equal(calls.length, 2);
});
test('unsupported models are rejected before MVR reads or writes', async () => {
  const calls = [];
  const client = new PixelhueClient(async (request) => {
    calls.push(request.path);
    return request.path.endsWith('open-detail') ? { data: { sn: 'OTHER', startTime: '12345' } } : { data: { configInfo: { modeId: 999 } } };
  });
  await assert.rejects(client.connect({ host: '127.0.0.1', apiPort: 1234 }), /Unsupported device model/);
  assert.deepEqual(calls, ['/unico/v1/node/open-detail', '/unico/v1/node/detail?nodeId=1']);
});
