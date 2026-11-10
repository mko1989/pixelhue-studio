import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { applyMvrLayer } from '../lib/mvr-layers.js';
import { applyProgramming, readProgramming } from '../lib/studio-programming.js';
import { parseUmdConfig } from '../lib/mvr-umd.js';
import { placeWindow } from '../public/mvr-sources.js';
import { matchesRatio, hasOverlap } from '../public/mvr-geometry.js';
import { createMockStudio } from '../test-support/mock-studio.js';

async function fixture(t, config) {
  const mock = createMockStudio(); mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening');
  t.after(() => new Promise(resolve => { mock.server.close(resolve); mock.server.closeAllConnections(); }));
  const client = new PixelhueClient();
  await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port });
  if (config !== undefined) client.umdConfig = config;
  return { client, mock };
}
const rect = { x: 1000, y: 600, width: 480, height: 294 };
const source = { type: 4, id: 1 };
const add = (client, src = source, window = rect) => applyMvrLayer(client, { action: 'create', screenId: 8, source: src, window });

test('MVR dropped sources include per-type UMD height in placement, limits and collision tests', () => {
  const screen = { width: 1920, height: 1080 }, source = { width: 1920, height: 1080, umdHeight: 28 };
  assert.deepEqual(placeWindow(source, screen, [], { x: 960, y: 540 }), { x: 720, y: 391, width: 480, height: 298 });
  const blocked = [{ window: { x: 720, y: 666, width: 480, height: 40 } }];
  const placed = placeWindow(source, screen, blocked, { x: 960, y: 540 });
  assert.equal(hasOverlap([{ id: 1, screenId: 8, window: placed }, { id: 2, screenId: 8, window: blocked[0].window }]), false, 'the UMD strip must not overlap');
  const portrait = placeWindow({ width: 1080, height: 1920, umdHeight: 28 }, screen, [], null, { width: 512, height: 480 });
  assert.ok(portrait.width <= 512 && portrait.height <= 480 && matchesRatio(portrait, 9 / 16, 28));
});

test('MVR creation locks input, PGM and PVW immediately using actual per-source UMD heights', async t => {
  const config = { height: 24, bySourceType: { 2: 28, 3: 24, 4: 32 } };
  for (const type of [2, 3, 4]) await t.test(`source type ${type}`, async t => {
    const { client } = await fixture(t, config), before = await client.read();
    const src = type === 2 ? before.sources.find(s => s.type === 2 && !s.usedBy) : { type, id: 1 };
    // Fixture uses 16:9 timing for inputs and this screen.
    const next = await add(client, src), l = next.layers.find(l => l.id === next.changedId);
    assert.equal(l.umdHeight, config.bySourceType[type]); assert.equal(l.aspectMode, 5);
    assert.ok(l.aspectLock && matchesRatio(l.window, 16 / 9, l.umdHeight)); assert.equal(hasOverlap(next.layers), false);
  });
});

test('MVR reconciles firmware UMD-off defaults and locks Original mode without adding a strip', async t => {
  const { client, mock } = await fixture(t); mock.behavior.mvrUmd = 0;
  const next = await add(client), l = next.layers.find(l => l.id === next.changedId);
  assert.equal(l.umdHeight, 0); assert.equal(l.aspectMode, 8); assert.equal(l.aspectLock, 16 / 9);
  assert.equal(l.window.width, 480); assert.equal(l.window.height, 270);
});

test('an input without usable timing still drops locked using the initial fallback content ratio', async t => {
  const { client, mock } = await fixture(t), before = await client.read();
  const source = before.sources.find(s => s.type === 2 && !s.usedBy), raw = mock.interfaces.find(i => i.interfaceId === source.id);
  raw.state = 0; raw.actualTiming = {};
  const next = await add(client, source), layer = next.layers.find(l => l.id === next.changedId);
  assert.ok(layer.aspectLock); assert.equal(layer.umdHeight, 24); assert.ok(matchesRatio(layer.window, 16 / 9, 24));
});

test('MVR replacement relocks an unlocked window, refits the new source and preserves UMD/caps/neighbours', async t => {
  const { client, mock } = await fixture(t, { height: 24, bySourceType: { 2: 28, 3: 24, 4: 24 } });
  let next = await add(client), l = next.layers.find(l => l.id === next.changedId), raw = mock.layers.find(r => r.layerId === l.id);
  raw.aspectRatio = { aspectRatio: 5, locked: 0 };
  const input = mock.interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2 && i.auxiliaryInfo.connectorInfo.workMode !== 2 && i.interfaceId !== next.layers[0].sourceId);
  input.actualTiming = { horizontal: { addTime: 1600 }, vertical: { addTime: 1200 } };
  const unaffected = structuredClone(mock.layers.find(r => r.layerId === 10));
  next = await applyMvrLayer(client, { action: 'source', screenId: 8, layerId: l.id, source: { type: 2, id: input.interfaceId } });
  l = next.layers.find(r => r.id === l.id);
  assert.equal(l.umdHeight, 28); assert.ok(l.aspectLock && matchesRatio(l.window, 4 / 3, 28));
  assert.ok(l.window.width <= 512 && l.window.height <= 480); assert.deepEqual(mock.layers.find(r => r.layerId === 10), unaffected);
});

test('unknown UMD fails before creation and ignored lock writes never report a successful drop', async t => {
  const { client, mock } = await fixture(t, null);
  await assert.rejects(add(client), /UMD height is unavailable/); assert.equal(mock.writes.length, 0);
  client.umdConfig = { height: 24, bySourceType: {} }; mock.behavior.ignoreAspectLock = true;
  const transport = client.transport;
  client.transport = options => {
    if (options.path.endsWith('/layers/create')) options = { ...options, body: { ...options.body, locked: 0, aspectRatio: { aspectRatio: 5, locked: 0 } } };
    return transport(options);
  };
  await assert.rejects(add(client), /did not retain.*aspect ratio and lock/);
  assert.deepEqual(parseUmdConfig('<File><path>deviceconfig/device/feature.xml</path><data><UMD Support="0"></UMD></data></File>'), { height: 0, bySourceType: {} });
});

test('Programming input/screen drops and source replacement refit and lock; manual unlock remains available', async t => {
  const { client, mock } = await fixture(t);
  mock.screens.find(s => s.screenId === 2).mosaic.window = { x: 0, y: 0, width: 1200, height: 1600 };
  let state = await applyProgramming(client, { action: 'create', screenId: 1, scene: 4, source: { type: 3, id: 2 }, window: { x: 0, y: 0, width: 640, height: 360 } });
  const added = state.layers.find(l => l.sourceType === 3 && l.sourceId === 2);
  assert.ok(added.aspectLocked); assert.ok(matchesRatio(added.window, 3 / 4));
  state = await applyProgramming(client, { action: 'aspect', screenId: 1, id: added.id, locked: false });
  assert.equal(state.layers.find(l => l.id === added.id).aspectLocked, false);
  const input = state.sources.find(s => s.type === 2);
  state = await applyProgramming(client, { action: 'source', screenId: 1, id: added.id, source: input });
  const replaced = state.layers.find(l => l.id === added.id);
  assert.ok(replaced.aspectLocked); assert.equal(replaced.aspectMode, 8); assert.ok(matchesRatio(replaced.window, input.width / input.height));
  const before = mock.writes.length; mock.behavior.ignoreAspectLock = true;
  mock.layers.find(l => l.layerId === added.id).aspectRatio.locked = 0;
  await assert.rejects(applyProgramming(client, { action: 'source', screenId: 1, id: added.id, source: input }), /did not retain/);
  assert.ok(mock.writes.length > before);
});

test('background drops set native source locks and grouped source members are created locked', async t => {
  const { client, mock } = await fixture(t);
  let state = await applyProgramming(client, { action: 'bkg', screenId: 1, scene: 4, pictureId: 1, enable: true });
  assert.equal(state.backgrounds.find(b => b.screenId === 1 && b.scene === 4).aspectLocked, true);
  const sources = state.sources.filter(s => s.type === 2).slice(0, 2);
  state = await applyProgramming(client, { action: 'group-create', screenId: 1, scene: 4, orientation: 'H', sources });
  assert.ok(state.layers.filter(l => l.name.startsWith('GRP')).every(l => l.aspectLocked && l.aspectMode === 8));
  assert.ok(mock.writes.filter(w => w.path === 'layers/create').every(w => w.body.locked === 1));
  assert.ok((await readProgramming(client)).layers.length);
});
