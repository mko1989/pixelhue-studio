import test from 'node:test';
import assert from 'node:assert/strict';
import { readInputAdvanced, applyInputAdvanced } from '../lib/input-advanced.js';
import { advancedFixture } from '../test-support/input-advanced.js';

test('advanced controls inherit generic XML but respect sparse card/port exclusions and input roles', async () => {
  const { client } = advancedFixture(), state = await readInputAdvanced(client);
  assert.deepEqual(state.inputs.map(i => i.id), [1, 2, 3]);
  const first = state.inputs[0], dp = state.inputs[2];
  assert.ok(first.fields.some(f => f.key === 'imageQuality.brightness.R'));
  assert.ok(!first.fields.some(f => f.key === 'colorGamut.preset'));
  assert.ok(!first.fields.some(f => f.key === 'imageQuality.gamma'));
  assert.equal(dp.fields.find(f => f.key === 'imageQuality.gamma').step, 0.01);
  assert.equal(dp.values['imageQuality.gamma'], 1); assert.equal(first.mosaicSupported, true);
});
test('batch advanced writes preserve image channels, metadata, gamma scale and HDCP version', async () => {
  const { client, raw, writes } = advancedFixture(); const before = structuredClone(raw[2].imageQuality);
  const result = await applyInputAdvanced(client, { changes: [{ id: 3, settings: { compatibilityMode: 1, 'imageQuality.brightness.R': 120, 'imageQuality.gamma': 2.2, 'hdcp.enable': 1, 'colorRange.preset': 1 } }] });
  assert.equal(result.inputs[2].values['imageQuality.gamma'], 2.2);
  assert.deepEqual(raw[2].imageQuality, { ...before, brightness: { ...before.brightness, R: 120 }, gamma: 220 });
  assert.deepEqual(writes.find(w => w.path === 'interface/hdcp').body, [{ interfaceId: 3, hdcp: { enable: 1, preset: 2 } }]);
  assert.deepEqual(writes.find(w => w.path === 'interface/color-range').body, [{ interfaceId: 3, colorRange: { preset: 1 } }]);
  assert.equal(raw[0].compatibilityMode, 0);
});
test('invalid or unavailable fields, ranges, steps, IDs and mosaics reject the whole plan before writing', async () => {
  const { client, writes } = advancedFixture();
  const invalid = [{ id: 4, settings: { compatibilityMode: 1 } }, { id: 1, settings: { 'colorGamut.preset': 1 } },
    { id: 3, settings: { 'imageQuality.gamma': 2.222 } }, { id: 1, settings: { compatibilityMode: 9 } }, { id: 2, settings: { 'imageQuality.hue': 999 } },
    { id: 2, mosaic: { group: 17, side: 'left' } }];
  for (const change of invalid) await assert.rejects(applyInputAdvanced(client, { changes: [{ id: 1, settings: { compatibilityMode: 1 } }, change] }));
  assert.equal(writes.length, 0);
});
const pair = (group = 1) => [{ id: 1, mosaic: { group, side: 'left' } }, { id: 2, mosaic: { group, side: 'right' } }];
test('native tiled groups use POST singleton bodies, exact left/right positions and verified removal', async () => {
  const { client, writes } = advancedFixture();
  let state = await applyInputAdvanced(client, { changes: pair(4) });
  assert.equal(state.inputs[0].mosaic.group, 4); assert.ok(writes.every(w => w.method === 'POST'));
  assert.deepEqual(writes[1].body, { interfaceId: 2, row: 1, column: 2, index: 1, enable: 1, position: { x: 1920, y: 0, width: 1920, height: 1080 }, mosaicGroup: 4 });
  state = await applyInputAdvanced(client, { changes: pair(4).map(c => ({ id: c.id, mosaic: { group: 0, side: 'none' } })) });
  assert.ok(state.inputs.slice(0, 2).every(i => i.mosaic.group === 0));
});
test('tile pairs require matching connector and detailed timing; unrelated invalid groups do not block colour writes', async () => {
  const { client, raw, writes } = advancedFixture();
  await assert.rejects(applyInputAdvanced(client, { changes: [pair()[0], { id: 3, mosaic: { group: 1, side: 'right' } }] }), /matching/);
  raw[1].presetTiming.horizontal.frontPorch++;
  await assert.rejects(applyInputAdvanced(client, { changes: pair() }), /matching/);
  assert.equal(writes.length, 0);
  for (const i of raw.slice(0, 3)) i.interfaceMacMosaic = { enable: 1, mosaicGroup: 8, index: 0 };
  await applyInputAdvanced(client, { changes: [{ id: 1, settings: { compatibilityMode: 1 } }] });
  assert.equal(writes.length, 1);
});
test('tile swaps remove old memberships first; unchanged side or overfull final groups are rejected', async () => {
  const { client, writes } = advancedFixture(); await applyInputAdvanced(client, { changes: pair() }); writes.length = 0;
  await applyInputAdvanced(client, { changes: [{ id: 1, mosaic: { group: 1, side: 'right' } }, { id: 2, mosaic: { group: 1, side: 'left' } }] });
  assert.deepEqual(writes.map(w => w.body.enable), [0, 0, 1, 1]);
  const count = writes.length;
  await assert.rejects(applyInputAdvanced(client, { changes: [{ id: 3, mosaic: { group: 1, side: 'left' } }] }), /at most/);
  assert.equal(writes.length, count);
});
test('firmware acknowledgements alone are insufficient when readback differs', async () => {
  const { client, behavior } = advancedFixture(); behavior.ignore = true;
  await assert.rejects(applyInputAdvanced(client, { changes: [{ id: 1, settings: { compatibilityMode: 1 } }] }), /did not retain/);
});
