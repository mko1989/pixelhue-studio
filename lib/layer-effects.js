import { fail } from './pixelhue.js';
import { integer, choice, verified } from './studio-common.js';
import { configuration, xmlFile, xmlTree, child } from './configuration.js';

// Per-layer effects (WO-036), contracts from PixelFlow LayerAttribute/presenter/layerAttrEventHandle/* and
// api/layer/layer.ts: every PUT takes [{ layerId, <section> }] with the WHOLE section, never a delta.
// Ranges are the P20 layer_2.xml values; sections the device XML does not support are not offered.
const SECTIONS = { opacity: 'Opacity', flip: 'FlipType', mono: 'IsMonochrome', inverse: 'IsInverse', mask: 'Mask', shadow: 'Shadow', border: 'Borders', quality: 'ImageQuality', crop: 'Crop' };
const BORDER_STYLES = [[1, 'Outer'], [3, 'Soft'], [4, 'Halo'], [5, 'Halo in'], [6, 'Halo out']];
const RATIO = 100000;
const hex = c => `#${[c?.R, c?.G, c?.B].map(v => Number(v || 0).toString(16).padStart(2, '0')).join('')}`;
function rgb(value, label) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw fail(`${label} must be a #rrggbb colour.`);
  return { R: parseInt(value.slice(1, 3), 16), G: parseInt(value.slice(3, 5), 16), B: parseInt(value.slice(5, 7), 16) };
}
const findLayer = node => node.name === 'Layer' && node.attributes.Type === '2' ? node : node.children.map(findLayer).find(Boolean);
export async function effectSupport(client) {
  await configuration(client);
  if (client.effectSupportXml !== client.configurationXml || !client.effectSupport) {
    const layer = findLayer(xmlTree(xmlFile(client.configurationXml, 'deviceconfig/device/layer_2.xml')));
    const on = name => { const node = child(layer, name); return Boolean(node) && node.attributes.Support === '1' && node.attributes.Editable !== '0'; };
    client.effectSupport = Object.fromEntries(Object.entries(SECTIONS).map(([key, name]) => [key, on(name)]));
    client.effectSupport.borderStyles = BORDER_STYLES; client.effectSupportXml = client.configurationXml;
  }
  return client.effectSupport;
}
export function effectValues(l) {
  const flip = l.general?.flipType ?? 0, iq = l.imageQuality;
  return { opacity: l.opacity ?? null, flipH: Boolean(flip & 1), flipV: Boolean(flip & 2), mono: l.general?.isMonochrome === 1, inverse: l.general?.isInverse === 1, locked: l.isLock === 1,
    border: l.border ? { enable: l.border.enable === 1, style: l.border.type, h: l.border.size?.hWidth ?? 0, v: l.border.size?.vWidth ?? 0, color: hex(l.border.color), opacity: l.border.color?.opacity ?? 100 } : null,
    mask: l.mask ? { enable: l.mask.enable === 1, left: l.mask.left, right: l.mask.right, top: l.mask.top, bottom: l.mask.buttom } : null,
    shadow: l.shadow ? { enable: l.shadow.general?.enable === 1, feather: l.shadow.general?.feather ?? 0, ...l.shadow.window, color: hex(l.shadow.color), opacity: l.shadow.color?.opacity ?? 100 } : null,
    quality: iq ? { brightness: iq.brightness?.coefficient ?? 100, contrast: iq.contrast?.coefficient ?? 100, hue: iq.hue ?? 0, saturation: iq.saturation ?? 100 } : null,
    crop: l.crop ? { enable: l.crop.enable === 1, x: l.crop.xRatio, y: l.crop.yRatio, width: l.crop.widthRatio, height: l.crop.heightRatio } : null };
}
const flag = (value, label) => choice(value, [true, false], label) ? 1 : 0;
function keys(object, allowed, label) {
  if (!object || typeof object !== 'object' || !Object.keys(object).length || Object.keys(object).some(key => !allowed.includes(key))) throw fail(`Unsupported ${label} setting.`);
  return object;
}
// Builds every write before the first one is sent; throws on anything invalid.
export function planEffects(raw, changes, support) {
  keys(changes, ['opacity', 'flipH', 'flipV', 'mono', 'inverse', 'locked', 'border', 'mask', 'shadow', 'quality', 'crop'], 'layer effect');
  const type = raw.layerIdObj?.type, id = raw.layerId, writes = [], need = (key, label) => { if (!support[key]) throw fail(`${label} is unavailable on this device.`); };
  if (raw.isLock === 1 && !(Object.keys(changes).length === 1 && changes.locked === false)) throw fail('This layer is locked on the device. Unlock it first.', 409);
  if (changes.locked !== undefined) writes.push(['layers/lock', { layerId: id, isLock: flag(changes.locked, 'layer lock') }]);
  if (changes.opacity !== undefined) { need('opacity', 'Opacity'); writes.push(['layers/opacity', { layerId: id, opacity: integer(changes.opacity, 'Opacity', 0, 100) }]); }
  const general = {};
  if (changes.flipH !== undefined || changes.flipV !== undefined) {
    need('flip', 'Flip'); const now = raw.general?.flipType ?? 0;
    general.flipType = (flag(changes.flipH ?? Boolean(now & 1), 'flip') ? 1 : 0) | (flag(changes.flipV ?? Boolean(now & 2), 'flip') ? 2 : 0);
  }
  if (changes.mono !== undefined) { need('mono', 'Monochrome'); general.isMonochrome = flag(changes.mono, 'monochrome'); }
  if (changes.inverse !== undefined) { need('inverse', 'Invert'); general.isInverse = flag(changes.inverse, 'invert'); }
  if (Object.keys(general).length) writes.push(['layers/general', { layerId: id, general: { ...raw.general, ...general } }]);
  if (changes.border !== undefined) {
    need('border', 'Border'); if (type !== 2 || !raw.border) throw fail('Borders are available on normal layers only.');
    const c = keys(changes.border, ['enable', 'style', 'h', 'v', 'color', 'opacity'], 'border'), old = raw.border;
    writes.push(['layers/border', { layerId: id, border: { ...old, enable: c.enable === undefined ? old.enable : flag(c.enable, 'border'),
      type: c.style === undefined ? old.type : choice(c.style, BORDER_STYLES.map(s => s[0]), 'border style'),
      size: { ...old.size, ...(c.h === undefined ? {} : { hWidth: integer(c.h, 'Border width', 0, 512) }), ...(c.v === undefined ? {} : { vWidth: integer(c.v, 'Border height', 0, 512) }) },
      color: { ...old.color, ...(c.color === undefined ? {} : rgb(c.color, 'Border colour')), ...(c.opacity === undefined ? {} : { opacity: integer(c.opacity, 'Border opacity', 0, 100) }) } } }]);
  }
  if (changes.mask !== undefined) {
    need('mask', 'Mask'); if (![2, 4].includes(type) || !raw.mask) throw fail('Masks are unavailable on this layer.');
    const c = keys(changes.mask, ['enable', 'left', 'right', 'top', 'bottom'], 'mask'), old = raw.mask, { width, height } = raw.window;
    const px = { left: c.left ?? old.left, right: c.right ?? old.right, top: c.top ?? old.top, bottom: c.bottom ?? old.buttom };
    for (const [key, value] of Object.entries(px)) integer(value, `Mask ${key}`, 0, ['left', 'right'].includes(key) ? width : height);
    if (px.left + px.right >= width || px.top + px.bottom >= height) throw fail('The mask would hide the whole layer.');
    const ratio = (value, size) => Math.round(value / size * RATIO); // dataUtils.ts getMaskRatio; "buttom" is the device spelling
    writes.push(['layers/mask', { layerId: id, mask: { ...old, enable: c.enable === undefined ? old.enable : flag(c.enable, 'mask'),
      left: px.left, leftRatio: ratio(px.left, width), right: px.right, rightRatio: ratio(px.right, width),
      top: px.top, topRatio: ratio(px.top, height), buttom: px.bottom, buttomRatio: ratio(px.bottom, height) } }]);
  }
  if (changes.shadow !== undefined) {
    need('shadow', 'Shadow'); if (type !== 2 || !raw.shadow) throw fail('Shadows are available on normal layers only.');
    const c = keys(changes.shadow, ['enable', 'feather', 'width', 'height', 'x', 'y', 'color', 'opacity'], 'shadow'), old = raw.shadow, window = { ...old.window };
    for (const [key, min, max] of [['width', 5, 200], ['height', 5, 200], ['x', -100, 100], ['y', -100, 100]]) if (c[key] !== undefined) window[key] = integer(c[key], `Shadow ${key}`, min, max);
    writes.push(['layers/shadow', { layerId: id, shadow: { ...old, general: { ...old.general, ...(c.enable === undefined ? {} : { enable: flag(c.enable, 'shadow') }), ...(c.feather === undefined ? {} : { feather: integer(c.feather, 'Shadow feather', 0, 100) }) },
      window, color: { ...old.color, ...(c.color === undefined ? {} : rgb(c.color, 'Shadow colour')), ...(c.opacity === undefined ? {} : { opacity: integer(c.opacity, 'Shadow opacity', 0, 100) }) } } }]);
  }
  if (changes.quality !== undefined) {
    need('quality', 'Colour adjustment'); if (!raw.imageQuality) throw fail('Colour adjustment is unavailable on this layer.');
    const c = keys(changes.quality, ['brightness', 'contrast', 'hue', 'saturation'], 'colour'), old = raw.imageQuality, next = { ...old };
    if (c.brightness !== undefined) next.brightness = { ...old.brightness, coefficient: integer(c.brightness, 'Brightness', 0, 200) };
    if (c.contrast !== undefined) next.contrast = { ...old.contrast, coefficient: integer(c.contrast, 'Contrast', 0, 200) };
    if (c.hue !== undefined) next.hue = integer(c.hue, 'Hue', -180, 180);
    if (c.saturation !== undefined) next.saturation = integer(c.saturation, 'Saturation', 0, 200);
    writes.push(['layers/image-quality', { layerId: id, imageQuality: next }]);
  }
  if (changes.crop !== undefined) {
    need('crop', 'Source crop'); if (![2, 4].includes(type) || raw.source?.general?.sourceType !== 2 || !raw.crop) throw fail('Source crop needs a layer showing an input.');
    const c = keys(changes.crop, ['enable', 'x', 'y', 'width', 'height'], 'crop'), old = raw.crop;
    const next = { x: c.x ?? old.xRatio, y: c.y ?? old.yRatio, width: c.width ?? old.widthRatio, height: c.height ?? old.heightRatio };
    integer(next.x, 'Crop X', 0, RATIO - 1); integer(next.y, 'Crop Y', 0, RATIO - 1);
    integer(next.width, 'Crop width', 1, RATIO - next.x); integer(next.height, 'Crop height', 1, RATIO - next.y);
    writes.push(['layers/crop', { layerId: id, crop: { ...old, enable: c.enable === undefined ? old.enable : flag(c.enable, 'crop'), xRatio: next.x, yRatio: next.y, widthRatio: next.width, heightRatio: next.height } }]);
  }
  return writes;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function applyEffect(client, layer, changes, read) {
  const list = (await client.call('layers/list-detail')).data?.list, raw = list?.find(l => l.layerId === layer.id);
  if (!raw) throw fail('Programming layer no longer exists. Refresh.', 409);
  const writes = planEffects(raw, changes, await effectSupport(client));
  for (const [path, item] of writes) await client.call(path, [item], { timeoutMs: 20000 }).catch(error => {
    if (/resource/i.test(error.message)) throw fail('The device has no free layer resources for this effect on this layer.', 409);
    throw error;
  });
  return verified(() => read(client), next => {
    const fx = next.layers.find(l => l.id === layer.id)?.fx;
    return fx && Object.entries(changes).every(([key, value]) => value !== null && typeof value === 'object' ? Object.entries(value).every(([k, v]) => same(fx[key]?.[k], v)) : same(fx[key], value));
  }, 'the layer effect');
}
