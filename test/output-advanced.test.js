import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readOutputAdvanced, applyOutputAdvanced } from '../lib/output-advanced.js';
import { readInputAdvanced } from '../lib/input-advanced.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}
const keys = o => o.fields.map(f => f.key);

test('output format and colour fields come from the connector XML for the output role; copies are left out', async t => {
  const { client, mock } = await fixture(t), state = await readOutputAdvanced(client);
  const main = state.outputs.find(o => o.id === mock.primary.interfaceId), aux = state.outputs.find(o => o.role === 'AUX'), mvr = state.outputs.find(o => o.role === 'MVR');
  assert.ok(main && aux && mvr); assert.ok(!state.outputs.some(o => o.id === 400000)); // copy port follows its primary
  assert.deepEqual(keys(main).slice(0, 3), ['colorSpace.preset', 'colorRange.preset', 'colorGamut.preset']);
  assert.ok(keys(main).includes('imageQuality.brightness.coefficient') && keys(main).includes('imageQuality.hue'));
  assert.ok(!keys(aux).includes('colorGamut.preset')); // HDMI 1.3 connector XML has no gamut
  assert.ok(!keys(main).some(k => /hdcp|colorDepth|compatibilityMode|DynamicRange/.test(k)));
  assert.deepEqual(main.fields.find(f => f.key === 'colorSpace.preset').options.map(o => o[0]), [0, 1, 2]);
  assert.equal(main.values['imageQuality.saturation'], 90);
  // Role-aware lookup must not leak output-role XML into inputs.
  assert.ok((await readInputAdvanced(client)).inputs.every(i => !i.fields.some(f => f.key.startsWith('colorSpace'))));
});

test('format writes send preset only; colour correction sends the whole imageQuality object', async t => {
  const { client, mock } = await fixture(t), id = mock.primary.interfaceId, before = structuredClone(mock.primary.imageQuality);
  const state = await applyOutputAdvanced(client, { changes: [{ id, settings: { 'colorSpace.preset': 2, 'colorRange.preset': 0, 'imageQuality.brightness.R': 120, 'imageQuality.hue': -15 } }] });
  const sent = path => mock.writes.find(w => w.path === path)?.body;
  assert.deepEqual(sent('interface/color-space'), [{ interfaceId: id, colorSpace: { preset: 2 } }]);
  assert.deepEqual(sent('interface/color-range'), [{ interfaceId: id, colorRange: { preset: 0 } }]);
  assert.deepEqual(sent('interface/image-quality'), [{ interfaceId: id, imageQuality: { ...before, brightness: { ...before.brightness, R: 120 }, hue: -15 } }]);
  assert.equal(state.outputs.find(o => o.id === id).values['imageQuality.brightness.R'], 120);
  assert.equal(mock.primary.imageQuality.colorTemperature.quickAdjust.value, 6500); assert.equal(mock.primary.colorSpace.actual, 0);
});

test('unsupported values, connectors and DCI-P3 with YCbCr are rejected before any write; device refusals surface', async t => {
  const { client, mock } = await fixture(t), id = mock.primary.interfaceId, aux = (await readOutputAdvanced(client)).outputs.find(o => o.role === 'AUX').id;
  const bad = [[{ id, settings: { 'colorSpace.preset': 3 } }], [{ id: aux, settings: { 'colorGamut.preset': 1 } }], [{ id: 400000, settings: { 'colorRange.preset': 0 } }],
    [{ id, settings: { 'imageQuality.hue': 181 } }], [{ id, settings: { 'imageQuality.saturation': 50.5 } }], [{ id, settings: {} }], [{ id, settings: { 'hdcp.enable': 1 } }],
    [{ id, settings: { 'colorRange.preset': 0 } }, { id, settings: { 'colorRange.preset': 1 } }], [{ id, settings: { 'colorGamut.preset': 2, 'colorSpace.preset': 1 } }]];
  for (const changes of bad) await assert.rejects(applyOutputAdvanced(client, { changes }));
  await assert.rejects(applyOutputAdvanced(client, { changes: [{ id, settings: { 'colorGamut.preset': 2, 'colorSpace.preset': 1 } }] }), /DCI-P3 needs RGB/);
  assert.equal(mock.writes.length, 0);
  await assert.rejects(client.call('interface/color-space', [{ interfaceId: id, colorSpace: { preset: 9 } }]), /code 8210/);
  await assert.rejects(client.call('interface/image-quality', [{ interfaceId: id, imageQuality: { hue: 3 } }]), /code 8210/);
  mock.behavior.ignoreOutputAdvanced = true;
  await assert.rejects(applyOutputAdvanced(client, { changes: [{ id, settings: { 'colorRange.preset': 0 } }] }), /did not retain the output format/);
});
