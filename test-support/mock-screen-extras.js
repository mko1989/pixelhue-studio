// Screen test pattern and colour for the mock (WO-037), reduced from the live P20 screen_2.xml / screen_4.xml.
const enums = values => values.map(v => `<Enum Value="${v}"/>`).join('');
const TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 256, 257, 258, 259, 260, 261, 262, 263, 512, 513, 514, 515, 516, 517, 768, 65534, 65535];
const quality = '<ImageQuality Support="1" Editable="1"><ImageQualityMode Support="0"/><Contrast Support="1" Editable="1"/><Brightness Support="1" Editable="1"/><ColorTemperature Support="0"/><Hue Support="1" Editable="1"/><Saturation Support="1" Editable="1"/><Gamma Support="0"/></ImageQuality>';
const file = (type, body) => `<File><path>deviceconfig/device/screen_${type}.xml</path><data><DCS><Device><Screens><Screen Type="${type}"><Features>${body}</Features></Screen></Screens></Device></DCS></data></File>`;
const depth = values => `<ColorSpace Support="1" Editable="1" Value="2"><ColorDepth Support="1" Editable="1">${enums(values)}</ColorDepth><ColorSpaceValue Support="1" Editable="1" Value="1"><ColorDepth Support="1" Editable="0">${enums([12])}</ColorDepth></ColorSpaceValue></ColorSpace>`;
const hdr = name => `<${name} Support="1" Editable="1">${depth([10, 12])}<ColorGamut Support="1" Editable="1">${enums([2, 3])}</ColorGamut></${name}>`;
const format = `<HDR Support="1" Editable="1"><ColorGamut Support="1"><PresetColorGamut Support="1" Editable="1">${enums([0, 1, 2, 3])}</PresetColorGamut></ColorGamut><DynamicRange Support="1"><PresetDynamicRange Support="1"><Type Support="1" Editable="1">${enums([0, 1, 2])}</Type></PresetDynamicRange></DynamicRange></HDR>
<DynamicRange Support="1" Editable="1"><SDR Support="1" Editable="1">${depth([8, 10, 12])}</SDR><HDR Support="1" Editable="1">${hdr('HDR10')}${hdr('HLG')}</HDR></DynamicRange>`;
export const screenXml = file(2, `${quality}${format}<TestPattern Support="1" Editable="1"><Type Support="1">${enums(TYPES)}</Type><Bright Support="1">${enums([1, 2, 3, 4])}</Bright><GridGear Support="1">${enums([1, 2, 3, 4, 5, 6, 7, 8])}</GridGear>
<GridPixel Support="1" Min="1" Max="1024"/><GridLineWidth Support="1" Min="1" Max="64"/><Speed Support="1">${enums([0, 1, 2, 3, 4])}</Speed></TestPattern>`) + file(4, quality);
export function enrichScreen(screen) {
  screen.testPattern ??= { enable: 0, type: 0, bright: 3, grid: 5, gridType: 0, gridLineWidth: 1, speed: 3 };
  screen.imageQuality ??= { contrast: { R: 100, G: 100, B: 100, coefficient: 100 }, brightness: { R: 100, G: 100, B: 100, coefficient: 100 }, hue: 0, saturation: 90, gamma: 0, gammaScale: 100,
    colorTemperature: { mode: 0, quickAdjust: { value: 6500 } }, isMonochrome: 0, isInverse: 0 };
  screen.dynamicRange ??= { preset: 0, actual: 0 }; screen.colorGamut ??= { preset: 1 }; screen.colorDepth ??= { preset: 8, actual: 0 }; screen.colorSpace ??= { preset: 0 };
}
const within = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
// Error text for bodies the device would refuse: AUX screens have no pattern, the spacing unit must match the pattern.
export function screenExtraError(screens, path, body) {
  if (!Array.isArray(body) || !body.length) return 'screen param invalid';
  for (const item of body) {
    const screen = screens.find(s => s.screenId === item.screenId); if (!screen) return 'screen param invalid';
    if (path === 'screen/test-pattern') {
      const t = item.testPattern, line = t?.type >= 512 && t.type <= 517;
      if (screen.screenIdObj.type !== 2 || !t || ![0, 1].includes(t.enable) || !TYPES.includes(t.type) || !within(t.bright, 1, 4) || !within(t.speed, 0, 4) || !within(t.gridLineWidth, 1, 64)
        || t.gridType !== (line ? 1 : 0) || !within(t.grid, 1, line ? 1024 : 8)) return 'test pattern invalid';
    } else {
      const q = item.imageQuality;
      if (!q || !Object.keys(screen.imageQuality).every(key => key in q) || !within(q.hue, -180, 180) || !within(q.saturation, 0, 200) || !within(q.brightness?.coefficient, 0, 200) || !within(q.contrast?.coefficient, 0, 200)) return 'image quality invalid';
    }
  }
  for (const item of body) { const screen = screens.find(s => s.screenId === item.screenId); if (item.testPattern) screen.testPattern = structuredClone(item.testPattern); else screen.imageQuality = structuredClone(item.imageQuality); }
  return null;
}
// Screen format rule on the device: every stored combination must be valid for its dynamic range (HDR: depth 10/12, gamut 2/3).
export function screenFormatError(screens, path, body) {
  const field = { 'screen/color-dynamic-range': 'dynamicRange', 'screen/color-gamut': 'colorGamut', 'screen/color-space': 'colorSpace', 'screen/color-depth': 'colorDepth' }[path];
  if (!Array.isArray(body) || !body.length) return 'screen param invalid';
  for (const item of body) {
    const screen = screens.find(s => s.screenId === item.screenId), value = item[field]?.preset;
    if (!screen || !Number.isInteger(value) || !Number.isInteger(item.connectorType)) return 'screen param invalid';
    const next = { dynamicRange: screen.dynamicRange.preset, colorGamut: screen.colorGamut.preset, colorSpace: screen.colorSpace.preset, colorDepth: screen.colorDepth.preset, [field]: value };
    if (![0, 1, 2].includes(next.dynamicRange) || ![0, 1, 2].includes(next.colorSpace) || ![8, 10, 12].includes(next.colorDepth) || ![0, 1, 2, 3].includes(next.colorGamut)) return 'format out of range';
    if (next.dynamicRange !== 0 && (next.colorDepth === 8 || ![2, 3].includes(next.colorGamut))) return 'format invalid for HDR';
  }
  for (const item of body) screens.find(s => s.screenId === item.screenId)[field].preset = item[field].preset;
  return null;
}
