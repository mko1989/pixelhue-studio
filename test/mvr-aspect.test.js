import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { inputSignals } from '../lib/mvr-signals.js';
import { PixelhueClient } from '../lib/pixelhue.js';
import { overlaps, hasOverlap, canPlace, fixAspectRatios, orderGeometryChanges } from '../public/mvr-geometry.js';
import { dragWindow, readLayout } from '../public/editor.js';
import { createMockP20 } from '../test-support/mock-p20.js';

const layer = (id, x, sourceId = id, sourceType = 2) => ({ id, screenId: 8, name: `Window ${id}`, sourceId, sourceType,
  window: { x, y: 0, width: 300, height: 300 }, aspectLock: null, aspectMode: 5 });
const signal = (id, width = 1920, height = 1080, connected = true) => ({ id, width, height, connected });

test('actual timing and raw connection state determine source eligibility, not stale EDID', () => {
  const input = { interfaceId: 10, state: 1, auxiliaryInfo: { online: 1, connectorInfo: { interfaceType: 2, workMode: 0 } },
    actualTiming: { horizontal: { addTime: 1600 }, vertical: { addTime: 1200 } }, presetThumbTiming: { width: 1920, height: 1080 } };
  assert.deepEqual(inputSignals([input]), [signal(10, 1600, 1200)]);
  for (const state of [0, 5, 6]) assert.equal(inputSignals([{ ...input, state }])[0].connected, false);
  for (const state of [1, 2, 3, 4]) assert.equal(inputSignals([{ ...input, state }])[0].connected, true);
  assert.equal(inputSignals([{ ...input, actualTiming: undefined }])[0].connected, false);
  assert.equal(inputSignals([{ ...input, auxiliaryInfo: { online: 0, connectorInfo: input.auxiliaryInfo.connectorInfo } }])[0].connected, false);
  assert.equal(inputSignals([{ ...input, auxiliaryInfo: { connectorInfo: { interfaceType: 2, workMode: 2 } } }])[0].connected, false);
  assert.deepEqual(inputSignals([{ ...input, auxiliaryInfo: { connectorInfo: { interfaceType: 4 } } }]), []);
});
test('aspect fix stays inside original rectangles, locks precise source ratios and skips other windows', () => {
  const initial = [layer(1, 0), layer(2, 300), layer(3, 600), layer(4, 900, 1, 3)];
  const result = fixAspectRatios(initial, [signal(1), signal(2, 1080, 1920), signal(3, 1920, 1080, false)]);
  assert.deepEqual(result.fixed, [1, 2]); assert.equal(result.skipped.length, 2);
  assert.deepEqual(result.layers[2], initial[2]); assert.deepEqual(result.layers[3], initial[3]);
  for (const index of [0, 1]) {
    const { window, aspectLock, aspectMode } = result.layers[index], original = initial[index].window;
    assert.ok(window.x >= original.x && window.y >= original.y);
    assert.ok(window.x + window.width <= original.x + original.width && window.y + window.height <= original.y + original.height);
    assert.ok(Math.abs(window.height - window.width / aspectLock) <= .5); assert.equal(aspectMode, 8);
  }
  assert.equal(result.layers[0].aspectLock, 16 / 9); assert.equal(result.layers[1].aspectLock, 9 / 16);
  assert.equal(hasOverlap(result.layers), false);
  assert.equal(initial[0].aspectLock, null, 'planning must not mutate the input layout');
});
test('minimum-size and pre-existing-overlap failures do not produce invalid windows', () => {
  const tiny = { ...layer(1, 0), window: { x: 0, y: 0, width: 64, height: 64 } };
  const result = fixAspectRatios([tiny], [signal(1)]);
  assert.equal(result.fixed.length, 0); assert.match(result.skipped[0].reason, /64 px/); assert.deepEqual(result.layers[0], tiny);
  assert.throws(() => fixAspectRatios([layer(1, 0), layer(2, 100)], [signal(1), signal(2)]), /existing window overlaps/);
});
test('edge touching is allowed; overlapping moves are rejected on the same output only', () => {
  const a = layer(1, 0), b = layer(2, 300);
  assert.equal(overlaps(a.window, b.window), false);
  assert.equal(canPlace(a, { ...a.window, x: 1 }, [a, b]), false);
  assert.equal(canPlace(a, { ...a.window, x: 1 }, [a, { ...b, screenId: 9 }]), true);
});
test('minimum-size fixes use nearby free space and report when no placement is available', () => {
  const tiny = { ...layer(1, 0), window: { x: 0, y: 0, width: 64, height: 64 } };
  const room = { width: 320, height: 200 };
  const fixed = fixAspectRatios([tiny], [signal(1)], room);
  assert.deepEqual(fixed.fixed, [1]); assert.equal(fixed.layers[0].window.height, 64);
  assert.ok(fixed.layers[0].window.width >= 113);
  const blocked = { ...layer(2, 64, 99, 3), window: { x: 64, y: 0, width: 256, height: 200 } };
  const above = { ...layer(3, 0, 98, 3), window: { x: 0, y: 64, width: 64, height: 136 } };
  const full = fixAspectRatios([tiny, blocked, above], [signal(1)], room);
  assert.equal(full.fixed.length, 0); assert.match(full.skipped.find((item) => item.id === 1).reason, /No free space/);
});
test('geometry writes are ordered to avoid transient overlap and reject impossible direct swaps', () => {
  const a = layer(1, 0), b = layer(2, 300);
  const grow = { id: 1, window: { ...a.window, width: 350 } }, shrink = { id: 2, window: { ...b.window, x: 350, width: 250 } };
  assert.deepEqual(orderGeometryChanges([a, b], [grow, shrink]).map((item) => item.id), [2, 1]);
  assert.throws(() => orderGeometryChanges([a, b], [{ id: 1, window: b.window }, { id: 2, window: a.window }]), /before swapping/);
});
test('repeated locked corner resizing retains the original input ratio without rounding drift', () => {
  const ratio = 1600 / 1200, screen = { width: 1920, height: 1080 };
  let window = { x: 0, y: 0, width: 400, height: 300 };
  for (let step = 0; step < 80; step++) {
    window = dragWindow(window, step % 2 ? -17 : 19, step % 3 ? -7 : 11, screen, 'se', 1, ratio);
    assert.ok(Math.abs(window.height - window.width / ratio) <= .5);
    assert.ok(window.x + window.width <= screen.width && window.y + window.height <= screen.height);
  }
});
test('layout files preserve locks and reject overlaps or invalid ratio metadata', () => {
  const state = { device: { serial: 'P20' }, screens: [{ id: 8, width: 1920, height: 1080 }], layers: [layer(1, 0), layer(2, 300)] };
  const document = { format: 'pixelhue-mvr-layout', version: 1, serial: 'P20', screenId: 8, width: 1920, height: 1080,
    windows: [{ id: 1, window: { x: 0, y: 0, width: 300, height: 169 }, aspectLock: 16 / 9, aspectMode: 8 }, { id: 2, window: layer(2, 300).window }] };
  assert.equal(readLayout(document, state, 8)[0].aspectLock, 16 / 9);
  assert.throws(() => readLayout({ ...document, windows: [{ ...document.windows[0], window: { ...document.windows[0].window, x: 1 } }, document.windows[1]] }, state, 8), /overlapping/);
  assert.throws(() => readLayout({ ...document, windows: [{ ...document.windows[0], aspectLock: 0 }, document.windows[1]] }, state, 8), /invalid aspect/);
});

test('device aspect fix persists native locks, rejects overlaps/stale signals and verifies readback', async (t) => {
  const mock = createMockP20();
  const source = mock.layers[0].source.general.sourceId;
  const disconnected = mock.interfaces.find((input) => input.interfaceId === source + 2); disconnected.state = 0;
  mock.layers[0].window = { x: 0, y: 0, width: 640, height: 500 };
  mock.layers.push(
    { layerId: 11, layerIdObj: { attachScreenId: 8 }, source: { general: { sourceType: 2, sourceId: disconnected.interfaceId } }, window: { x: 640, y: 0, width: 640, height: 500 } },
    { layerId: 12, layerIdObj: { attachScreenId: 8 }, source: { general: { sourceType: 3, sourceId: source } }, window: { x: 0, y: 500, width: 1280, height: 300 } },
  );
  mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening');
  t.after(() => new Promise((resolve) => { mock.server.close(resolve); mock.server.closeAllConnections(); }));
  const client = new PixelhueClient(); await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port });
  await t.test('reads source IDs and actual connected input dimensions', async () => {
    const state = await client.read();
    assert.equal(state.layers[0].sourceId, source); assert.equal(state.layers[0].sourceType, 2);
    assert.equal(state.signals.find((signal) => signal.id === source).connected, true);
    assert.equal(state.signals.find((signal) => signal.id === disconnected.interfaceId).connected, false);
  });
  await t.test('rejects overlapping geometry before any write', async () => {
    await assert.rejects(client.apply([{ id: 10, window: { x: 0, y: 0, width: 700, height: 500 } }]), /cannot overlap/);
    assert.equal(mock.writes.length, 0);
  });
  await t.test('writes fitted geometry then OriginalRatio lock; other windows are untouched', async () => {
    const state = await client.read(), fixed = fixAspectRatios(state.layers, state.signals).layers[0];
    const untouched = structuredClone(mock.layers.slice(1));
    const actual = await client.apply([{ id: fixed.id, window: fixed.window, aspectLock: fixed.aspectLock, aspectMode: fixed.aspectMode }]);
    assert.equal(actual.layers[0].aspectLock, 16 / 9); assert.equal(actual.layers[0].aspectMode, 8);
    assert.deepEqual(mock.writes.map((write) => write.path), ['layers/window', 'layers/aspect-ratio']);
    assert.deepEqual(mock.writes[1].body, [{ layerId: 10, aspectRatio: 8, locked: 1 }]);
    assert.deepEqual(mock.layers.slice(1), untouched);
  });
  await t.test('lock-only edits can unlock and relock without rewriting geometry', async () => {
    const state = await client.read(), before = mock.writes.length;
    await client.apply([{ id: 10, window: state.layers[0].window, aspectLock: null, aspectMode: 5 }]);
    assert.deepEqual(mock.writes.slice(before).map((write) => write.path), ['layers/aspect-ratio']);
    assert.equal((await client.read()).layers[0].aspectLock, null);
  });
  await t.test('changed or disconnected source resolution rejects a stale lock before writing', async () => {
    const state = await client.read(), before = mock.writes.length;
    const input = mock.interfaces.find((input) => input.interfaceId === source);
    input.actualTiming.vertical.addTime = 1200;
    await assert.rejects(client.apply([{ id: 10, window: state.layers[0].window, aspectLock: 16 / 9, aspectMode: 8 }]), /connection or resolution changed/);
    input.actualTiming.vertical.addTime = 1080; input.state = 0;
    await assert.rejects(client.apply([{ id: 10, window: state.layers[0].window, aspectLock: 16 / 9, aspectMode: 8 }]), /connection or resolution changed/);
    input.state = 1; assert.equal(mock.writes.length, before);
  });
  await t.test('ignored aspect lock fails device readback verification', async () => {
    const state = await client.read(); mock.behavior.ignoreAspectLock = true;
    await assert.rejects(client.apply([{ id: 10, window: state.layers[0].window, aspectLock: 16 / 9, aspectMode: 8 }]), /did not retain/);
    mock.behavior.ignoreAspectLock = false;
  });
});
