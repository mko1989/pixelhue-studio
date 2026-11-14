import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { planEffects, effectValues } from '../lib/layer-effects.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}
const fx = (client, effect, id = 20) => applyProgramming(client, { action: 'effect', screenId: 1, id, effect });
const last = (mock, path) => mock.writes.filter(w => w.path === path).at(-1)?.body;
const raw = (mock, id = 20) => mock.layers.find(l => l.layerId === id);

test('effect support comes from layer_2.xml and layer values are normalised from the device sections', async t => {
  const { client } = await fixture(t), state = await readProgramming(client);
  assert.deepEqual(Object.fromEntries(Object.entries(state.effects).filter(([k]) => k !== 'borderStyles')),
    { opacity: true, flip: true, mono: true, inverse: true, mask: true, shadow: true, border: true, quality: true, crop: true, key: true, cutFill: true });
  const layer = state.layers.find(l => l.id === 20);
  assert.deepEqual(layer.fx.border, { enable: false, style: 1, h: 2, v: 2, color: '#3460d8', opacity: 100 });
  assert.deepEqual(layer.fx.crop, { enable: false, x: 0, y: 0, width: 100000, height: 100000 });
  assert.equal(layer.fx.opacity, 100); assert.equal(layer.fx.locked, false);
  // Layers the device reports without these sections (LOGO, older firmware) expose nulls, not defaults.
  assert.deepEqual(effectValues({ general: { name: 'x' } }).mask, null);
  client.configurationXml = '<File><path>deviceconfig/device/layer_2.xml</path><data><Layer Type="2"><Opacity Support="1" Editable="1"/><Mask Support="0"/></Layer></data></File>';
  const reduced = (await readProgramming(client)).effects;
  assert.equal(reduced.opacity, true); assert.equal(reduced.mask, false); assert.equal(reduced.border, false);
  await assert.rejects(fx(client, { mask: { enable: true } }), /Mask is unavailable on this device/);
});

test('opacity, flip, mono and lock use their own endpoints; general is sent whole', async t => {
  const { client, mock } = await fixture(t);
  let state = await fx(client, { opacity: 55 });
  assert.deepEqual(last(mock, 'layers/opacity'), [{ layerId: 20, opacity: 55 }]); assert.equal(state.layers.find(l => l.id === 20).fx.opacity, 55);
  state = await fx(client, { flipV: true, mono: true });
  const general = last(mock, 'layers/general')[0].general;
  assert.equal(general.flipType, 2); assert.equal(general.isMonochrome, 1); assert.equal(general.name, 'Program layer'); assert.equal(general.capacity, 1);
  state = await fx(client, { flipH: true }); // XOR-style combine with the existing vertical flip: mirror = 3
  assert.equal(last(mock, 'layers/general')[0].general.flipType, 3); assert.equal(state.layers.find(l => l.id === 20).fx.flipV, true);
  state = await fx(client, { locked: true });
  assert.deepEqual(last(mock, 'layers/lock'), [{ layerId: 20, isLock: 1 }]);
  const writes = mock.writes.length;
  await assert.rejects(fx(client, { opacity: 10 }), /locked on the device/);
  await assert.rejects(fx(client, { locked: false, opacity: 10 }), /locked on the device/);
  assert.equal(mock.writes.length, writes);
  assert.equal((await fx(client, { locked: false })).layers.find(l => l.id === 20).fx.locked, false);
});

test('border, mask, shadow, colour and crop merge into the full device section with both px and ratio', async t => {
  const { client, mock } = await fixture(t);
  await fx(client, { border: { enable: true, h: 8, color: '#ff8000', style: 3 } });
  assert.deepEqual(last(mock, 'layers/border'), [{ layerId: 20, border: { enable: 1, type: 3, size: { hWidth: 8, vWidth: 2 }, color: { R: 255, G: 128, B: 0, coefficient: 0, opacity: 100 } } }]);
  await fx(client, { mask: { enable: true, left: 64, bottom: 36 } }); // layer 20 is 640 × 360
  assert.deepEqual(last(mock, 'layers/mask'), [{ layerId: 20, mask: { enable: 1, left: 64, leftRatio: 10000, right: 0, rightRatio: 0, top: 0, topRatio: 0, buttom: 36, buttomRatio: 10000 } }]);
  await fx(client, { shadow: { enable: true, x: -20, feather: 30, color: '#102030' } });
  assert.deepEqual(last(mock, 'layers/shadow'), [{ layerId: 20, shadow: { general: { enable: 1, feather: 30 }, window: { width: 100, height: 100, x: -20, y: 5 }, color: { R: 16, G: 32, B: 48, coefficient: 0, opacity: 100 } } }]);
  await fx(client, { quality: { brightness: 120, hue: -30 } });
  const iq = last(mock, 'layers/image-quality')[0].imageQuality;
  assert.deepEqual(iq.brightness, { R: 100, G: 100, B: 100, coefficient: 120 }); assert.equal(iq.hue, -30); assert.equal(iq.saturation, 100);
  assert.deepEqual(iq.colorTemperature, { mode: 0, quickAdjust: { value: 6500 } }); assert.equal(iq.gammaScale, 100);
  const state = await fx(client, { crop: { enable: true, x: 25000, width: 50000 } });
  assert.deepEqual(last(mock, 'layers/crop'), [{ layerId: 20, crop: { enable: 1, widthRatio: 50000, heightRatio: 100000, xRatio: 25000, yRatio: 0 } }]);
  assert.deepEqual(state.layers.find(l => l.id === 20).fx.crop, { enable: true, x: 25000, y: 0, width: 50000, height: 100000 });
  assert.equal(raw(mock, 21).border.enable, 0); // other layers untouched
});

test('invalid effects write nothing; the mock device refuses partial sections and out-of-range values', async t => {
  const { client, mock } = await fixture(t), before = mock.writes.length;
  await assert.rejects(fx(client, { opacity: 101 }), /Opacity must be 0–100/);
  await assert.rejects(fx(client, { glow: 1 }), /Unsupported layer effect/);
  await assert.rejects(fx(client, { border: { h: 513 } }), /Border width/);
  await assert.rejects(fx(client, { border: { color: 'red' } }), /#rrggbb/);
  await assert.rejects(fx(client, { border: { style: 0 } }), /Unsupported border style/);
  await assert.rejects(fx(client, { mask: { left: 400, right: 240 } }), /hide the whole layer/);
  await assert.rejects(fx(client, { shadow: { width: 4 } }), /Shadow width/);
  await assert.rejects(fx(client, { crop: { x: 60000, width: 50000 } }), /Crop width/);
  await assert.rejects(fx(client, { opacity: 50, quality: { hue: 200 } }), /Hue/); // whole request rejected before the opacity write
  await assert.rejects(fx(client, { opacity: 50 }, 999), /no longer exists/);
  assert.equal(mock.writes.length, before);
  await assert.rejects(client.call('layers/border', [{ layerId: 20, border: { enable: 1 } }]), /code 8210/);
  await assert.rejects(client.call('layers/mask', [{ layerId: 20, mask: { ...raw(mock).mask, leftRatio: 100001 } }]), /code 8210/);
  await assert.rejects(client.call('layers/opacity', [{ layerId: 20, opacity: 255 }]), /code 8210/);
  mock.behavior.ignoreEffects = true;
  await assert.rejects(fx(client, { opacity: 40 }), /did not retain the layer effect/);
});

test('effect plans respect layer type and source rules from PixelFlow', () => {
  const support = { opacity: true, flip: true, mono: true, inverse: true, mask: true, shadow: true, border: true, quality: true, crop: true };
  const layer = { layerId: 5, layerIdObj: { type: 4 }, isLock: 0, window: { width: 100, height: 100 }, general: {}, border: { size: {}, color: {} }, shadow: { general: {}, window: {}, color: {} },
    mask: { left: 0, right: 0, top: 0, buttom: 0 }, crop: { xRatio: 0, yRatio: 0, widthRatio: 100000, heightRatio: 100000 }, source: { general: { sourceType: 3 } } };
  assert.throws(() => planEffects(layer, { border: { enable: true } }, support), /normal layers only/); // AUX
  assert.throws(() => planEffects(layer, { shadow: { enable: true } }, support), /normal layers only/);
  assert.throws(() => planEffects(layer, { crop: { enable: true } }, support), /showing an input/); // screen source
  assert.equal(planEffects(layer, { mask: { enable: true, top: 10 } }, support)[0][1].mask.topRatio, 10000);
  assert.throws(() => planEffects({ ...layer, layerIdObj: { type: 32 } }, { mask: { enable: true } }, support), /unavailable on this layer/); // LOGO
});

test('keying sends the whole cutout object, switches the picker cursor and luma fill off with the key, and refuses Cut & Fill layers', async t => {
  const { client, mock } = await fixture(t), before = structuredClone(raw(mock).cutout);
  let state = await fx(client, { key: { enable: true, type: 1, color: '#00ff00', hueClip: 20, softness: 80, edgeSmooth: true } });
  assert.deepEqual(last(mock, 'layers/cutout'), [{ layerId: 20, cutout: { ...before, enable: 1, type: 1,
    hue: { ...before.hue, hueClip: 20, saturationGain: 80, edgeSmooth: 1, color: { R: 0, G: 255, B: 0, coefficient: 0 } } } }]);
  assert.equal(state.layers.find(l => l.id === 20).fx.key.color, '#00ff00'); assert.equal(state.layers.find(l => l.id === 20).fx.key.enable, true);
  assert.deepEqual(last(mock, 'layers/cutout')[0].cutout.brightness.keySource, before.brightness.keySource); // untouched nested fields
  await fx(client, { key: { type: 0, fill: true, fillColor: '#112233', threshold: 30 } });
  raw(mock).cutout.cursor.enable = 1;
  await fx(client, { key: { enable: false } });
  const off = last(mock, 'layers/cutout')[0].cutout;
  assert.equal(off.enable, 0); assert.equal(off.cursor.enable, 0); assert.equal(off.brightness.foregroundColor.enable, 0); assert.equal(off.brightness.threshold, 30);
  const writes = mock.writes.length;
  await assert.rejects(fx(client, { key: { hueClip: 4 } }), /Key hueClip/);
  await assert.rejects(fx(client, { key: { type: 3 } }), /Unsupported key type/);
  await assert.rejects(fx(client, { key: { keyInverse: 1 } }), /Unsupported keying setting/);
  raw(mock).cutFill.enable = 1;
  await assert.rejects(fx(client, { key: { enable: true } }), /Cut & Fill/);
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('layers/cutout', [{ layerId: 20, cutout: { ...raw(mock).cutout, enable: 1 } }]), /code 8210/); // the mock device refuses it too
  await assert.rejects(client.call('layers/cutout', [{ layerId: 20, cutout: { enable: 1 } }]), /code 8210/);
});

test('Cut & Fill switches on the selected layer and edits curve, position, invert and source on the linked cut layer', async t => {
  const { client, mock } = await fixture(t);
  await assert.rejects(fx(client, { cutFill: { x: 10 } }), /Turn Cut & Fill on first/);
  let state = await fx(client, { cutFill: { enable: true } });
  assert.deepEqual(last(mock, 'layers/cut-fill-switch'), [{ layerId: 20, enable: 1 }]);
  const cutId = raw(mock).cutId; assert.ok(cutId); assert.equal(raw(mock).layerIdObj.type, 256);
  // The fill layer stays a normal editable layer; the cut layer is not listed as a program layer.
  const layer = state.layers.find(l => l.id === 20); assert.equal(layer.type, 2); assert.equal(layer.fx.cutFill.enable, true);
  assert.ok(!state.layers.some(l => l.id === cutId));
  state = await fx(client, { cutFill: { x: -20, width: 150, startX: 16, endY: 235 } });
  assert.deepEqual(last(mock, 'layers/relative'), [{ layerId: cutId, relative: { x: -20, y: 0, width: 150, height: 100 } }]);
  assert.deepEqual(last(mock, 'layers/curve'), [{ layerId: cutId, curve: { start: { x: 16, y: 0 }, end: { x: 255, y: 235 } } }]);
  const input = state.sources.find(s => s.type === 2);
  state = await fx(client, { cutFill: { inverse: true, source: { id: input.id, type: 2 } } });
  assert.equal(last(mock, 'layers/general')[0].layerId, cutId); assert.equal(last(mock, 'layers/general')[0].general.isInverse, 1);
  assert.deepEqual(last(mock, 'layers/source'), [{ layerId: cutId, source: { general: { sourceId: input.id, sourceType: 2 } } }]);
  assert.deepEqual([state.layers.find(l => l.id === 20).fx.cutFill.sourceId, state.layers.find(l => l.id === 20).fx.cutFill.inverse], [input.id, true]);
  state = await fx(client, { cutFill: { reset: true } });
  assert.deepEqual(last(mock, 'layers/reset-cut'), [{ layerId: cutId, isInverse: 0, source: { sourceId: 0, sourceType: 1 }, curve: { start: { x: 0, y: 0 }, end: { x: 255, y: 255 } }, relative: { x: 0, y: 0, width: 100, height: 100 } }]);
  assert.equal(state.layers.find(l => l.id === 20).fx.cutFill.width, 100);
  const writes = mock.writes.length;
  await assert.rejects(fx(client, { cutFill: { width: 201 } }), /Cut width/);
  await assert.rejects(fx(client, { cutFill: { startX: 256 } }), /Cut curve/);
  await assert.rejects(fx(client, { cutFill: { source: { id: 1, type: 3 } } }), /input or a gallery image/);
  await assert.rejects(fx(client, { cutFill: { enable: false, x: 1 } }), /separately/);
  await assert.rejects(fx(client, { key: { enable: true } }), /Cut & Fill/); // keying is refused on a Cut & Fill layer
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('layers/relative', [{ layerId: 20, relative: { x: 0, y: 0, width: 100, height: 100 } }]), /code 8210/); // not a cut layer
  state = await fx(client, { cutFill: { enable: false } });
  // Live P20 (WO-039): switching off keeps the cut layer and cutId, both with cutFill.enable 0; Studio still reports it as off and hides the cut layer.
  assert.equal(raw(mock).layerIdObj.type, 2); assert.equal(state.layers.find(l => l.id === 20).fx.cutFill.enable, false);
  assert.equal(raw(mock).cutId, cutId); assert.equal(mock.layers.find(l => l.layerId === cutId).cutFill.enable, 0); assert.ok(!state.layers.some(l => l.id === cutId));
  await assert.rejects(fx(client, { cutFill: { x: 5 } }), /Turn Cut & Fill on first/);
  state = await fx(client, { cutFill: { enable: true } }); assert.equal(raw(mock).cutId, cutId); assert.equal(state.layers.find(l => l.id === 20).fx.cutFill.enable, true); // the same cut layer is reused
  await fx(client, { cutFill: { enable: false } });
  await fx(client, { key: { enable: true } });
  await assert.rejects(fx(client, { cutFill: { enable: true } }), /cannot be combined with keying/);
  await assert.rejects(client.call('layers/cut-fill-switch', [{ layerId: 20, enable: 1 }]), /code 8298/);
});

test('duplicate and mirror copy use layers/copy with the PixelFlow body; a Cut & Fill layer brings its cut layer', async t => {
  const { client, mock } = await fixture(t), copy = extra => applyProgramming(client, { action: 'copy', screenId: 1, id: 20, ...extra });
  const before = { ...raw(mock).window }; // global; main screen origin (-100, 50), 1920 wide
  let state = await copy({});
  assert.deepEqual(last(mock, 'layers/copy'), [{ layerId: 20, flipType: 0, window: { ...before, x: before.x + 40, y: before.y + 40 }, namePrefix: 'Layer ' }]);
  assert.equal(state.layers.filter(l => l.screenId === 1 && l.scene === 2).length, 2);
  state = await copy({ mirror: true });
  const localX = before.x + 100, mirrored = 1920 - before.width - localX;
  assert.deepEqual(last(mock, 'layers/copy'), [{ layerId: 20, flipType: 1, window: { ...before, x: mirrored - 100 }, namePrefix: 'Layer ' }]);
  assert.ok(state.layers.some(l => l.window.x === mirrored && l.fx.flipH));
  await fx(client, { cutFill: { enable: true } }); await fx(client, { cutFill: { x: 50, width: 50 } });
  await copy({});
  const body = last(mock, 'layers/copy'); assert.equal(body.length, 2); assert.equal(body[1].layerId, raw(mock).cutId);
  assert.deepEqual(body[1].window, { x: Math.round(640 * 0.5) + body[0].window.x, y: body[0].window.y, width: 320, height: 360 });
  mock.behavior.resourceShort = true; const writes = mock.writes.length;
  await assert.rejects(copy({}), /no free layer resources/);
  await assert.rejects(copy({ mirror: 'yes' }), /Unsupported copy mode/);
  assert.equal(mock.writes.length, writes + 1);
});
test('opacity is never sent to bkg layers; the mock refuses it with 8210 as a P80 does (WO-042)', async t => {
  const { mock, client } = await fixture(t), bkg = mock.layers.find(l => l.layerIdObj.type === 16);
  assert.ok(bkg);
  const before = mock.writes.length;
  await assert.rejects(fx(client, { opacity: 40 }, bkg.layerId));
  assert.equal(mock.writes.length, before);
  await assert.rejects(client.call('layers/opacity', [{ layerId: bkg.layerId, opacity: 40 }]), /8210/);
});
