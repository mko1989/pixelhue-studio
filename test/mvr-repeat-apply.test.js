import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { fixAspectRatios } from '../public/mvr-geometry.js';
import { createMockP20 } from '../test-support/mock-p20.js';

async function fixture(t, sourceType = 2) {
  const mock = createMockP20();
  Object.assign(mock.layers[0], { aspectRatio: { aspectRatio: 8, locked: 1 }, window: { x: 0, y: 0, width: 640, height: 360 } });
  mock.layers[0].source.general.sourceType = sourceType;
  mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening');
  t.after(() => new Promise((resolve) => { mock.server.close(resolve); mock.server.closeAllConnections(); }));
  const client = new PixelhueClient();
  const state = await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port });
  return { mock, client, state, input: mock.interfaces.find((input) => input.interfaceId === mock.layers[0].source.general.sourceId) };
}
const change = (layer, window) => ({ id: layer.id, window, aspectLock: layer.aspectLock, aspectMode: layer.aspectMode });

test('established source-ratio locks remain editable after input disconnect and repeated Apply', async (t) => {
  const { mock, client, state, input } = await fixture(t);
  input.state = 0;
  let layer = state.layers[0];
  for (let step = 0; step < 4; step++) {
    layer = (await client.apply([change(layer, { ...layer.window, x: 40 + step * 40 })])).layers[0];
    assert.equal(layer.window.x, 40 + step * 40);
    assert.equal(layer.aspectMode, 8); assert.equal(layer.aspectLock, 16 / 9);
  }
  layer = (await client.apply([change(layer, { ...layer.window, width: 320, height: 180 })])).layers[0];
  assert.equal(layer.window.width, 320);
  assert.ok(mock.writes.every((write) => write.path === 'layers/window'), 'ordinary edits must not reissue native aspect commands');
  await assert.rejects(client.apply([change(layer, { ...layer.window, width: 320, height: 240 })]), /locked aspect ratio/);
});

test('existing native source locks on Program/PVW windows survive ratio fix and Apply', async (t) => {
  const { mock, client, state } = await fixture(t, 3);
  const fixed = fixAspectRatios(state.layers, state.signals, state.screens[0]);
  assert.equal(fixed.fixed.length, 0);
  let layer = fixed.layers[0];
  layer = (await client.apply([change(layer, { ...layer.window, x: 200 })])).layers[0];
  layer = (await client.apply([change(layer, { ...layer.window, width: 320, height: 180 })])).layers[0];
  assert.equal(layer.window.x, 200); assert.equal(layer.window.width, 320); assert.equal(layer.aspectLock, 16 / 9);
  assert.ok(mock.writes.every((write) => write.path === 'layers/window'));
});

test('changed connected timing allows movement, requires fresh ratio for resize, and remains fixable', async (t) => {
  const { client, state, input } = await fixture(t);
  const cached = state.layers[0];
  input.actualTiming.horizontal.addTime = 1600; input.actualTiming.vertical.addTime = 1200;
  let actual = await client.apply([change(cached, { ...cached.window, x: 100 })]);
  assert.equal(actual.layers[0].window.x, 100);
  // Even readback's fresh ratio can temporarily differ from the retained rectangle.
  actual = await client.apply([change(actual.layers[0], { ...actual.layers[0].window, x: 200 })]);
  assert.equal(actual.layers[0].window.x, 200);
  await assert.rejects(client.apply([change(cached, { ...cached.window, width: 320, height: 180 })]), /connection or resolution changed/);
  const fixed = fixAspectRatios(actual.layers, actual.signals, actual.screens[0]);
  const corrected = await client.apply(fixed.layers.map((layer) => change(layer, layer.window)));
  assert.equal(corrected.layers[0].aspectLock, 4 / 3);
  assert.ok(Math.abs(corrected.layers[0].window.height - corrected.layers[0].window.width * 3 / 4) <= 1);
});

test('new source-ratio locks still require a connected direct input', async (t) => {
  const { mock, client, state, input } = await fixture(t);
  mock.layers[0].aspectRatio.locked = 0; input.state = 0;
  await assert.rejects(client.apply([change(state.layers[0], state.layers[0].window)]), /connection or resolution changed/);
  input.state = 1; mock.layers[0].source.general.sourceType = 3;
  await assert.rejects(client.apply([change(state.layers[0], state.layers[0].window)]), /connection or resolution changed/);
  assert.equal(mock.writes.length, 0);
});

test('readback detects a native lock lost during a geometry-only write', async (t) => {
  const { client, state } = await fixture(t);
  const transport = client.transport;
  // Preserve the lock in pre-write state, then emulate firmware losing it after PUT.
  let written = false;
  client.transport = async (options) => {
    const response = await transport(options);
    if (options.path.endsWith('layers/window')) written = true;
    if (written && options.path.endsWith('layers/list-detail')) response.data.list[0].aspectRatio.locked = 0;
    return response;
  };
  await assert.rejects(client.apply([change(state.layers[0], { ...state.layers[0].window, x: 100 })]), /did not retain/);
});
