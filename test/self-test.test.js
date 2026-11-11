import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readSelfTest, runSelfTest } from '../lib/self-test.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); client.selfTestPollMs = 5; return { mock, client };
}

test('self-test reads the power-on check, runs only on an idle device and waits for status 10 to clear', async t => {
  const { client, mock } = await fixture(t);
  let state = await readSelfTest(client);
  assert.equal(state.supported, true); assert.equal(state.checkType, 0); assert.equal(state.total, 2); assert.equal(state.abnormal, 0);
  assert.deepEqual(state.parts[0].items[0], { type: 1, index: 0, name: 'Temperature', value: '50', ok: true });
  // Live P20 (WO-039): an empty power-on check falls back to the stored device test.
  mock.behavior.noPowerOnCheck = true; mock.behavior.storedTest = true;
  state = await readSelfTest(client); assert.equal(state.checkType, 1); assert.equal(state.total, 2);
  mock.behavior.noPowerOnCheck = false; mock.behavior.storedTest = false;
  mock.behavior.fanFault = true;
  state = await runSelfTest(client, { action: 'run' });
  assert.deepEqual(mock.writes.at(-1), { path: 'node/selfcheck', method: 'POST', body: { nodeId: 1 } });
  assert.equal(state.ran, true); assert.equal(state.checkType, 1); assert.equal(state.abnormal, 1); assert.equal(state.parts[0].ok, false);
  assert.equal(mock.node.status, 1);
  assert.ok(mock.requests.filter(r => r.path === 'node/detail').length >= 3); // idle check plus polling
  mock.node.status = 4; const writes = mock.writes.length;
  await assert.rejects(runSelfTest(client, { action: 'run' }), /device is busy/);
  await assert.rejects(runSelfTest(client, { action: 'stop' }), /Unsupported self-test action/);
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('node/selfcheck', { nodeId: 1 }, { method: 'POST' }), /code 8210/); // mock refuses while busy
  client.configurationPromise = Promise.resolve({ name: 'Device', attributes: {}, children: [] });
  assert.equal((await readSelfTest(client)).supported, false);
  await assert.rejects(runSelfTest(client, { action: 'run' }), /does not advertise/);
});
