// Layer effect sections shaped like the live P20 layers/list-detail capture (WO-036), with layer_2.xml ranges.
export const layerXml = `<File><path>deviceconfig/device/layer_2.xml</path><data><DCS><Device><Layers><Layer Type="2">
<IsMonochrome Support="1" Editable="1"/><IsInverse Support="1" Editable="1"/><FlipType Support="1" Editable="1"/>
<Crop Support="1" Editable="1"/><Window Support="1" Editable="1" Roam="0"/><Mask Support="1" Editable="1"/>
<Opacity Support="1" Editable="1" Min="0" Max="100"/><ImageQuality Support="1" Editable="1"/><Shadow Support="1" Editable="1"/>
<Borders Support="1" Editable="1"/><CutoutGeneral Support="1" Editable="1"/><CutFill Support="1" Editable="1"/><Transparency Support="1" Editable="1"/></Layer></Layers></Device></DCS></data></File>`;
export function enrichEffects(layer) {
  Object.assign(layer, { isLock: 0, opacity: 100,
    general: { isMonochrome: 0, isInverse: 0, flipType: 0, isBackground: 0, isFreeze: 0, capacity: 1, resource: 1, interfaces: null, ...layer.general },
    border: { enable: 0, type: 1, size: { hWidth: 2, vWidth: 2 }, color: { R: 52, G: 96, B: 216, coefficient: 0, opacity: 100 } },
    mask: { enable: 0, left: 0, leftRatio: 0, right: 0, rightRatio: 0, top: 0, topRatio: 0, buttom: 0, buttomRatio: 0 },
    shadow: { general: { enable: 0, feather: 5 }, window: { width: 100, height: 100, x: 5, y: 5 }, color: { R: 0, G: 0, B: 0, coefficient: 0, opacity: 100 } },
    crop: { enable: 0, widthRatio: 100000, heightRatio: 100000, xRatio: 0, yRatio: 0 },
    cutFill: { enable: 0, curve: { start: { x: 0, y: 0 }, end: { x: 255, y: 255 } }, relative: { x: 0, y: 0, width: 100, height: 100 } },
    cutout: { cursor: { enable: 0, pos: { x: 1280, y: 320 }, color: { R: 0, G: 0, B: 0, coefficient: 0 } }, enable: 0, type: 2,
      brightness: { threshold: 10, gain: 50, foregroundColor: { enable: 0, R: 255, G: 255, B: 255, coefficient: 0 }, keyInverse: 0, keySource: { followInput: 0, sourceType: 2, sourceId: 25, InterfaceIndex: {} } },
      hue: { hueClip: 10, hueRamp: 90, saturationClip: 10, saturationGain: 100, spill: 50, shadow: 0, highLigh: 0, edgeSmooth: 0, color: { R: 0, G: 0, B: 0, coefficient: 0 }, pos: { x: 1280, y: 320 } },
      intelligence: { pos: { x: 1280, y: 320 }, color: { R: 0, G: 0, B: 0, coefficient: 0 }, mattingStrength: 50, gainAdjust: 0 } },
    imageQuality: { contrast: { R: 100, G: 100, B: 100, coefficient: 100 }, brightness: { R: 100, G: 100, B: 100, coefficient: 100 }, hue: 0, saturation: 100, gamma: 100, gammaScale: 100,
      colorTemperature: { mode: 0, quickAdjust: { value: 6500 } }, isMonochrome: 0, isInverse: 0 } });
}
const within = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const complete = (value, shape) => value && typeof value === 'object' && Object.keys(shape).every(key => key in value && (shape[key] === null || typeof shape[key] !== 'object' || complete(value[key], shape[key])));
// Returns an error message when the device would refuse the body: unknown layer, incomplete section or XML range violation.
// Device behaviour confirmed on the live P20 (WO-039): the switch turns the layer into a fill layer (type 256) and creates a
// linked cut layer (type 128, source type 1 = none) that carries curve, position, invert and source; 8298 when the layer is keyed.
export function applyCutFillWrite(layers, path, body) {
  if (!Array.isArray(body) || !body.length) return [8210, 'layer param invalid'];
  for (const item of body) {
    const layer = layers.find(l => l.layerId === item.layerId); if (!layer) return [8210, 'layer param invalid'];
    if (path === 'layers/cut-fill-switch') {
      if (![0, 1].includes(item.enable) || ![2, 256].includes(layer.layerIdObj.type)) return [8210, 'layer param invalid'];
      if (item.enable && layer.cutout?.enable === 1) return [8298, 'cutout enabled'];
      if (item.enable && !layer.cutId) {
        const id = Math.max(...layers.map(l => l.layerId)) + 1;
        layers.push({ layerId: id, fillId: layer.layerId, layerIdObj: { ...layer.layerIdObj, type: 128 }, general: { name: '', isInverse: 0 }, source: { general: { sourceId: 0, sourceType: 1 } },
          window: { ...layer.window }, enable: 1, zorder: layer.zorder, cutFill: { enable: 1, curve: { start: { x: 0, y: 0 }, end: { x: 255, y: 255 } }, relative: { x: 0, y: 0, width: 100, height: 100 } } });
        Object.assign(layer, { cutId: id, cutFill: { ...layer.cutFill, enable: 1 } }); layer.layerIdObj.type = 256;
      } else if (item.enable && layer.cutId) { // re-enabling reuses the kept cut layer
        const cut = layers.find(l => l.layerId === layer.cutId); cut.cutFill.enable = 1; layer.cutFill = { ...layer.cutFill, enable: 1 }; layer.layerIdObj.type = 256;
      } else if (!item.enable && layer.cutId) {
        // Seen on the live P20 (WO-039): switching off keeps the cut layer and cutId, with cutFill.enable 0 on both; the layer type returns to 2.
        const cut = layers.find(l => l.layerId === layer.cutId); cut.cutFill.enable = 0; layer.cutFill = { ...layer.cutFill, enable: 0 }; layer.layerIdObj.type = 2;
      }
      continue;
    }
    if (layer.layerIdObj.type !== 128) return [8210, 'not a cut layer'];
    const r = item.relative, c = item.curve, point = p => p && within(p.x, 0, 255) && within(p.y, 0, 255);
    if (['layers/relative', 'layers/reset-cut'].includes(path) && !(r && within(r.x, -100, 100) && within(r.y, -100, 100) && within(r.width, 5, 200) && within(r.height, 5, 200))) return [8210, 'relative out of range'];
    if (['layers/curve', 'layers/reset-cut'].includes(path) && !(point(c?.start) && point(c?.end))) return [8210, 'curve out of range'];
    if (r) layer.cutFill.relative = { ...r }; if (c) layer.cutFill.curve = structuredClone(c);
    if (path === 'layers/reset-cut') { layer.general.isInverse = item.isInverse; layer.source = { general: { ...item.source } }; }
  }
  return null;
}
export function applyEffectWrite(layers, path, body) {
  const key = { 'layers/opacity': 'opacity', 'layers/lock': 'isLock', 'layers/border': 'border', 'layers/mask': 'mask', 'layers/shadow': 'shadow', 'layers/crop': 'crop', 'layers/image-quality': 'imageQuality', 'layers/cutout': 'cutout' }[path];
  if (!Array.isArray(body) || !body.length) return 'layer param invalid';
  for (const item of body) {
    const layer = layers.find(l => l.layerId === item.layerId), value = item[key];
    if (!layer || value === undefined) return 'layer param invalid';
    if (key !== 'isLock' && layer.isLock === 1) return 'layer is locked';
    if (key === 'opacity' && !within(value, 0, 100)) return 'opacity out of range';
    if (key === 'isLock' && ![0, 1].includes(value)) return 'lock out of range';
    if (typeof value === 'object' && !complete(value, layer[key])) return `${key} section incomplete`;
    if (key === 'border' && (!within(value.size.hWidth, 0, 512) || !within(value.size.vWidth, 0, 512) || ![1, 3, 4, 5, 6].includes(value.type))) return 'border out of range';
    if (key === 'mask' && ['leftRatio', 'rightRatio', 'topRatio', 'buttomRatio'].some(k => !within(value[k], 0, 100000))) return 'mask out of range';
    if (key === 'shadow' && (!within(value.general.feather, 0, 100) || !within(value.window.width, 5, 200) || !within(value.window.height, 5, 200) || !within(value.window.x, -100, 100) || !within(value.window.y, -100, 100))) return 'shadow out of range';
    if (key === 'crop' && (!within(value.xRatio, 0, 100000) || !within(value.widthRatio, 0, 100000) || value.xRatio + value.widthRatio > 100000 || value.yRatio + value.heightRatio > 100000)) return 'crop out of range';
    if (key === 'cutout' && (![0, 1, 2].includes(value.type) || !within(value.brightness.threshold, 0, 100) || !within(value.hue.hueClip, 5, 180) || !within(value.hue.saturationGain, 1, 100) || (value.enable === 1 && layer.cutFill?.enable === 1))) return 'cutout out of range';
    if (key === 'imageQuality' && (!within(value.hue, -180, 180) || !within(value.saturation, 0, 200) || !within(value.brightness.coefficient, 0, 200) || !within(value.contrast.coefficient, 0, 200))) return 'image quality out of range';
  }
  for (const item of body) layers.find(l => l.layerId === item.layerId)[key] = structuredClone(item[key]);
  return null;
}
