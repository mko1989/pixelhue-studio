import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { normaliseInputs, planInputs, modePayload, readInputs, applyInputs } from '../lib/inputs.js';
import { createMockP20 } from '../test-support/mock-p20.js';
import { createApp } from '../server.js';

const edid = { width: 3840, height: 2160, frame: 59.94, standardType: 6, interlaced: 0 };
const change = () => ({ key: '100:0', portKey: '8:0', capacity: 2, name: 'Camera 1', edid: { ...edid } });
const close = (server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

test('all twelve P20 inputs include HDMI/DP and SDI groups, excluding outputs and optical ports', () => {
  const mock = createMockP20();
  const inputs = normaliseInputs(mock.interfaces, mock.cards);
  assert.equal(inputs.length, 12); assert.equal(inputs.reduce((sum, row) => sum + row.ports.length, 0), 24);
  assert.deepEqual(inputs.map((row) => row.label), Array.from({ length: 12 }, (_, i) => `Input ${i + 1}`));
  assert.deepEqual(inputs[0].ports.map((port) => [port.index, port.type]), [[0, 8], [1, 6]]);
  assert.equal(inputs[6].slotId, 1); assert.equal(inputs[0].portKey, '6:1');
  assert.ok(inputs.slice(0, 8).every((row) => row.supportsEdid && row.ports.every((port) => [6, 8].includes(port.type))));
  assert.ok(inputs.slice(8).every((row) => row.slotId === 3 && row.fixedPort && !row.supportsEdid && row.ports.every((port) => port.type === 13)));
  assert.deepEqual(inputs.slice(8).map((row) => row.ports.map((port) => port.index)), [[0, 1], [2, 3], [4, 5], [6, 7]]);
});
test('input plans validate port membership, names, capacities and floating-point Hz before any write', () => {
  const mock = createMockP20(), state = { inputs: normaliseInputs(mock.interfaces, mock.cards), cards: mock.cards };
  assert.equal(planInputs([change()], state)[0].edid.frame, 59.94);
  for (const patch of [{ key: '2:0' }, { portKey: '6:9' }, { capacity: 255 }, { capacity: '2' }, { name: '' },
    { name: 'ą'.repeat(17) }, { edid: { ...edid, frame: 5994 } }, { edid: { ...edid, width: -1 } }, { edid: { ...edid, width: '3840' } }]) {
    assert.throws(() => planInputs([{ ...change(), ...patch }], state));
  }
  assert.throws(() => planInputs([change(), change()], state), /duplicate/);
  const payload = modePayload(planInputs([change()], state), state);
  assert.equal(payload.nodeId, 1); assert.equal(payload.subcards.length, 1);
  assert.deepEqual(payload.subcards[0].connectors.map((port) => [port.index, port.type, port.workMode, port.capacityMode]), [[0, 8, 0, 2], [1, 6, 2, 2]]);
  assert.ok(payload.subcards[0].connectors.every((port) => !('interfaceId' in port)));
});
test('SDI rejects EDID and rerouting, while accepting a batch covering all twelve inputs', () => {
  const mock = createMockP20(), state = { inputs: normaliseInputs(mock.interfaces, mock.cards), cards: mock.cards };
  const sdi = { key: '3:0', portKey: '13:0', capacity: 2, name: 'SDI camera' };
  assert.throws(() => planInputs([{ ...sdi, edid }], state), /SDI does not support EDID/);
  assert.throws(() => planInputs([{ ...sdi, portKey: '13:1' }], state), /routing is fixed/);
  const changes = state.inputs.map((row) => ({ key: row.key, portKey: row.portKey, capacity: row.capacity, name: row.label }));
  assert.equal(planInputs(changes, state).length, 12);
  assert.throws(() => planInputs([...changes, sdi], state), /1–12/);
  const connectors = modePayload(planInputs([sdi], state), state).subcards[0].connectors;
  assert.deepEqual(connectors.map((port) => [port.index, port.type, port.workMode, port.capacityMode]), [[0, 13, 0, 2], [1, 13, 2, 2]]);
});
test('input HTTP integration: exact mode/name/EDID writes, refreshed IDs, resource failures and readback', async (t) => {
  const mock = createMockP20(), port = await listen(mock.server);
  const client = new PixelhueClient(); await client.connect({ host: '127.0.0.1', apiPort: port });
  const app = createApp(), appPort = await listen(app);
  t.after(async () => { await close(app); await close(mock.server); });
  await t.test('lists all active and inactive input ports', async () => {
    const state = await readInputs(client); assert.equal(state.inputs.length, 12);
    assert.equal(state.inputs[0].ports[0].workMode, 2); assert.equal(state.inputs[0].ports[1].name, 'Port 100-1');
  });
  await t.test('resource assessment prevents every write when capacity is exhausted', async () => {
    mock.behavior.assessmentState = 1;
    await assert.rejects(applyInputs(client, [change()]), /insufficient resources/);
    assert.equal(mock.writes.length, 0); mock.behavior.assessmentState = 0;
  });
  await t.test('switches port and capacity before names/EDID, using regenerated interface IDs', async () => {
    mock.behavior.regenerateIds = true;
    const untouchedMain = structuredClone(mock.cards[0].connectors.slice(2));
    const untouchedOutput = structuredClone(mock.cards[3]);
    const state = await applyInputs(client, [change()]);
    const row = state.inputs[0], selected = row.ports.find((port) => port.key === row.portKey);
    assert.equal(row.portKey, '8:0'); assert.equal(row.capacity, 2); assert.equal(selected.name, 'Camera 1');
    assert.equal(selected.edid.frame, 59.94);
    assert.deepEqual(mock.writes.map((write) => write.path), ['node/subcard/mode', 'interface/general', 'interface/preset-thumb-timing']);
    assert.equal(mock.writes[1].body[0].interfaceId, selected.id);
    assert.deepEqual(mock.writes[2].body, [{ interfaceId: selected.id, presetThumbTiming: { ...edid, timingSelect: 0 } }]);
    assert.deepEqual(mock.cards[0].connectors.slice(2), untouchedMain); assert.deepEqual(mock.cards[3], untouchedOutput);
    mock.behavior.regenerateIds = false;
  });
  await t.test('renaming alone does not rewrite capacity, ports or EDIDs', async () => {
    const before = mock.writes.length;
    await applyInputs(client, [{ key: '100:0', portKey: '8:0', capacity: 2, name: 'Renamed' }]);
    assert.deepEqual(mock.writes.slice(before).map((write) => write.path), ['interface/general']);
  });
  await t.test('firmware write rejection is surfaced', async () => {
    mock.behavior.rejectPath = 'interface/general';
    await assert.rejects(applyInputs(client, [{ key: '100:0', portKey: '8:0', capacity: 2, name: 'Rejected' }]), /Rejected by firmware/);
    mock.behavior.rejectPath = '';
  });
  await t.test('ignored EDID changes fail verification and include actual readback', async () => {
    mock.behavior.ignoreEdid = true;
    await assert.rejects(applyInputs(client, [{ key: '100:0', portKey: '8:0', capacity: 2, edid: { ...edid, frame: 50 } }]), (error) => error.status === 409 && Boolean(error.snapshot.inputs));
    mock.behavior.ignoreEdid = false;
  });
  await t.test('server input routes require connection and matching session', async () => {
    const base = `http://127.0.0.1:${appPort}/api/`;
    assert.equal((await fetch(base + 'inputs')).status, 409);
    const connected = await (await fetch(base + 'connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', apiPort: port }) })).json();
    assert.equal((await fetch(base + 'inputs?session=old')).status, 409);
    assert.equal((await fetch(base + `inputs?session=${connected.session}`)).status, 200);
    const send = (session) => fetch(base + 'inputs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session, changes: [{ key: '100:0', portKey: '8:0', capacity: 2, name: 'From API' }] }) });
    assert.equal((await send('old')).status, 409);
    const applied = await send(connected.session); assert.equal(applied.status, 200);
    assert.equal((await applied.json()).inputs[0].ports[0].name, 'From API');
  });
  await t.test('SDI names and capacities apply while preserving connector routing and optical ports', async () => {
    const before = mock.writes.length, card = mock.cards.find((card) => card.slotId === 3);
    const protectedConnectors = structuredClone(card.connectors.slice(2));
    const state = await applyInputs(client, [{ key: '3:0', portKey: '13:0', capacity: 2, name: 'SDI camera' }]);
    const row = state.inputs.find((row) => row.number === 9);
    assert.equal(row.ports[0].name, 'SDI camera'); assert.equal(row.capacity, 2);
    assert.deepEqual(mock.writes.slice(before).map((write) => write.path), ['node/subcard/mode', 'interface/general']);
    assert.deepEqual(card.connectors.slice(2), protectedConnectors);
    assert.deepEqual(card.connectors.slice(0, 2).map((port) => port.workMode), [0, 2]);
  });
  await t.test('a full twelve-input name batch writes all inputs and never sends SDI EDID', async () => {
    const current = await readInputs(client), before = mock.writes.length;
    const state = await applyInputs(client, current.inputs.map((row) => ({ key: row.key, portKey: row.portKey, capacity: row.capacity, name: `Source ${row.number}` })));
    assert.equal(state.inputs.length, 12);
    assert.deepEqual(mock.writes.slice(before).map((write) => write.path), ['interface/general']);
    assert.equal(mock.writes.at(-1).body.length, 12);
    assert.ok(state.inputs.every((row) => row.ports.find((port) => port.key === row.portKey).name === `Source ${row.number}`));
  });
});
