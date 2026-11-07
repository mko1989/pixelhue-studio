import http from 'node:http';

export const createMockP20 = () => createMockDevice({ model: 'P20' });

export function createMockDevice({ model = 'P20' } = {}) {
  const modelId = { P10: 28945, P20: 28944, P80: 30006 }[model];
  const cards = model === 'P10' ? [
    { slotId: 100, modelId: 28945, cardType: 0, connectors: Array.from({ length: 8 }, (_, index) => ({ index, type: index % 2 ? 6 : 8, capacityMode: 0, workMode: index % 2 ? 0 : 2 })) },
    { slotId: 0, modelId: 15728900, cardType: 1, connectors: Array.from({ length: 4 }, (_, index) => ({ index, type: 13, capacityMode: 0, workMode: index % 2 ? 2 : 0 })) },
    { slotId: 1, modelId: 15728899, cardType: 2, connectors: [{ index: 0, type: 6, capacityMode: 2, workMode: 0 }] },
  ] : model === 'P80' ? [
    // Synthetic modular card IDs: discovery uses the actual input role/connector list.
    { slotId: 0, modelId: 91001, cardType: 1, connectors: Array.from({ length: 8 }, (_, index) => ({ index, type: 6, capacityMode: 0, workMode: 0 })) },
    { slotId: 1, modelId: 91002, cardType: 1, connectors: Array.from({ length: 8 }, (_, index) => ({ index, type: index < 4 ? 35 : 13, capacityMode: index === 7 ? 255 : 0, workMode: 0 })) },
    { slotId: 2, modelId: 91003, cardType: 2, connectors: [{ index: 0, type: 6, capacityMode: 2, workMode: 0 }] },
  ] : [
    { slotId: 100, modelId: 28944, cardType: 0, connectors: Array.from({ length: 8 }, (_, index) => ({ index, type: index % 2 ? 6 : 8, capacityMode: 0, workMode: index % 2 ? 0 : 2 })) },
    ...[0, 1].map((slotId) => ({ slotId, modelId: 15728896, cardType: 1, connectors: Array.from({ length: 4 }, (_, index) => ({ index, type: index % 2 ? 6 : 8, capacityMode: 0, workMode: index % 2 ? 0 : 2 })) })),
    { slotId: 2, modelId: 15728897, cardType: 2, connectors: [{ index: 0, type: 6, capacityMode: 2, workMode: 0 }] },
    { slotId: 3, modelId: 15728898, cardType: 1, connectors: Array.from({ length: 8 }, (_, index) => ({ index, type: 13, capacityMode: 0, workMode: index % 2 ? 2 : 0 })) },
  ];
  const interfaces = cards.flatMap((card) => card.connectors.map((connector) => ({
    interfaceId: 100000 + card.slotId * 100 + connector.index,
    interfaceIdObj: { nodeId: 1, slotId: card.slotId, connectorId: connector.index },
    index: connector.index, type: connector.type,
    auxiliaryInfo: { connectorInfo: { interfaceType: card.cardType === 2 ? 4 : 2, type: connector.type,
      capacity: connector.capacityMode, workMode: connector.workMode } },
    general: { name: `Port ${card.slotId}-${connector.index}` },
    actualTiming: { horizontal: { addTime: 1920 }, vertical: { addTime: 1080 }, refresh: 50 },
    ...(connector.type === 13 ? {} : {
      presetThumbTiming: { width: 1920, height: 1080, frame: 60, standardType: 6, interlaced: 0 }, timingSelect: { select: 0 },
    }), state: connector.workMode === 0 ? 1 : 0,
  })));
  for (const card of cards.filter((card) => card.cardType !== 2)) for (const connector of card.connectors) {
    if (connector.capacityMode === 255) continue;
    connector.capacityMode = model === 'P20' ? 1 : model === 'P80' ? 2 : 0;
    const input = interfaces.find((item) => item.interfaceIdObj.slotId === card.slotId && item.index === connector.index);
    if (input) input.auxiliaryInfo.connectorInfo.capacity = connector.capacityMode;
  }
  // Main-card MVR and AUX must never be touched by input configuration.
  if (model !== 'P80') {
    cards[0].connectors.push({ index: 8, type: 4, capacityMode: 0, workMode: 0 }, { index: 9, type: 6, capacityMode: 0, workMode: 0 });
    const sdiCard = cards.find((card) => card.slotId === (model === 'P20' ? 3 : 0));
    const firstOptical = model === 'P20' ? 8 : 4;
    sdiCard.connectors.push({ index: firstOptical, type: 24, capacityMode: 2, workMode: 0 }, { index: firstOptical + 1, type: 24, capacityMode: 2, workMode: 0 });
  }
  const writes = [], requests = [];
  const behavior = { assessmentState: 0, rejectPath: '', ignoreEdid: false, ignoreAspectLock: false, regenerateIds: false };
  const screens = [{ screenId: 8, screenIdObj: { type: 8 }, general: { name: 'Multiviewer' }, timing: { horizontal: { addTime: 1920 }, vertical: { addTime: 1080 } } }];
  const layers = [{ layerId: 10, layerIdObj: { attachScreenId: 8 }, general: { name: 'Camera 1' },
    source: { general: { sourceType: 2, sourceId: interfaces.find((input) => input.auxiliaryInfo.connectorInfo.interfaceType === 2 && input.auxiliaryInfo.connectorInfo.workMode === 0).interfaceId } },
    window: { x: 40, y: 40, width: 900, height: 506 } }];
  const server = http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname.replace('/unico/v1/', '');
    requests.push({ path, method: request.method });
    const send = (data, code = 0, message = 'ok') => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code, message, data })); };
    if (path === 'node/open-detail') return send({ sn: `${model}-MOCK`, startTime: '12345' });
    if (!request.headers.authorization) { response.writeHead(401).end(); return; }
    if (request.method === 'GET') {
      if (path === 'node/detail') return send({ configInfo: { modeId: modelId } });
      if (path === 'screen/list-detail') return send({ list: screens });
      if (path === 'layers/list-detail') return send({ list: layers });
      if (path === 'interface/list-detail') return send({ list: interfaces });
      if (path === 'node/subcard/mode') return send([{ nodeId: 1, subcards: cards }]);
    }
    if (request.method === 'PUT') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      if (path === 'system/auxiliary/assess/subcard-mode') return send([{ layerResourceItem: [{ state: behavior.assessmentState }] }]);
      writes.push({ path, body });
      if (behavior.rejectPath === path) return send({}, 501, 'Rejected by firmware');
      if (path === 'node/subcard/mode') {
        for (const change of body.subcards) {
          const card = cards.find((card) => card.slotId === change.slotId);
          for (const connector of change.connectors) {
            Object.assign(card.connectors.find((port) => port.index === connector.index && port.type === connector.type), connector);
            const input = interfaces.find((input) => input.interfaceIdObj.slotId === card.slotId && input.index === connector.index);
            if (!input) return send({}, 500, 'Attempt to change an output');
            if (behavior.regenerateIds && connector.workMode === 0) input.interfaceId += 1000000;
            Object.assign(input.auxiliaryInfo.connectorInfo, { workMode: connector.workMode, capacity: connector.capacityMode });
          }
        }
        return send({});
      }
      if (path === 'interface/general') {
        for (const item of body) Object.assign(interfaces.find((input) => input.interfaceId === item.interfaceId).general, item.general);
        return send({});
      }
      if (path === 'interface/preset-thumb-timing') {
        if (!behavior.ignoreEdid) for (const item of body) {
          const input = interfaces.find((input) => input.interfaceId === item.interfaceId);
          input.presetThumbTiming = item.presetThumbTiming; input.timingSelect.select = item.presetThumbTiming.timingSelect;
        }
        return send({});
      }
      if (path === 'layers/window') { for (const item of body) layers.find((layer) => layer.layerId === item.layerId).window = item.window; return send({}); }
      if (path === 'layers/aspect-ratio') {
        if (!behavior.ignoreAspectLock) for (const item of body) layers.find((layer) => layer.layerId === item.layerId).aspectRatio = { aspectRatio: item.aspectRatio, locked: item.locked };
        return send({});
      }
    }
    response.writeHead(404).end();
  });
  return { server, cards, interfaces, layers, screens, writes, requests, behavior };
}
