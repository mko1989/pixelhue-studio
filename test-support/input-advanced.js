import { umdXml } from './mvr-umd.js';

const file = (path, data) => `<File><path>${path}</path><data><DCS>${data}</DCS></data></File>`;
const values = '<Enum Value="0"/><Enum Value="1"/><Enum Value="255"/>';
const number = (name, value = 100, min = 0, max = 200) => `<${name} Support="1" Editable="1" Value="${value}" Min="${min}" Max="${max}" DataType="0"/>`;
const quality = `<ImageQuality Support="1" Editable="1"><Interface Type="2" Support="1" Editable="1"><Brightness Support="1">${number('R')}${number('G')}${number('B')}${number('Coefficient')}</Brightness><Contrast Support="1">${number('R')}${number('G')}${number('B')}</Contrast>${number('Hue', 0, -180, 180)}${number('Saturation')}<Gamma Support="1" Editable="1" Min="0.2" Max="5" Step="0.01" Value="1" DataType="1"/></Interface></ImageQuality>`;
const connector = type => `<Connector Type="${type}"><CompatibilityMode Support="1" Editable="1"/><HDCP Support="1"><Interface Type="2" Support="1"><Enable Support="1" Editable="1"/></Interface></HDCP><ColorRanges Support="1"><Interface Type="2" Support="1"><ColorRange Support="1" Editable="1">${values}</ColorRange></Interface></ColorRanges><ColorGamuts Support="1"><Interface Type="2" Support="1"><ColorGamut Support="1" Editable="1">${values}</ColorGamut></Interface></ColorGamuts>${quality}</Connector>`;
// Sparse card overrides must suppress gamut/Gamma while retaining generic brightness.
const card = `<Subcards><Subcard ModelId="123"><Connectors><DeviceMode Value="4"><Capacitys><Capacity Value="2"><Connector Type="6" Position="0"><ColorGamut Support="0" Editable="0"/></Connector></Capacity></Capacitys></DeviceMode><Types><Connector Type="6"><ImageQuality Support="1"><Interface Type="2" Support="1"><Gamma Support="0" Editable="0"/></Interface></ImageQuality></Connector></Types></Connectors></Subcard></Subcards>`;
export const advancedXml = umdXml.replace('<Features>', '<Features><MacMosaic Support="1" Editable="1"/>') +
  file('deviceconfig/connector/6.xml', `<Connectors>${connector(6)}</Connectors>`) + file('deviceconfig/connector/8.xml', `<Connectors>${connector(8)}</Connectors>`) + file('deviceconfig/subcard/inputcard/123.xml', card);
export function enrichAdvanced(inputs) {
  for (const [index, i] of inputs.entries()) {
    i.auxiliaryInfo.connectorInfo.subCardModelId = 123;
    i.compatibilityMode = 0; i.interfaceMacMosaic = { enable: 0, mosaicGroup: 0 };
    i.hdcp = { enable: 0, preset: 2, actual: 3 }; i.colorRange = { preset: 255, actual: 0 }; i.colorGamut = { preset: 255, actual: 1 };
    i.imageQuality = { brightness: { R: 100, G: 90, B: 80, coefficient: 100 }, contrast: { R: 99, G: 98, B: 97 }, hue: 0, saturation: 100, gamma: 100, gammaScale: 100, untouched: { flag: 17 } };
    i.presetTiming = { horizontal: { addTime: 1920, frontPorch: 88, sync: 44, syncPolarity: 1, totalTime: 2200 }, vertical: { addTime: 1080, frontPorch: 4, sync: 5, syncPolarity: 1, totalTime: 1125 }, hBlank: 280 };
    i.presetThumbTiming = { width: 1920, height: 1080, frame: 60, interlaced: 0 };
    i.general ||= { name: `Input ${index + 1}` };
  }
}
export function advancedFixture() {
  const raw = Array.from({ length: 5 }, (_, index) => ({ interfaceId: index + 1, general: { name: `Input ${index + 1}` },
    interfaceIdObj: { slotId: 1, connectorId: index }, auxiliaryInfo: { connectorInfo: { type: index === 2 ? 8 : 6, interfaceType: index === 3 ? 4 : 2, workMode: index === 4 ? 2 : 0, capacity: 2 } } }));
  enrichAdvanced(raw); const writes = [], behavior = { ignore: false };
  const client = { session: 'advanced-test', deviceInfo: () => ({ model: 'P20' }), async call(path, body, options) {
    if (!body) return path.startsWith('node/config') ? advancedXml : { data: path.startsWith('node/detail') ? { mode: { workMode: 4 } } : { list: structuredClone(raw) } };
    writes.push({ path, body: structuredClone(body), method: options?.method || 'PUT' });
    if (!behavior.ignore) applyAdvancedMock(raw, path, body);
    return { data: {} };
  } };
  return { client, raw, writes, behavior };
}
export function applyAdvancedMock(inputs, path, body) {
  if (path === 'interface/mosaic') { inputs.find(i => i.interfaceId === body.interfaceId).interfaceMacMosaic = structuredClone(body); return; }
  for (const update of body) Object.assign(inputs.find(i => i.interfaceId === update.interfaceId), Object.fromEntries(Object.entries(update).filter(([k]) => k !== 'interfaceId')));
}
