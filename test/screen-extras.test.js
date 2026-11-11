import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readScreens, applyScreens } from '../lib/studio-screens.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}
const last = (mock, path) => mock.writes.filter(w => w.path === path).at(-1)?.body;

test('screen test pattern options come from screen XML per type; the spacing unit follows the pattern', async t => {
  const { client, mock } = await fixture(t);
  let state = await readScreens(client);
  assert.equal(state.options[2].pattern.types.length, 22); assert.ok(!state.options[2].pattern.types.some(([v]) => v === 768 || v === 65535)); // only patterns PixelFlow offers
  assert.equal(state.options[4].pattern, null); assert.deepEqual(state.options[4].quality, ['brightness', 'contrast', 'hue', 'saturation']);
  assert.deepEqual(state.screens.find(s => s.id === 1).pattern, { enable: false, type: 0, bright: 3, grid: 5, lineWidth: 1, speed: 3 });
  state = await applyScreens(client, { action: 'pattern', id: 1, pattern: { enable: true, type: 7, bright: 4 } });
  assert.deepEqual(last(mock, 'screen/test-pattern'), [{ screenId: 1, testPattern: { enable: 1, type: 7, bright: 4, grid: 5, gridType: 0, gridLineWidth: 1, speed: 3 } }]);
  // Checkerboard (gear) → grid lines (pixels): spacing falls back to the XML pixel default and carries a vertical spacing.
  state = await applyScreens(client, { action: 'pattern', id: 1, pattern: { type: 516 } });
  assert.deepEqual(last(mock, 'screen/test-pattern')[0].testPattern, { enable: 1, type: 516, bright: 4, grid: 32, gridType: 1, gridLineWidth: 1, speed: 3, verticalGrid: 32 });
  state = await applyScreens(client, { action: 'pattern', id: 1, pattern: { grid: 100, lineWidth: 4, speed: 0 } });
  assert.deepEqual(state.screens.find(s => s.id === 1).pattern, { enable: true, type: 516, bright: 4, grid: 100, lineWidth: 4, speed: 0 });
  state = await applyScreens(client, { action: 'pattern', id: 1, pattern: { type: 2 } }); // back to a solid colour: gear unit, no vertical spacing
  assert.deepEqual(last(mock, 'screen/test-pattern')[0].testPattern, { enable: 1, type: 2, bright: 4, grid: 5, gridType: 0, gridLineWidth: 4, speed: 0 });
  state = await applyScreens(client, { action: 'pattern', id: 1, pattern: { enable: false } });
  assert.equal(state.screens.find(s => s.id === 1).pattern.enable, false); assert.equal(mock.screens.find(s => s.screenId === 1).testPattern.type, 2);
});

test('screen colour sends the whole imageQuality object; invalid requests and AUX patterns write nothing', async t => {
  const { client, mock } = await fixture(t), before = structuredClone(mock.screens.find(s => s.screenId === 2).imageQuality);
  const state = await applyScreens(client, { action: 'quality', id: 2, quality: { brightness: 120, hue: -10 } });
  assert.deepEqual(last(mock, 'screen/image-quality'), [{ screenId: 2, imageQuality: { ...before, brightness: { ...before.brightness, coefficient: 120 }, hue: -10 } }]);
  assert.deepEqual(state.screens.find(s => s.id === 2).quality, { brightness: 120, contrast: 100, hue: -10, saturation: 90 });
  const writes = mock.writes.length;
  await assert.rejects(applyScreens(client, { action: 'pattern', id: 2, pattern: { enable: true } }), /unavailable on this screen/); // AUX
  await assert.rejects(applyScreens(client, { action: 'pattern', id: 1, pattern: { type: 768 } }), /Unsupported test pattern/);
  await assert.rejects(applyScreens(client, { action: 'pattern', id: 1, pattern: { type: 7, grid: 9 } }), /Unsupported pattern spacing/);
  await assert.rejects(applyScreens(client, { action: 'pattern', id: 1, pattern: { type: 512, grid: 2000 } }), /Pattern spacing/);
  await assert.rejects(applyScreens(client, { action: 'pattern', id: 1, pattern: { colour: 1 } }), /Unsupported test pattern setting/);
  await assert.rejects(applyScreens(client, { action: 'quality', id: 1, quality: { gamma: 2 } }), /Unsupported screen colour/);
  await assert.rejects(applyScreens(client, { action: 'quality', id: 1, quality: { saturation: 201 } }), /Saturation/);
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('screen/test-pattern', [{ screenId: 1, testPattern: { enable: 1, type: 512, bright: 3, grid: 5, gridType: 0, gridLineWidth: 1, speed: 3 } }]), /code 8210/); // wrong unit
  await assert.rejects(client.call('screen/image-quality', [{ screenId: 1, imageQuality: { hue: 1 } }]), /code 8210/);
  mock.behavior.ignoreScreenExtras = true;
  await assert.rejects(applyScreens(client, { action: 'pattern', id: 1, pattern: { enable: true } }), /did not retain the test pattern/);
});

test('screen format follows the XML rules per dynamic range and orders writes so every step is valid', async t => {
  const { client, mock } = await fixture(t), tile = { id: mock.primary.interfaceId, pos: { x: 0, y: 0, width: 1920, height: 1080 } };
  await assert.rejects(applyScreens(client, { action: 'format', id: 1, format: { colorDepth: 10 } }), /Map an output/);
  let state = await applyScreens(client, { action: 'update', id: 1, window: { x: -100, y: 50, width: 1920, height: 1080 }, outputs: [tile] });
  assert.deepEqual(state.options[2].format.rules[1], { depths: [10, 12], fixed422: 12, gamuts: [2, 3] }); assert.equal(state.options[4].format, null);
  const sent = () => mock.writes.filter(w => w.path.startsWith('screen/color-')).map(w => [w.path.replace('screen/color-', ''), Object.values(w.body[0])[1].preset, w.body[0].connectorType]);
  state = await applyScreens(client, { action: 'format', id: 1, format: { dynamicRange: 1, colorDepth: 10, colorGamut: 3 } });
  assert.deepEqual(sent(), [['depth', 10, 6], ['gamut', 3, 6], ['dynamic-range', 1, 6]]); // depth and gamut before the range
  assert.deepEqual(state.screens.find(s => s.id === 1).format, { dynamicRange: 1, colorGamut: 3, colorSpace: 0, colorDepth: 10 });
  state = await applyScreens(client, { action: 'format', id: 1, format: { colorSpace: 1 } }); // 4:2:2 fixes 12 bit
  assert.deepEqual(sent().slice(3), [['space', 1, 6], ['depth', 12, 6]]);
  state = await applyScreens(client, { action: 'format', id: 1, format: { dynamicRange: 0, colorSpace: 0, colorDepth: 8, colorGamut: 1 } });
  assert.deepEqual(sent().slice(5), [['dynamic-range', 0, 6], ['gamut', 1, 6], ['space', 0, 6], ['depth', 8, 6]]); // leaving HDR: range first
  const writes = mock.writes.length;
  await assert.rejects(applyScreens(client, { action: 'format', id: 1, format: { dynamicRange: 2 } }), /bit depth for this dynamic range|gamut for this dynamic range/);
  await assert.rejects(applyScreens(client, { action: 'format', id: 1, format: { colorGamut: 2, colorSpace: 2 } }), /DCI-P3 needs RGB/);
  await assert.rejects(applyScreens(client, { action: 'format', id: 1, format: { colorSpace: 1, colorDepth: 10 } }), /4:2:2 uses 12 bit/);
  await assert.rejects(applyScreens(client, { action: 'format', id: 1, format: { hdr: 1 } }), /Unsupported screen format/);
  await assert.rejects(applyScreens(client, { action: 'format', id: 2, format: { colorDepth: 10 } }), /unavailable on this screen/); // AUX XML has no rules
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('screen/color-dynamic-range', [{ screenId: 1, dynamicRange: { preset: 1 }, connectorType: 6 }]), /code 8210/); // 8 bit Rec.709 cannot be HDR
  await assert.rejects(client.call('screen/color-depth', [{ screenId: 1, colorDepth: { preset: 10 } }]), /code 8210/); // connectorType missing
});
