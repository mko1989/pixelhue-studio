import test from 'node:test';
import assert from 'node:assert/strict';
import { fit, dragWindow, readLayout } from '../public/editor.js';

const screen = { id: 8, width: 1920, height: 1080 };
const window = { x: 100, y: 100, width: 640, height: 360 };
const state = { device: { serial: 'P20-TEST' }, screens: [screen], layers: [{ id: 10, screenId: 8, window }] };
const layout = () => ({ format: 'pixelhue-mvr-layout', version: 1, serial: 'P20-TEST', screenId: 8,
  width: 1920, height: 1080, windows: [{ id: 10, window: { ...window } }] });

test('moving windows stays within all output edges', () => {
  assert.deepEqual(dragWindow(window, -1000, 10000, screen), { ...window, x: 0, y: 720 });
  assert.deepEqual(dragWindow(window, 10000, -1000, screen), { ...window, x: 1280, y: 0 });
});
test('snap affects both move coordinates', () => {
  assert.deepEqual(dragWindow(window, 17, 27, screen, undefined, 16), { ...window, x: 112, y: 128 });
});
test('all resize corners preserve the opposite corner and enforce minimum size', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const result = dragWindow(window, corner.includes('w') ? 10000 : -10000,
      corner.includes('n') ? 10000 : -10000, screen, corner);
    assert.equal(result.width, 64); assert.equal(result.height, 64);
    assert.equal(corner.includes('w') ? result.x + result.width : result.x, corner.includes('w') ? 740 : 100);
    assert.equal(corner.includes('n') ? result.y + result.height : result.y, corner.includes('n') ? 460 : 100);
  }
});
test('aspect-locked corner resize fits output and keeps the ratio to rounding precision', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const result = dragWindow(window, 3000, 2000, screen, corner, 1, true);
    assert.deepEqual(fit(result, screen), result);
    assert.ok(Math.abs(result.height - result.width * 9 / 16) <= 0.5);
  }
});
test('layout imports require the same device and output resolution', () => {
  assert.deepEqual(readLayout(layout(), state, 8), layout().windows);
  assert.throws(() => readLayout({ ...layout(), serial: 'OTHER' }, state, 8), /another device/);
  assert.throws(() => readLayout({ ...layout(), width: 3840 }, state, 8), /resolution/);
  assert.throws(() => readLayout({ ...layout(), screenId: 42 }, state, 8), /output/);
});
test('layout import rejects unknown IDs, duplicates, invalid pixels and out of bounds', () => {
  for (const invalid of [null, { id: 99, window }, { id: 10, window: { ...window, x: -1 } },
    { id: 10, window: { ...window, width: 1 } }, { id: 10, window: { ...window, y: 10000 } },
    { id: 10, window: { ...window, width: 640.5 } }]) {
    assert.throws(() => readLayout({ ...layout(), windows: [invalid] }, state, 8), /invalid geometry/);
  }
  const two = { ...state, layers: [...state.layers, { id: 11, screenId: 8, window }] };
  assert.throws(() => readLayout({ ...layout(), windows: [layout().windows[0], layout().windows[0]] }, two, 8), /duplicate/);
});
