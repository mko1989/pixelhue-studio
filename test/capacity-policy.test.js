import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { capacityChoices } from '../lib/input-models.js';
import { readInputs, applyInputs, normaliseInputs, planInputs } from '../lib/inputs.js';
import { createMockDevice } from '../test-support/mock-p20.js';

const policies = { P20: [1, 2], P10: [0, 2], P80: [2] };
for (const [model, choices] of Object.entries(policies)) test(`${model} exposes and enforces only its supported capacities`, async (t) => {
  assert.deepEqual(capacityChoices(model), choices);
  const mock = createMockDevice({ model });
  mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening');
  t.after(() => new Promise((resolve) => { mock.server.close(resolve); mock.server.closeAllConnections(); }));
  const client = new PixelhueClient(); await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port });
  let state = await readInputs(client);
  assert.deepEqual(state.capacityChoices, choices);
  assert.ok(state.inputs.every((row) => JSON.stringify(row.capacityChoices) === JSON.stringify(choices)));
  const row = state.inputs[0];
  for (const unsupported of [0, 1, 2].filter((value) => !choices.includes(value))) {
    await assert.rejects(applyInputs(client, [{ key: row.key, portKey: row.portKey, capacity: unsupported, name: 'Do not write' }]), /this device supports/);
    assert.equal(mock.writes.length, 0);
  }
  for (const capacity of choices) {
    state = await applyInputs(client, [{ key: row.key, portKey: row.portKey, capacity, name: `Capacity ${capacity}` }]);
    assert.equal(state.inputs[0].capacity, capacity);
  }
});
test('legacy unsupported readback may be preserved for names, but cannot be sent during a port switch', () => {
  const mock = createMockDevice({ model: 'P20' });
  for (const port of mock.cards[0].connectors.slice(0, 2)) port.capacityMode = 0;
  const state = { inputs: normaliseInputs(mock.interfaces, mock.cards, 'P20'), cards: mock.cards };
  const row = state.inputs[0];
  assert.equal(row.capacity, 0);
  assert.equal(planInputs([{ key: row.key, portKey: row.portKey, capacity: 0, name: 'Preserve' }], state).length, 1);
  assert.throws(() => planInputs([{ key: row.key, portKey: row.ports[0].key, capacity: 0 }], state), /DL or 4K/);
});
