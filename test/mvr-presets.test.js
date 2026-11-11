import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readMvrPresets, applyMvrPresets } from '../lib/mvr-presets.js';
import { readLayout } from '../public/editor.js';
import { createMockStudio } from '../test-support/mock-studio.js';

process.env.PIXELHUE_STUDIO_DATA = await mkdtemp(join(tmpdir(), 'pixelhue-studio-mvr-'));
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); const state = await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, state };
}
const layout = (state, change = {}) => ({ format: 'pixelhue-mvr-layout', version: 1, serial: state.device.serial, screenId: state.screens[0].id, width: state.screens[0].width, height: state.screens[0].height,
  windows: state.layers.map(l => ({ id: l.id, window: { ...l.window, ...change }, aspectLock: l.aspectLock ?? null, aspectMode: l.aspectMode ?? 5, umdHeight: l.umdHeight })) });

test('MVR presets are stored per device in the app data folder, never sent to the device, and recall as valid layouts', async t => {
  const { client, mock, state } = await fixture(t);
  assert.deepEqual((await readMvrPresets(client)).presets, []);
  let result = await applyMvrPresets(client, { action: 'save', name: ' Rehearsal ', document: layout(state) });
  assert.equal(result.presets.length, 1); assert.equal(result.presets[0].name, 'Rehearsal'); assert.equal(result.overwritten, false);
  assert.equal(mock.writes.length, 0); // app memory only
  const stored = JSON.parse(await readFile(join(process.env.PIXELHUE_STUDIO_DATA, 'mvr-presets.json'), 'utf8'));
  assert.deepEqual(Object.keys(stored), [client.serial]); assert.equal(stored[client.serial][0].document.windows.length, state.layers.length);
  // The stored document passes the same validation as a layout file and reproduces the geometry.
  assert.deepEqual(readLayout(result.presets[0].document, state, state.screens[0].id).map(i => i.window), state.layers.map(l => l.window));
  // Saving the same name on the same output overwrites in place.
  result = await applyMvrPresets(client, { action: 'save', name: 'Rehearsal', document: layout(state, { x: 0 }) });
  assert.equal(result.presets.length, 1); assert.equal(result.overwritten, true); assert.equal(result.presets[0].document.windows[0].window.x, 0);
  result = await applyMvrPresets(client, { action: 'save', name: 'Show', document: layout(state) });
  result = await applyMvrPresets(client, { action: 'rename', id: result.saved, name: 'Show day' });
  assert.deepEqual(result.presets.map(p => p.name), ['Rehearsal', 'Show day']);
  await assert.rejects(applyMvrPresets(client, { action: 'rename', id: result.presets[1].id, name: 'Rehearsal' }), /already exists/);
  result = await applyMvrPresets(client, { action: 'delete', id: result.presets[0].id });
  assert.deepEqual(result.presets.map(p => p.name), ['Show day']);
  const other = new PixelhueClient(); other.serial = 'OTHER'; other.session = 'x';
  assert.deepEqual((await readMvrPresets(other)).presets, []); // another device sees nothing
});

test('invalid presets are refused and nothing is stored', async t => {
  const { client, state } = await fixture(t), before = (await readMvrPresets(client)).presets.length, save = (document, name = 'Bad') => applyMvrPresets(client, { action: 'save', name, document });
  await assert.rejects(save({ ...layout(state), serial: 'OTHER' }), /another device/);
  await assert.rejects(save({ ...layout(state), width: 1280 }), /MVR output changed/);
  await assert.rejects(save({ ...layout(state), windows: [] }), /MVR windows changed/);
  await assert.rejects(save(layout(state, { x: 5000 })), /invalid geometry/);
  await assert.rejects(save(layout(state, { width: 10 })), /invalid geometry/);
  await assert.rejects(save({ format: 'other' }), /Supply an MVR layout/);
  await assert.rejects(save(layout(state), ''), /Preset name/);
  await assert.rejects(applyMvrPresets(client, { action: 'delete', id: 'nope' }), /not found/);
  await assert.rejects(applyMvrPresets(client, { action: 'recall' }), /Unsupported MVR preset action/);
  assert.equal((await readMvrPresets(client)).presets.length, before);
});
