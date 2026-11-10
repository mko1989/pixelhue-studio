import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createProgramSync } from '../public/program-sync.js';
import { applyProgramGeometry } from '../lib/program-geometry.js';
import { PixelhueClient } from '../lib/pixelhue.js';
import { createApp } from '../server.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const change = (x, id = 21) => ({ action: 'window', screenId: 1, id, window: { x, y: 20, width: 640, height: 360 } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, port };
}

test('live geometry starts before drag completion, retains only newest edits and never overlaps writes', async () => {
  const first = deferred(), calls = [], accepted = []; let active = 0, peak = 0;
  const sync = createProgramSync({ interval: 0,
    submit: async changes => { calls.push(changes); peak = Math.max(peak, ++active); if (calls.length === 1) await first.promise; active--; return {}; },
    onResult: (_, sent) => accepted.push(sent), onError: assert.fail });
  sync.put(change(10)); await pause(0); assert.equal(calls.length, 1, 'first position sent without releasing a drag');
  for (let x = 20; x <= 200; x += 10) sync.put(change(x));
  sync.put(change(90, 20)); assert.equal(calls.length, 1);
  first.resolve(); await sync.drain();
  assert.equal(peak, 1); assert.equal(calls.length, 2, 'stale intermediate positions were coalesced');
  assert.deepEqual(calls[1].map(c => [c.id, c.window.x]), [[21, 200], [20, 90]]);
  assert.equal(accepted[0].length, 0, 'old reply cannot replace a newer local edit');
  assert.equal(accepted[1].length, 2); assert.equal(sync.dirty, false);
});

test('live queue throttles intermediate changes and final flush bypasses the remaining interval', async () => {
  const calls = [];
  const sync = createProgramSync({ interval: 10000, submit: async sent => { calls.push(sent); return {}; }, onResult() {}, onError: assert.fail });
  sync.put(change(10)); await pause(0);
  for (const x of [20, 30, 40]) sync.put(change(x));
  await pause(10); assert.equal(calls.length, 1);
  await sync.flush(true); assert.equal(calls.length, 2); assert.equal(calls[1][0].window.x, 40); sync.reset();
});

test('failure stops live retries, retains newest geometry, and cancellation can replace it with the original position', async () => {
  const calls = []; let fail = true;
  const sync = createProgramSync({ interval: 0, submit: async sent => { calls.push(sent); if (fail) throw new Error('Rejected'); return {}; }, onResult() {}, onError() {} });
  sync.put(change(50)); await pause(0); sync.put(change(100)); await pause(10);
  assert.equal(calls.length, 1); assert.ok(sync.error); assert.equal(await sync.drain(), false);
  sync.put(change(0), true); fail = false; await sync.retry();
  assert.equal(calls.at(-1)[0].window.x, 0, 'cancelled live drag restores its original position');
  assert.equal(sync.error, null); assert.equal(sync.dirty, false);
});

test('session reset cancels an unsent update and ignores old live replies', async () => {
  const first = deferred(), results = [], calls = [];
  const sync = createProgramSync({ interval: 0, submit: async sent => { calls.push(sent); if (calls.length === 1) return first.promise; return 'new'; }, onResult: next => results.push(next), onError: assert.fail });
  sync.put(change(10)); sync.reset(); await pause(0); assert.equal(calls.length, 0);
  sync.put(change(20)); await pause(0); sync.reset(); sync.put(change(30)); first.resolve('old'); await sync.drain();
  assert.deepEqual(results, ['new']); assert.equal(calls.at(-1)[0].window.x, 30);
});

test('lean geometry reads no sources/presets and verifies local-to-global translation with one batched write', async t => {
  const { client, mock } = await fixture(t); const start = mock.requests.length;
  const next = await applyProgramGeometry(client, { changes: [change(75), change(90, 20)] });
  assert.equal(mock.layers.find(l => l.layerId === 21).window.x, -25);
  assert.equal(next.layers.find(l => l.id === 21).window.x, 75);
  assert.equal(mock.writes.at(-1).body.length, 2);
  const paths = mock.requests.slice(start).filter(r => r.path !== 'node/config-file').map(r => r.path);
  assert.deepEqual(paths.sort(), ['screen/list-detail', 'layers/list-detail', 'layers/window', 'layers/list-detail'].sort());
});

test('lean geometry rechecks locks/membership/bounds and validates the whole batch before writing', async t => {
  const { client, mock } = await fixture(t); const run = changes => applyProgramGeometry(client, { changes });
  mock.screens.find(s => s.screenId === 1).pgmEdit = 0;
  await assert.rejects(run([change(40), change(50, 20)]), /PGM.*locked/);
  await assert.rejects(run([change(50, 10)]), /no longer exists/);
  await assert.rejects(run([{ ...change(50), screenId: 2 }]), /no longer exists/);
  await assert.rejects(run([change(500101)]), /Layer X/);
  await assert.rejects(run([change(50), change(60)]), /Duplicate/);
  await assert.rejects(run([{ ...change(50), action: 'delete' }]), /position\/size/);
  assert.equal(mock.writes.length, 0);
  await run([change(60)]); assert.equal(mock.writes.length, 1, 'locked PGM still permits PVW edits');
});

test('lean grouped geometry moves both members together and detects ignored firmware writes', async t => {
  const { client, mock } = await fixture(t);
  const a = mock.layers.find(l => l.layerId === 21); a.general.name = 'GRP1-H-A';
  const b = { ...structuredClone(a), layerId: 22, general: { name: 'GRP1-H-B' }, window: { ...a.window, x: a.window.x + a.window.width } }; mock.layers.push(b);
  const request = { changes: [{ ...change(100), action: 'group-window', window: { x: 100, y: 100, width: 1280, height: 360 } }] };
  const next = await applyProgramGeometry(client, request);
  assert.equal(mock.writes.at(-1).body.length, 2); assert.equal(next.layers.find(l => l.id === 22).window.x, 740);
  const original = client.transport;
  client.transport = options => options.path.endsWith('/layers/window') ? Promise.resolve({ code: 0, data: {} }) : original(options);
  await assert.rejects(applyProgramGeometry(client, { changes: [change(200)] }), /did not retain/);
});

test('live geometry HTTP endpoint keeps origin/session checks and never exposes an unrestricted write route', async t => {
  const { mock, port } = await fixture(t), app = createApp(), appPort = await listen(app); t.after(() => close(app));
  const url = `http://127.0.0.1:${appPort}/api/`;
  const session = (await (await fetch(url + 'connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', apiPort: port }) })).json()).session;
  const send = (sid, headers = {}) => fetch(url + 'programming/geometry', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ session: sid, changes: [change(100)] }) });
  assert.equal((await send('old')).status, 409);
  assert.equal((await send(session, { Origin: 'http://unrelated.example' })).status, 403);
  assert.equal(mock.writes.length, 0); assert.equal((await send(session)).status, 200);
  assert.equal((await fetch(url + 'programming/geometry?session=' + session)).status, 200);
});
