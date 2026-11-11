// Layer effect sections shaped like the live P20 layers/list-detail capture (WO-036), with layer_2.xml ranges.
export const layerXml = `<File><path>deviceconfig/device/layer_2.xml</path><data><DCS><Device><Layers><Layer Type="2">
<IsMonochrome Support="1" Editable="1"/><IsInverse Support="1" Editable="1"/><FlipType Support="1" Editable="1"/>
<Crop Support="1" Editable="1"/><Window Support="1" Editable="1" Roam="0"/><Mask Support="1" Editable="1"/>
<Opacity Support="1" Editable="1" Min="0" Max="100"/><ImageQuality Support="1" Editable="1"/><Shadow Support="1" Editable="1"/>
<Borders Support="1" Editable="1"/><Transparency Support="1" Editable="1"/></Layer></Layers></Device></DCS></data></File>`;
export function enrichEffects(layer) {
  Object.assign(layer, { isLock: 0, opacity: 100,
    general: { isMonochrome: 0, isInverse: 0, flipType: 0, isBackground: 0, isFreeze: 0, capacity: 1, resource: 1, interfaces: null, ...layer.general },
    border: { enable: 0, type: 1, size: { hWidth: 2, vWidth: 2 }, color: { R: 52, G: 96, B: 216, coefficient: 0, opacity: 100 } },
    mask: { enable: 0, left: 0, leftRatio: 0, right: 0, rightRatio: 0, top: 0, topRatio: 0, buttom: 0, buttomRatio: 0 },
    shadow: { general: { enable: 0, feather: 5 }, window: { width: 100, height: 100, x: 5, y: 5 }, color: { R: 0, G: 0, B: 0, coefficient: 0, opacity: 100 } },
    crop: { enable: 0, widthRatio: 100000, heightRatio: 100000, xRatio: 0, yRatio: 0 },
    imageQuality: { contrast: { R: 100, G: 100, B: 100, coefficient: 100 }, brightness: { R: 100, G: 100, B: 100, coefficient: 100 }, hue: 0, saturation: 100, gamma: 100, gammaScale: 100,
      colorTemperature: { mode: 0, quickAdjust: { value: 6500 } }, isMonochrome: 0, isInverse: 0 } });
}
const within = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const complete = (value, shape) => value && typeof value === 'object' && Object.keys(shape).every(key => key in value && (shape[key] === null || typeof shape[key] !== 'object' || complete(value[key], shape[key])));
// Returns an error message when the device would refuse the body: unknown layer, incomplete section or XML range violation.
export function applyEffectWrite(layers, path, body) {
  const key = { 'layers/opacity': 'opacity', 'layers/lock': 'isLock', 'layers/border': 'border', 'layers/mask': 'mask', 'layers/shadow': 'shadow', 'layers/crop': 'crop', 'layers/image-quality': 'imageQuality' }[path];
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
    if (key === 'imageQuality' && (!within(value.hue, -180, 180) || !within(value.saturation, 0, 200) || !within(value.brightness.coefficient, 0, 200) || !within(value.contrast.coefficient, 0, 200))) return 'image quality out of range';
  }
  for (const item of body) layers.find(l => l.layerId === item.layerId)[key] = structuredClone(item[key]);
  return null;
}
