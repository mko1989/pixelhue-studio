import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { buildLayerPreset } from '../lib/layer-presets.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}
const last = (mock, path) => mock.writes.filter(w => w.path === path).at(-1);

test('a layer preset stores every part with its own enable, position relative to the screen, and applies after assessment', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  assert.equal(state.layerPresets.supported, true); assert.deepEqual(state.layerPresets.colors, ['#257cff', '#e96a6a']); assert.equal(state.layerPresets.max, 3);
  assert.equal(state.layerPresets.parts.length, 11);
  await applyProgramming(client, { action: 'effect', screenId: 1, id: 20, effect: { opacity: 60, border: { enable: true, h: 9 } } });
  state = await applyProgramming(client, { action: 'layerpreset-save', screenId: 1, id: 20, name: 'Lower third', color: '#e96a6a', parts: ['pos', 'size', 'border', 'effect'] });
  const body = last(mock, 'layers/layer-preset/create').body[0], raw = mock.layers.find(l => l.layerId === 20);
  assert.deepEqual(body.general, { name: 'Lower third', labelColor: { R: 233, G: 106, B: 106 } });
  assert.deepEqual(body.posPreset, { enable: 1, x: raw.window.x + 100, y: raw.window.y - 50 }); // main screen origin is (-100, 50)
  assert.deepEqual(body.sizePreset, { enable: 1, width: 640, height: 360 });
  assert.equal(body.borderPreset.border.size.hWidth, 9); assert.equal(body.effectPreset.opacity, 60);
  assert.deepEqual([body.sourcePreset.enable, body.maskPreset.enable, body.cutFillPreset.enable, body.freezePreset.enable], [0, 0, 0, 0]);
  assert.deepEqual(body.cutFillPreset.cutFill.relative, { x: 0, y: 0, width: 100, height: 100 }); // defaults without a cut layer
  assert.deepEqual(state.layerPresets.list.map(p => [p.name, p.color, p.parts]), [['Lower third', '#e96a6a', ['pos', 'size', 'border', 'effect']]]);
  const id = state.layerPresets.list[0].id, target = mock.layers.find(l => l.layerId === 21);
  state = await applyProgramming(client, { action: 'layerpreset-apply', screenId: 1, id: 21, presetId: id });
  assert.deepEqual(mock.writes.slice(-2).map(w => w.path), ['layers/layer-preset/apply-access', 'layers/layer-preset/apply']);
  assert.deepEqual(last(mock, 'layers/layer-preset/apply').body[0].layerIds, [{ layerId: 21 }]);
  assert.equal(last(mock, 'layers/layer-preset/apply').body[0].layerPreset.layerPresetId, id);
  assert.equal(target.opacity, 60); assert.equal(target.border.size.hWidth, 9); assert.deepEqual(target.window, raw.window);
  mock.behavior.layerPresetFail = true; const writes = mock.writes.filter(w => w.path.endsWith('/apply')).length;
  await assert.rejects(applyProgramming(client, { action: 'layerpreset-apply', screenId: 1, id: 21, presetId: id }), /cannot apply this layer preset.*reason 3/);
  assert.equal(mock.writes.filter(w => w.path.endsWith('/apply')).length, writes);
});

test('layer presets rename, recolour and delete; names, colours, parts and the device limit are checked first', async t => {
  const { client, mock } = await fixture(t), save = (name, extra = {}) => applyProgramming(client, { action: 'layerpreset-save', screenId: 1, id: 20, name, parts: ['size'], ...extra });
  let state = await save('A'); const id = state.layerPresets.list[0].id;
  await assert.rejects(save('A'), /already exists/);
  await assert.rejects(save('B', { parts: [] }), /Choose what the layer preset stores/);
  await assert.rejects(save('B', { parts: ['size', 'glow'] }), /Choose what/);
  await assert.rejects(save('B', { color: '#123456' }), /device label colours/);
  await assert.rejects(save(''), /Layer preset name/);
  await assert.rejects(applyProgramming(client, { action: 'layerpreset-apply', screenId: 1, id: 20, presetId: 99 }), /no longer exists/);
  assert.equal(mock.writes.filter(w => w.path === 'layers/layer-preset/create').length, 1);
  state = await applyProgramming(client, { action: 'layerpreset-update', presetId: id, name: 'Renamed', color: '#e96a6a' });
  assert.deepEqual(last(mock, 'layers/layer-preset/apply-modify').body[0].general, { name: 'Renamed', labelColor: { R: 233, G: 106, B: 106 } });
  assert.equal(last(mock, 'layers/layer-preset/apply-modify').body[0].sizePreset.width, 640); // whole preset re-sent
  await save('B'); await save('C');
  await assert.rejects(save('D'), /at most 3 layer presets/);
  await assert.rejects(applyProgramming(client, { action: 'layerpreset-update', presetId: id, name: 'B' }), /already exists/);
  await assert.rejects(client.call('layers/layer-preset/create', [{ general: { name: 'B', labelColor: { R: 1, G: 1, B: 1 } } }]), /code 8210/); // parts missing
  state = await applyProgramming(client, { action: 'layerpreset-delete', presetId: id });
  assert.deepEqual(last(mock, 'layers/layer-preset/delete'), { path: 'layers/layer-preset/delete', method: 'DELETE', body: [{ layerPresetId: id }] });
  assert.deepEqual(state.layerPresets.list.map(p => p.name), ['B', 'C']);
});

test('preset bodies take the cut layer for Cut & Fill and the primary source ids', () => {
  const raw = { window: { x: 150, y: 80, width: 300, height: 200 }, general: { flipType: 2, isFreeze: 1 }, opacity: 80, source: { general: { sourceId: 1, sourceType: 2, sourceName: 'x' }, primary: { sourceId: 7, sourceType: 2 } } };
  const cut = { general: { isInverse: 1 }, cutFill: { enable: 1, relative: { x: 5, y: 0, width: 90, height: 100 } }, source: { general: { sourceId: 3, sourceType: 2 } } };
  const body = buildLayerPreset(raw, cut, { x: 100, y: 50 }, { name: 'n', color: { R: 1, G: 2, B: 3 }, parts: ['source', 'cutFill', 'flip', 'freeze'] });
  assert.deepEqual(body.sourcePreset, { enable: 1, source: { general: { sourceId: 7, sourceType: 2, sourceName: 'x' } } });
  assert.deepEqual(body.cutFillPreset, { enable: 1, isInverse: 1, cutFill: cut.cutFill, source: cut.source });
  assert.deepEqual(body.posPreset, { enable: 0, x: 50, y: 30 }); assert.deepEqual(body.flipPreset, { enable: 1, flipType: 2 }); assert.deepEqual(body.freezePreset, { enable: 1, isFreeze: 1 });
  assert.equal(buildLayerPreset(raw, undefined, { x: 0, y: 0 }, { name: 'n', color: {}, parts: ['cutFill'] }).cutFillPreset.enable, 0);
  // Live P20 reports primary { 0, 0 } without a backup relation; the layer's own source must be kept.
  assert.deepEqual(buildLayerPreset({ ...raw, source: { general: { sourceId: 38, sourceType: 2 }, primary: { sourceType: 0, sourceId: 0 } } }, undefined, { x: 0, y: 0 }, { name: 'n', color: {}, parts: ['source'] }).sourcePreset.source, { general: { sourceId: 38, sourceType: 2 } });
});
