import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { applyMvrLayer } from '../lib/mvr-layers.js';
import { windowLimit, growsPastLimit, shrinkToLimit } from '../public/mvr-geometry.js';
import { dragWindow } from '../public/editor.js';
import { placeWindow } from '../public/mvr-sources.js';
import { createMockStudio } from '../test-support/mock-studio.js';

test('input window limit: 512 × 480 for P10/P20 inputs only; growth past it is refused (WO-028)', () => {
  assert.deepEqual(windowLimit('P20', 2), { width: 512, height: 480 }); assert.deepEqual(windowLimit('P10', 2), { width: 512, height: 480 });
  assert.equal(windowLimit('P20', 3), null, 'screen PGM/PVW windows unlimited'); assert.equal(windowLimit('Q8', 2), null);
  const limit = windowLimit('P20', 2);
  assert.equal(growsPastLimit({ width: 600, height: 300 }, { width: 400, height: 300 }, limit), true);
  assert.equal(growsPastLimit({ width: 880, height: 506 }, { width: 900, height: 506 }, limit), false, 'shrinking an oversized window is allowed');
  assert.equal(growsPastLimit({ width: 512, height: 480 }, { width: 100, height: 100 }, limit), false);
  assert.deepEqual(shrinkToLimit({ x: 5, y: 6, width: 900, height: 506 }, limit), { x: 5, y: 6, width: 512, height: 480 });
  const locked = shrinkToLimit({ x: 0, y: 0, width: 960, height: 564 }, limit, 16 / 9, 24);
  assert.ok(locked.width <= 512 && locked.height <= 480 && Math.abs(locked.width / (locked.height - 24) - 16 / 9) < 0.02, 'keeps the locked content ratio');
  // Drag-resize stops at the cap even with the output allowing more.
  assert.deepEqual(dragWindow({ x: 0, y: 0, width: 400, height: 300 }, 500, 400, { width: 1920, height: 1080 }, 'se', 1, false, 0, limit), { x: 0, y: 0, width: 512, height: 480 });
  assert.deepEqual(placeWindow({ width: 1920, height: 1080 }, { width: 3840, height: 2160 }, [], null, limit).width <= 512, true, 'new input windows start inside the limit');
});

test('server refuses growing an input window past the limit and creating oversized input windows; swap shrinks first (WO-028)', async t => {
  const mock = createMockStudio(); mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening');
  t.after(() => new Promise(resolve => { mock.server.close(resolve); mock.server.closeAllConnections(); }));
  const client = new PixelhueClient(); const state = await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port });
  const input = state.layers.find(l => l.id === 10);
  await client.apply([{ id: 10, window: { ...input.window, width: 400, height: 300 } }]);
  const writes = mock.writes.length;
  await assert.rejects(client.apply([{ id: 10, window: { ...input.window, width: 600, height: 300 } }]), /limited to 512 × 480/);
  const free = state.sources.find(s => s.type === 2 && !s.usedBy);
  await assert.rejects(applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 2, id: free.id }, window: { x: 1000, y: 600, width: 640, height: 360 } }), /limited to 512 × 480/);
  assert.equal(mock.writes.length, writes);
  let next = await applyMvrLayer(client, { action: 'create', screenId: 8, source: { type: 4, id: 1 }, window: { x: 1000, y: 600, width: 800, height: 450 } });
  const screenWindow = next.layers.find(l => l.id === next.changedId);
  next = await applyMvrLayer(client, { action: 'source', screenId: 8, layerId: screenWindow.id, source: { type: 2, id: free.id } });
  const swapped = next.layers.find(l => l.id === screenWindow.id);
  assert.ok(swapped.window.width <= 512 && swapped.window.height <= 480, 'shrunk before the input was routed in');
});
