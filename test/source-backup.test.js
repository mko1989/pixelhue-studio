import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readSourceBackup, applySourceBackup } from '../lib/source-backup.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}
const sent = mock => mock.writes.filter(w => w.path === 'system/ctrl/source-backup');

test('source backup re-sends the whole object for enable, pairs, switch mode and primary preference', async t => {
  const { client, mock } = await fixture(t);
  let state = await readSourceBackup(client);
  assert.equal(state.supported, true); assert.equal(state.enable, 0); assert.equal(state.sameCapacity, true);
  const [a, b, c, d] = state.inputs; assert.ok(state.inputs.every(i => i.signal === 1));
  await assert.rejects(applySourceBackup(client, { action: 'add', primary: a.id, backup: b.id }), /Turn source backup on/);
  state = await applySourceBackup(client, { action: 'enable', enable: 1 });
  assert.deepEqual(sent(mock).at(-1), { path: 'system/ctrl/source-backup', method: 'PUT', body: { sourceBackup: { enable: 1, primaryFirst: 0, backup: [] } } });
  state = await applySourceBackup(client, { action: 'add', primary: a.id, backup: b.id });
  assert.deepEqual(sent(mock).at(-1).body.sourceBackup.backup, [{ id: 1, primarySourceId: a.id, primarySourceType: 2, primarySourceState: 1, backupSourceId: b.id, backupSourceType: 2, backupSourceState: 1,
    switchMode: 0, usingSourceId: a.id, usingSourceType: 2, primaryFirst: 0, primarySourceName: a.name, backupSourceName: b.name }]);
  assert.deepEqual(state.pairs.map(p => [p.id, p.primary, p.backup, p.auto, p.using]), [[1, a.id, b.id, true, 'primary']]);
  state = await applySourceBackup(client, { action: 'add', primary: c.id, backup: d.id });
  assert.deepEqual(state.pairs.map(p => p.id), [1, 2]);
  state = await applySourceBackup(client, { action: 'update', id: 1, auto: false });
  state = await applySourceBackup(client, { action: 'update', id: 1, using: 'backup' });
  assert.equal(mock.sourceBackup.backup[0].switchMode, 1); assert.equal(mock.sourceBackup.backup[0].usingSourceId, b.id); assert.equal(state.pairs[0].using, 'backup');
  state = await applySourceBackup(client, { action: 'update', id: 1, auto: true }); // back to auto: primary in use (HotBackupPanel.tsx:1008)
  assert.equal(mock.sourceBackup.backup[0].usingSourceId, a.id);
  state = await applySourceBackup(client, { action: 'primary-first', primaryFirst: 1 });
  assert.equal(mock.sourceBackup.primaryFirst, 1); assert.ok(mock.sourceBackup.backup.every(p => p.primaryFirst === 1));
  state = await applySourceBackup(client, { action: 'remove', id: 1 });
  assert.deepEqual(state.pairs.map(p => p.id), [2]); assert.equal(sent(mock).at(-1).body.sourceBackup.backup.length, 1);
  state = await applySourceBackup(client, { action: 'clear' }); assert.deepEqual(state.pairs, []);
});

test('pair rules are checked before writing; device refusals and ignored writes are reported', async t => {
  const { client, mock } = await fixture(t);
  let state = await applySourceBackup(client, { action: 'enable', enable: 1 }); const [a, b, c] = state.inputs, before = sent(mock).length;
  await assert.rejects(applySourceBackup(client, { action: 'add', primary: a.id, backup: a.id }), /two different/);
  await assert.rejects(applySourceBackup(client, { action: 'add', primary: a.id, backup: mock.primary.interfaceId }), /two different current inputs/); // an output
  mock.interfaces.find(i => i.interfaceId === b.id).auxiliaryInfo.connectorInfo.capacity = 2;
  await assert.rejects(applySourceBackup(client, { action: 'add', primary: a.id, backup: b.id }), /same capacity/);
  await assert.rejects(applySourceBackup(client, { action: 'update', id: 9, auto: false }), /no longer exists/);
  await assert.rejects(applySourceBackup(client, { action: 'swap' }), /Unsupported source backup action/);
  assert.equal(sent(mock).length, before);
  // No signal on one side: PixelFlow sends an automatic pair with no source in use.
  mock.interfaces.find(i => i.interfaceId === c.id).state = 0;
  state = await applySourceBackup(client, { action: 'add', primary: a.id, backup: c.id });
  assert.equal(sent(mock).at(-1).body.sourceBackup.backup[0].usingSourceId, 0); assert.equal(state.pairs[0].using, 'none');
  await assert.rejects(applySourceBackup(client, { action: 'update', id: 1, using: 'backup' }), /manual mode/);
  await assert.rejects(applySourceBackup(client, { action: 'add', primary: a.id, backup: state.inputs[3].id }), /already belongs/);
  mock.behavior.keyedSources = [state.inputs[3].id];
  await assert.rejects(applySourceBackup(client, { action: 'add', primary: state.inputs[3].id, backup: state.inputs[4].id }), /Cut & Fill or keying/);
  mock.behavior.keyedSources = [];
  await assert.rejects(client.call('system/ctrl/source-backup', { sourceBackup: { enable: 1, backup: [{ id: 5, primarySourceId: 1, backupSourceId: 2, switchMode: 0 }] } }), /code 8210/);
  mock.behavior.ignoreBackup = true;
  await assert.rejects(applySourceBackup(client, { action: 'enable', enable: 0 }), /did not retain the source backup/);
});

test('devices without SourceBackup in the feature XML expose no backup block', async t => {
  const { client, mock } = await fixture(t);
  client.configurationPromise = Promise.resolve({ name: 'Device', attributes: {}, children: [] });
  assert.equal((await readSourceBackup(client)).supported, false);
  await assert.rejects(applySourceBackup(client, { action: 'enable', enable: 1 }), /does not advertise/);
  assert.equal(mock.requests.some(r => r.path === 'system/ctrl/source-backup'), false);
});
