// Output connector XML and live-shaped colour fields for the mock (WO-037). Role 124 = Main/AUX/MVR outputs.
const enums = values => values.map(v => `<Enum Value="${v}"/>`).join('');
const number = (name, value, min, max) => `<${name} Support="1" Editable="1" Value="${value}" Min="${min}" Max="${max}" DataType="0"/>`;
const channels = `${number('R', 100, 0, 200)}${number('G', 100, 0, 200)}${number('B', 100, 0, 200)}${number('Coefficient', 100, 0, 200)}`;
const connector = (type, gamut) => `<File><path>deviceconfig/connector/${type}.xml</path><data><DCS><Connectors><Connector Type="${type}">
<ColorSpaces Support="1"><Interface Type="124"><ColorSpace Support="1" Editable="1"><ColorSpace Support="1" Editable="1" Value="0">${enums([0, 1, 2])}</ColorSpace></ColorSpace></Interface></ColorSpaces>
<ColorRanges Support="1"><Interface Type="124"><ColorRange Support="1" Editable="1" Value="1">${enums([0, 1])}</ColorRange></Interface></ColorRanges>
${gamut ? `<ColorGamuts Support="1"><Interface Type="124"><ColorGamut Support="1" Editable="1" Value="1">${enums([0, 1, 2, 3])}</ColorGamut></Interface></ColorGamuts>` : ''}
<ImageQuality Support="1" Editable="1"><Interface Type="124"><Brightness Support="1">${channels}</Brightness><Contrast Support="1">${channels}</Contrast>${number('Hue', 0, -180, 180)}${number('Saturation', 100, 0, 200)}</Interface></ImageQuality>
</Connector></Connectors></DCS></data></File>`;
export const outputXml = connector(6, true) + connector(4, false);
const RULES = { colorSpace: [0, 1, 2, 3], colorRange: [0, 1], colorGamut: [0, 1, 2, 3] };
export function enrichOutput(port) {
  Object.assign(port, { colorSpace: { preset: 0, actual: 0 }, colorRange: { preset: 1, actual: 1 }, colorGamut: { preset: 1, actual: 1 },
    imageQuality: { contrast: { R: 100, G: 100, B: 100, coefficient: 100 }, brightness: { R: 100, G: 100, B: 100, coefficient: 100 }, hue: 0, saturation: 90, gamma: 100, gammaScale: 100,
      colorTemperature: { mode: 0, quickAdjust: { value: 6500 } }, isMonochrome: 0, isInverse: 0 } });
}
// Error text when the device would refuse: enum outside the firmware set, or a partial imageQuality object.
export function outputWriteError(port, field, value) {
  if (RULES[field]) return RULES[field].includes(value?.preset) ? null : `${field} out of range`;
  if (field === 'imageQuality') {
    const whole = value && Object.keys(port.imageQuality).every(key => key in value) && ['R', 'G', 'B', 'coefficient'].every(c => Number.isInteger(value.brightness?.[c]) && Number.isInteger(value.contrast?.[c]));
    return whole && value.hue >= -180 && value.hue <= 180 && value.saturation >= 0 && value.saturation <= 200 ? null : 'image quality invalid';
  }
  return null;
}
