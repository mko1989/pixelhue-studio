import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { applyMvrLayer, mvrSources } from '../lib/mvr-layers.js';
import { placeWindow } from '../public/mvr-sources.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); const state = await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, state };
}

test('MVR sources list enabled screen PGM/PVW and inputs, marking ones already in the MVR (WO-020)', async t => {
  const { state } = await fixture(t);
  const names = state.sources.map(s => s.name);
  assert.ok(names.includes('Main screen PGM') && names.includes('Main screen PVW'));
  assert.ok(!names.some(n => n.startsWith('AUX screen')), 'P20 cannot show AUX screens in the MVR (WO-021)');
  assert.ok(!names.some(n => n.startsWith('Spare screen')), 'disabled placeholder screens are not sources');
  const used = state.sources.filter(s => s.usedBy); assert.deepEqual(used.map(s => s.usedBy), [10]);
});

test('add a screen PVW window, change a source, delete; overlap/out-of-bounds/duplicate writes nothing (WO-020)', async t => {
  const { client, mock, state } = await fixture(t);
  const window = { x: 1000, y: 600, width: 480, height: 294 };
  let next = await applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 4, id: 1 }, window });
  const created = mock.writes.find(w => w.path === 'layers/create').body;
  assert.deepEqual({ ...created, general: { name: created.general.name.replace(/-[0-9a-f]{8}$/, '-x') } }, { window, locked: 1, aspectRatio: { aspectRatio: 5, locked: 1 },
    layerIdObj: { type: 8, sceneType: 2, attachScreenType: 0, attachScreenId: 8, screenGuid: 'mvr-screen' }, general: { name: 'MVR-1-x' }, namePrefix: 'Layer',
    source: { general: { sourceId: 1, sourceType: 4 }, primary: { sourceId: 1, sourceType: 4 } } });
  const added = next.layers.find(l => l.id === next.changedId);
  assert.deepEqual([added.sourceType, added.sourceId, added.window], [4, 1, window]);
  assert.equal(next.sources.find(s => s.type === 4 && s.id === 1).usedBy, added.id);
  const writes = mock.writes.length;
  await assert.rejects(applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 3, id: 1 }, window: { ...window, x: 1100 } }), /cannot overlap/);
  await assert.rejects(applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 3, id: 1 }, window: { ...window, x: 1500 } }), /must fit/);
  await assert.rejects(applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 4, id: 1 }, window: { ...window, y: 0 } }), /already in the MVR/);
  await assert.rejects(applyMvrLayer(client, { action: 'source', screenId: 8, layerId: 10, source: { type: 4, id: 1 } }), /already in the MVR/);
  await assert.rejects(applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 4, id: 5 }, window: { ...window, y: 0 } }), /Choose a current/);
  await assert.rejects(applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 4, id: 2 }, window: { ...window, y: 0 } }), /Choose a current/);
  assert.equal(mock.writes.length, writes);
  next = await applyMvrLayer(client, { action: 'source', screenId: 8, layerId: added.id, source: { type: 3, id: 1 } });
  assert.deepEqual(mock.writes.at(-1).body, [{ layerId: added.id, source: { general: { sourceId: 1, sourceType: 3 } } }]);
  next = await applyMvrLayer(client, { action: 'delete', screenId: 8, layerId: added.id });
  assert.ok(!next.layers.some(l => l.id === added.id)); assert.equal(next.sources.find(s => s.type === 3 && s.id === 1).usedBy, null);
  assert.equal(state.layers.length, next.layers.length);
});

test('AUX screens stay MVR sources on models without the P10/P20 restriction', () => {
  const screens = [{ screenId: 3, screenIdObj: { type: 4 }, general: { name: 'AUX' }, enable: 1, mosaic: { window: { width: 1920, height: 1080 } } }];
  assert.deepEqual(mvrSources(screens, [], [], 'P20').length, 0);
  assert.deepEqual(mvrSources(screens, [], [], 'P10').length, 0);
  assert.deepEqual(mvrSources(screens, [], [], 'Q8').map(s => s.name), ['AUX PGM', 'AUX PVW']);
});

test('placeWindow keeps the drop point when free, else finds the nearest free spot, else shrinks', () => {
  const screen = { width: 1920, height: 1080 };
  assert.deepEqual(placeWindow({ width: 1920, height: 1080 }, screen, [], { x: 960, y: 540 }), { x: 720, y: 405, width: 480, height: 270 });
  const blocker = [{ window: { x: 600, y: 300, width: 700, height: 500 } }];
  const spot = placeWindow({}, screen, blocker, { x: 960, y: 540 });
  assert.ok(spot && !(spot.x < 1300 && spot.x + spot.width > 600 && spot.y < 800 && spot.y + spot.height > 300));
  const full = [{ window: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.equal(placeWindow({}, screen, full), null);
});
