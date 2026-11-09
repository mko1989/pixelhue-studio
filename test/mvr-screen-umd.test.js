import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseUmdConfig, umdHeight } from '../lib/mvr-umd.js';
import { screenSignals } from '../lib/mvr-signals.js';
import { normalise, PixelhueClient } from '../lib/pixelhue.js';
import { fixAspectRatios, sourceSignal, matchesRatio, hasOverlap, ratioSize } from '../public/mvr-geometry.js';
import { dragWindow, readLayout } from '../public/editor.js';
import { createMockP20 } from '../test-support/mock-p20.js';
import { umdXml } from '../test-support/mvr-umd.js';

const config = parseUmdConfig(umdXml);
const screen = (id, width, height) => ({ screenId: id, screenIdObj: { type: 2 }, enable: 0, mosaic: { window: { width, height } } });
const output = { screenId: 7, screenIdObj: { type: 8 }, mosaic: { window: { width: 1920, height: 1080 } } };
const layer = (id, sourceType, sourceId, x = 0, enabled = 1) => ({ layerId: id, layerIdObj: { attachScreenId: 7 },
  source: { general: { sourceType, sourceId } }, UMD: [{ enable: enabled }], window: { x, y: 0, width: 300, height: 300 } });
const input = { interfaceId: 1, state: 1, actualTiming: { horizontal: { addTime: 1920 }, vertical: { addTime: 1080 } },
  auxiliaryInfo: { connectorInfo: { interfaceType: 2, workMode: 0 } } };

test('device UMD height comes from scoped XML, with per-source sizes and disabled/unknown handling', () => {
  assert.deepEqual(config, { height: 24, bySourceType: { 2: 24, 3: 24, 4: 24 } });
  const different = parseUmdConfig(umdXml.replace('<VWidth Value="24"/>', '<VWidth Value="28"/>'));
  assert.equal(umdHeight(layer(1, 2, 1), different), 28);
  assert.equal(umdHeight(layer(1, 3, 1), different), 24);
  assert.equal(umdHeight(layer(1, 2, 1, 0, 0), config), 0);
  assert.equal(umdHeight(layer(1, 2, 1), null), null);
  assert.equal(parseUmdConfig('<File><path>other.xml</path><data><UMD><OccupyHeight Support="1" Value="45"/></UMD></data></File>'), null);
  assert.equal(parseUmdConfig(umdXml.replaceAll('Value="24"', 'Value="999999"')), null);
});

test('input IDs and PGM/PVW screen IDs resolve separately, including screen 2/3 and disabled outputs', () => {
  const state = normalise([output, screen(1, 2560, 640), screen(2, 1600, 1200), screen(8, 1080, 1920), screen(9, 0, 0)],
    [layer(1, 2, 1), layer(2, 3, 1, 300), layer(3, 4, 2, 600), layer(4, 3, 8, 900)], [input], config);
  assert.equal(sourceSignal(state.layers[0], state.signals).width, 1920);
  assert.equal(sourceSignal(state.layers[1], state.signals).width, 2560);
  assert.equal(sourceSignal(state.layers[2], state.signals).width, 1600);
  assert.equal(sourceSignal(state.layers[3], state.signals).height, 1920);
  assert.equal(screenSignals([screen(9, 0, 0)])[0].connected, false);
  const fixed = fixAspectRatios(state.layers, state.signals, state.screens[0]);
  assert.deepEqual(fixed.fixed, [1, 2, 3, 4]);
  for (const [i, ratio] of [16 / 9, 4, 4 / 3, 9 / 16].entries()) {
    assert.equal(fixed.layers[i].aspectLock, ratio);
    assert.equal(fixed.layers[i].aspectMode, 5);
    assert.ok(matchesRatio(fixed.layers[i].window, ratio, 24));
  }
  assert.equal(fixed.layers[1].window.height, 99); // 300 / 4 + 24, not 75.
  assert.equal(hasOverlap(fixed.layers), false);
});

test('UMD-off fixes use source ratio without padding; unknown UMD and missing sources are skipped', () => {
  const state = normalise([output, screen(1, 2560, 640)], [layer(1, 3, 1, 0, 0), layer(2, 4, 99, 300), layer(3, 3, 1, 600)], [], null);
  const result = fixAspectRatios(state.layers, state.signals, state.screens[0]);
  assert.deepEqual(result.fixed, [1]); assert.equal(result.layers[0].window.height, 75);
  assert.equal(result.layers[0].aspectMode, 8);
  assert.match(result.skipped.find(s => s.id === 3).reason, /UMD height unavailable/);
});

test('readback retains exact source ratios rather than accumulating rounded content ratios', () => {
  const pgm = { ...layer(1, 3, 1), window: { x: 0, y: 0, width: 777, height: 218 }, aspectRatio: { aspectRatio: 5, locked: 1 } };
  const state = normalise([output, screen(1, 2560, 640)], [pgm], [], config);
  assert.equal(state.layers[0].aspectLock, 4);
});

test('all locked resize corners retain video ratio and reserve the UMD strip in bounds', () => {
  const window = { x: 200, y: 200, width: 640, height: 384 }, bounds = { width: 1920, height: 1080 };
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const next = dragWindow(window, 180, 100, bounds, corner, 1, 16 / 9, 24);
    assert.ok(matchesRatio(next, 16 / 9, 24));
    assert.equal(corner.includes('w') ? next.x + next.width : next.x, corner.includes('w') ? 840 : 200);
    assert.equal(corner.includes('n') ? next.y + next.height : next.y, corner.includes('n') ? 584 : 200);
    assert.ok(next.x >= 0 && next.y >= 0 && next.x + next.width <= 1920 && next.y + next.height <= 1080);
  }
  assert.deepEqual(ratioSize(16 / 9, 1920, 1080, 320, 24), { width: 320, height: 204 });
  const low = { id: 1, screenId: 7, sourceId: 1, sourceType: 3, umdHeight: 24, window: { x: 0, y: 0, width: 64, height: 64 } };
  const fallback = fixAspectRatios([low], [{ id: 1, sourceType: 3, connected: true, width: 2560, height: 640 }], { width: 160, height: 64 });
  assert.deepEqual(fallback.layers[0].window, { x: 0, y: 0, width: 160, height: 64 });
  assert.equal(fallback.skipped.length, 0);
  assert.equal(fixAspectRatios([low], [{ id: 1, sourceType: 3, connected: true, width: 2560, height: 640 }], { width: 64, height: 64 }).fixed.length, 0);
});

test('saved content locks round-trip, detect changed UMD, and upgrade legacy rectangle locks', () => {
  const window = { x: 0, y: 0, width: 640, height: 384 };
  const current = { id: 10, screenId: 7, umdHeight: 24, window };
  const state = { device: { serial: 'TEST' }, screens: [{ id: 7, width: 1920, height: 1080 }], layers: [current] };
  const document = { format: 'pixelhue-mvr-layout', version: 1, serial: 'TEST', screenId: 7, width: 1920, height: 1080,
    windows: [{ id: 10, window, umdHeight: 24, aspectLock: 16 / 9, aspectMode: 5 }] };
  assert.equal(readLayout(document, state, 7)[0].aspectLock, 16 / 9);
  assert.throws(() => readLayout({ ...document, windows: [{ ...document.windows[0], umdHeight: 28 }] }, state, 7), /UMD settings changed/);
  const { umdHeight: ignored, ...legacy } = document.windows[0];
  assert.equal(readLayout({ ...document, windows: [{ ...legacy, aspectLock: 640 / 384, aspectMode: 8 }] }, state, 7)[0].aspectMode, 5);
  assert.equal(readLayout({ ...document, windows: [{ ...legacy, aspectLock: 640 / 384 }] }, state, 7)[0].aspectLock, 16 / 9);
});

test('HTTP UMD discovery is cached and compensated locks survive repeated Apply/readback', async (t) => {
  const mock = createMockP20();
  mock.screens.push(screen(1, 2560, 640));
  mock.layers[0].UMD = [{ enable: 1 }];
  mock.layers.push({ ...layer(11, 3, 1, 960), layerIdObj: { attachScreenId: 8 } });
  mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening');
  t.after(() => new Promise(resolve => { mock.server.close(resolve); mock.server.closeAllConnections(); }));
  const client = new PixelhueClient();
  const state = await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port });
  assert.equal(state.layers[0].umdHeight, 24);
  const result = fixAspectRatios(state.layers, state.signals, state.screens[0]);
  const changes = result.layers.map(l => ({ id: l.id, window: l.window, aspectLock: l.aspectLock, aspectMode: l.aspectMode }));
  let actual = await client.apply(changes);
  assert.ok(actual.layers.every(l => matchesRatio(l.window, l.aspectLock, 24)));
  assert.deepEqual(mock.writes.find(w => w.path === 'layers/aspect-ratio').body.map(b => b.aspectRatio), [5, 5]);
  for (const x of [970, 980, 990]) {
    const l = actual.layers[1];
    actual = await client.apply([{ ...changes[1], window: { ...l.window, x } }]);
  }
  const l = actual.layers[1];
  actual = await client.apply([{ ...changes[1], window: { ...l.window, width: 256, height: 88 } }]);
  assert.equal(actual.layers[1].aspectLock, 4);
  assert.equal(mock.requests.filter(r => r.path === 'node/config-file').length, 1);
  assert.equal(mock.writes.filter(w => w.path === 'layers/aspect-ratio').length, 1);
  await assert.rejects(client.apply([{ ...changes[1], window: { ...l.window, width: 256, height: 64 } }]), /including UMD/);
  mock.layers[1].UMD[0].enable = 0;
  const withoutUmd = await client.read();
  const corrected = fixAspectRatios([withoutUmd.layers[1]], withoutUmd.signals, withoutUmd.screens[0]).layers[0];
  actual = await client.apply([{ id: corrected.id, window: corrected.window, aspectLock: corrected.aspectLock, aspectMode: corrected.aspectMode }]);
  assert.equal(actual.layers[1].umdHeight, 0);
  assert.equal(actual.layers[1].aspectMode, 8);
  assert.ok(matchesRatio(actual.layers[1].window, 4));
});
