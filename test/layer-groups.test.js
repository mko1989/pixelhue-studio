import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { parseGroup, groupOf, splitWindow, groupSize, unionWindow } from '../lib/layer-groups.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}

test('group geometry: names, native combined size, proportional split, union (WO-025)', () => {
  assert.deepEqual(parseGroup('GRP3-V-B'), { group: 3, orient: 'V', part: 'B' }); assert.equal(parseGroup('Layer 1'), null);
  assert.deepEqual(groupSize({ width: 1920, height: 1080 }, { width: 1280, height: 720 }, 'H'), { width: 3200, height: 1080, share: 0.6 });
  assert.deepEqual(groupSize({}, {}, 'V'), { width: 1920, height: 2160, share: 0.5 });
  assert.deepEqual(splitWindow({ x: 10, y: 20, width: 1000, height: 300 }, 'H', 0.6), [{ x: 10, y: 20, width: 600, height: 300 }, { x: 610, y: 20, width: 400, height: 300 }]);
  assert.deepEqual(splitWindow({ x: 0, y: 0, width: 400, height: 1000 }, 'V', 0.25), [{ x: 0, y: 0, width: 400, height: 250 }, { x: 0, y: 250, width: 400, height: 750 }]);
  assert.deepEqual(unionWindow({ x: 0, y: 0, width: 600, height: 300 }, { x: 600, y: 0, width: 400, height: 300 }), { x: 0, y: 0, width: 1000, height: 300 });
});

test('create a side-by-side group, move/resize it as one, ungroup; failed second member rolls back (WO-025)', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  const inputs = state.sources.filter(s => s.type === 2).slice(0, 2);
  state = await applyProgramming(client, { action: 'group-create', screenId: 1, scene: 4, orientation: 'H', sources: inputs.map(s => ({ id: s.id, type: 2 })) });
  const a = state.layers.find(l => l.name === 'GRP1-H-A'), b = state.layers.find(l => l.name === 'GRP1-H-B');
  assert.ok(a && b, 'both members named');
  assert.deepEqual([a.window.width, b.window.x - a.window.x, a.window.y === b.window.y, a.aspectLocked], [inputs[0].width, inputs[0].width, true, true]);
  const g = groupOf(state.layers, b); assert.equal(g.a.id, a.id);
  const rect = { x: 100, y: 100, width: 1920, height: 540 };
  state = await applyProgramming(client, { action: 'group-window', screenId: 1, id: b.id, window: rect });
  const w = mock.writes.filter(x => x.path === 'layers/window').at(-1).body;
  assert.equal(w.length, 2, 'both members in one request');
  const na = state.layers.find(l => l.id === a.id).window, nb = state.layers.find(l => l.id === b.id).window;
  assert.deepEqual([na.x, na.y, na.width + nb.width, nb.x - na.x, na.height, nb.height], [100, 100, 1920, na.width, 540, 540]);
  state = await applyProgramming(client, { action: 'group-ungroup', screenId: 1, id: a.id });
  assert.ok(!state.layers.some(l => parseGroup(l.name)));
  await assert.rejects(applyProgramming(client, { action: 'group-window', screenId: 1, id: a.id, window: rect }), /not part of a complete group/);
  // Second create fails for resources → the first member is deleted again.
  const count = mock.layers.length; let creates = 0;
  const original = mock.server.listeners('request')[0];
  mock.server.removeAllListeners('request');
  mock.server.on('request', (req, res) => {
    if (req.url.includes('layers/create') && ++creates === 2) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 8212, message: 'resource not enough' })); return; }
    return original(req, res);
  });
  await assert.rejects(applyProgramming(client, { action: 'group-create', screenId: 1, scene: 4, orientation: 'V', sources: inputs.map(s => ({ id: s.id, type: 2 })) }), /no free layer resources/);
  assert.equal(mock.layers.length, count, 'rolled back');
});

test('Clear on a grouped layer deletes both members in one request (WO-026)', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  const inputs = state.sources.filter(s => s.type === 2).slice(0, 2);
  state = await applyProgramming(client, { action: 'group-create', screenId: 1, scene: 4, orientation: 'V', sources: inputs.map(s => ({ id: s.id, type: 2 })) });
  const a = state.layers.find(l => l.name === 'GRP1-V-A'), b = state.layers.find(l => l.name === 'GRP1-V-B');
  state = await applyProgramming(client, { action: 'group-delete', screenId: 1, id: b.id });
  assert.deepEqual(mock.writes.at(-1), { path: 'layers', method: 'DELETE', body: [{ layerId: a.id, sn: client.serial }, { layerId: b.id, sn: client.serial }] });
  assert.ok(!state.layers.some(l => [a.id, b.id].includes(l.id)));
});
