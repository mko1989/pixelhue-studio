import { readFileSync } from 'node:fs';
import { createMockStudio } from './mock-studio.js';
export const outputXml = readFileSync(new URL('fixtures/p20-output.xml', import.meta.url), 'utf8');
export function createOutputMock() {
  const mock = createMockStudio(), { primary, interfaces, cards, requests, writes, behavior } = mock;
  const card = cards.find(c => c.slotId === primary.interfaceIdObj.slotId), original = mock.server.listeners('request')[0];
  interfaces.splice(interfaces.findIndex(i => i.interfaceId === 400000), 1);
  primary.auxiliaryInfo.connectorInfo = { ...primary.auxiliaryInfo.connectorInfo, subCardModelId: card.modelId, capacity: 1, workMode: 0, copyInfo: { type: 0, id: 0 } };
  primary.colorSpace = { preset: 0 }; primary.timingSelect = { select: 0 };
  card.connectors = Array.from({ length: 8 }, (_, index) => ({ index, type: 6, capacityMode: 1, workMode: index % 2 ? 1 : 0, copyInfo: { type: 0, id: index % 2 ? index === 1 ? primary.interfaceId : 500000 + index - 1 : 0 } }));
  for (let index = 1; index < 8; index++) interfaces.push({ ...structuredClone(primary), interfaceId: 500000 + index,
    interfaceIdObj: { ...primary.interfaceIdObj, connectorId: index }, index, general: { name: `HDMI ${index + 1}` },
    auxiliaryInfo: { ...structuredClone(primary.auxiliaryInfo), connectorInfo: { ...primary.auxiliaryInfo.connectorInfo, workMode: index % 2 ? 1 : 0, copyInfo: card.connectors[index].copyInfo } } });
  card.connectors.push({ index: 8, type: 33, capacityMode: 2, workMode: 1, copyInfo: { type: 33, id: 600000 } });
  interfaces.push({ ...structuredClone(primary), interfaceId: 600000, interfaceIdObj: { ...primary.interfaceIdObj, connectorId: 8 }, auxiliaryInfo: { connectorInfo: { interfaceType: 4, type: 33, capacity: 2, workMode: 1, copyInfo: { type: 33, id: 600000 } } } });
  const assessments = [];
  mock.server.removeAllListeners('request'); mock.server.on('request', async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname.replace('/unico/v1/', '');
    const send = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 0, data })); };
    if (req.method === 'GET' && path === 'node/config-file') { requests.push({ path, method: 'GET' }); res.setHeader('Content-Type', 'application/xml'); res.end(outputXml); return; }
    if (['system/auxiliary/assess/switch-capacity', 'interface/thumbtiming-check', 'node/subcard/mode'].includes(path) && req.method !== 'GET') {
      requests.push({ path, method: req.method }); let data = ''; for await (const part of req) data += part; const body = JSON.parse(data);
      if (path === 'system/auxiliary/assess/switch-capacity') { assessments.push({ path, body }); return send([{ state: behavior.assessmentState }]); }
      if (path === 'interface/thumbtiming-check') { assessments.push({ path, body, method: req.method }); return send(body.map(i => ({ interfaceId: i.interfaceId, state: 0, currentBandwidth: behavior.bandwidthOver ? 2000 : 100, maxBandwidth: 1000, frame: { scale: 100, max: 6000, value: [5000, 5994, 6000] } }))); }
      writes.push({ path, body }); if (behavior.ignoreCapacity) return send({});
      for (const subcard of body.subcards) for (const change of subcard.connectors) {
        Object.assign(card.connectors.find(c => c.index === change.index && c.type === change.type), change);
        const row = interfaces.find(i => i.interfaceIdObj.slotId === subcard.slotId && i.interfaceIdObj.connectorId === change.index && i.auxiliaryInfo.connectorInfo.type === change.type);
        Object.assign(row.auxiliaryInfo.connectorInfo, { capacity: change.capacityMode, workMode: change.workMode, copyInfo: change.copyInfo });
      }
      if (behavior.regenerateIds) {
        const mapping = new Map(interfaces.filter(i => i.interfaceIdObj.slotId === card.slotId && i.auxiliaryInfo.connectorInfo.type === 6).map(i => [i.interfaceId, i.interfaceId + 1000000]));
        for (const i of interfaces) if (mapping.has(i.interfaceId)) { i.interfaceId = mapping.get(i.interfaceId); const copy = i.auxiliaryInfo.connectorInfo.copyInfo; if (mapping.has(copy?.id)) copy.id = mapping.get(copy.id); }
      }
      return send({});
    }
    return original(req, res);
  });
  return { ...mock, assessments, outputCard: card };
}
