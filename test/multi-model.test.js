import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
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

// WO-042: the P80 exposes its MVR outputs like the P20/Q8 (proven on hardware by HighAsCG WO-1042); only the P10 stays input-only.
for (const model of ['P10', 'P80']) test(`${model} HTTP connection, batch input apply and MVR ${model === 'P10' ? 'guard' : 'editing'}`, async (t) => {
  const mock = createMockDevice({ model }), devicePort = await listen(mock.server), app = createApp(), appPort = await listen(app);
  t.after(async () => { await close(app); await close(mock.server); });
  const base = `http://127.0.0.1:${appPort}/api/`;
  const send = (path, body, method = 'PUT') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await send('connect', { host: '127.0.0.1', apiPort: devicePort }, 'POST');
  assert.equal(response.status, 200);
  const connected = await response.json();
  assert.equal(connected.device.model, model); assert.equal(connected.capabilities.mvr, model === 'P80');
  if (model === 'P10') {
    assert.deepEqual(connected.screens, []); assert.deepEqual(connected.layers, []);
    assert.ok(mock.requests.every((request) => !request.path.startsWith('screen/') && !request.path.startsWith('layers/')));
  } else {
    assert.deepEqual(connected.screens.map((screen) => [screen.id, screen.width, screen.height]), [[8, 1920, 1080]]);
    assert.deepEqual(connected.layers.map((layer) => layer.id), [10]);
  }
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
  const moved = await send('windows', { session: connected.session, changes: [{ id: 10, window: { x: 0, y: 0, width: 640, height: 360 } }] });
  if (model === 'P10') { assert.equal(moved.status, 403); assert.equal(mock.writes.length, before); return; }
  // No 512 × 480 input-window cap on the P80 (P10/P20 only); the move is written and read back.
  assert.equal(moved.status, 200);
  assert.deepEqual((await moved.json()).layers.find((layer) => layer.id === 10).window, { x: 0, y: 0, width: 640, height: 360 });
  assert.deepEqual(mock.layers.find((layer) => layer.layerId === 10).window, { x: 0, y: 0, width: 640, height: 360 });
  const templates = await (await fetch(base + `mvr-templates?session=${connected.session}`)).json();
  assert.ok(!('error' in templates));
});
test('verified discovery model selects the P80 at the entered address and reads its MVR lists', async () => {
  const calls = [];
  const client = new PixelhueClient(async (request) => {
    calls.push(`${request.host}${request.path}`);
    if (request.path.endsWith('device-list')) return { data: { list: [
      { SN: 'OTHER', ip: '192.168.0.99', modelId: 28944, protocols: [{ linkType: 'http', port: 1234 }] },
      { SN: 'P80', ip: '192.168.0.10', modelId: 30006, protocols: [{ linkType: 'http', port: 1234 }] },
    ] } };
    if (request.path.endsWith('open-detail')) return { data: { sn: 'P80', startTime: '12345' } };
    if (request.path.endsWith('node/config-file?nodeId=1&para=0')) return '';
    if (/\/(screen|layers|interface)\/list-detail$/.test(request.path)) return { data: { list: [] } };
    throw new Error('Unexpected model request');
  });
  const state = await client.connect({ host: '192.168.0.10' });
  assert.equal(state.device.model, 'P80'); assert.equal(state.capabilities.mvr, true);
  // WO-042: the P80 reads screens, layers and interfaces like the P20; the other listed switcher is never contacted.
  for (const list of ['screen', 'layers', 'interface']) assert.ok(calls.includes(`192.168.0.10/unico/v1/${list}/list-detail`));
  assert.ok(calls.every(call => call.startsWith('192.168.0.10/')));
});
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const tokenFor = (startTime, unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ SN: 'P80' })}`) => `${unsigned}.${createHmac('sha256', String(startTime)).update(unsigned).digest('base64url')}`;
test('a restarted device gets a fresh token and the refused call is repeated once; plain refusals are not repeated (WO-042)', async () => {
  let startTime = '100', puts = 0, opens = 0;
  const client = new PixelhueClient(async (request) => {
    if (request.path.endsWith('open-detail')) { opens++; return { data: { sn: 'P80', startTime, modelId: 30006 } }; }
    if (request.path.endsWith('node/config-file?nodeId=1&para=0')) return '';
    if (request.path.endsWith('list-detail')) return { data: { list: [] } };
    if (request.method === 'PUT') puts++;
    if (request.token !== tokenFor(startTime)) throw Object.assign(new Error(`Device rejected ${request.path}: token invalid (code 401).`), { status: 502 });
    if (request.path.endsWith('layers/opacity')) throw Object.assign(new Error(`Device rejected ${request.path}: manage param invalid (code 8210).`), { status: 502 });
    return { code: 0, data: {} };
  });
  await client.connect({ host: '127.0.0.1', apiPort: 1234 });
  const first = client.token; assert.equal(first, tokenFor('100'));
  await client.call('layers/window', [{ layerId: 1 }]);
  assert.equal(puts, 1); assert.equal(opens, 1);
  startTime = '200';
  await client.call('layers/window', [{ layerId: 1 }]);
  assert.equal(client.token, tokenFor('200')); assert.equal(puts, 3); assert.equal(opens, 2);
  // Same startTime: a refusal is reported as-is and the write is not sent twice.
  await assert.rejects(client.call('layers/opacity', [{ layerId: 1, opacity: 40 }]), /8210/);
  assert.equal(puts, 4);
  // An unreachable device is not probed again.
  const before = opens; client.transport = async () => { throw Object.assign(new Error('Device request timed out at x.'), { status: 504 }); };
  await assert.rejects(client.call('layers/window', [{ layerId: 1 }]), /timed out/); assert.equal(opens, before);
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
