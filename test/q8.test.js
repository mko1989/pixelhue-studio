import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelhueClient } from '../lib/pixelhue.js';
import { normaliseInputs, readInputs, applyInputs, planInputs } from '../lib/inputs.js';
import * as capture from '../test-support/q8-capture.js';

function fixture() {
  const { cards, interfaces, screens } = structuredClone({ ...capture });
  const layers = [1, 2].map((screenId) => ({ layerId: screenId * 10, layerIdObj: { attachScreenId: screenId },
    general: { name: `MVR ${screenId} window` }, source: { general: { sourceType: 2, sourceId: 119 } },
    window: { x: 0, y: 0, width: 640, height: 360 } }));
  const writes = [];
  const client = new PixelhueClient(async (request) => {
    const path = request.path.replace('/unico/v1/', '').split('?')[0];
    let data;
    if (request.body) {
      writes.push({ path, body: request.body });
      for (const change of request.body) {
        if (path === 'interface/general') interfaces.find(i => i.interfaceId === change.interfaceId).general = change.general;
        else if (path === 'interface/preset-thumb-timing') interfaces.find(i => i.interfaceId === change.interfaceId).presetThumbTiming = change.presetThumbTiming;
        else if (path === 'layers/window') layers.find(l => l.layerId === change.layerId).window = change.window;
        else if (path === 'layers/aspect-ratio') layers.find(l => l.layerId === change.layerId).aspectRatio = { aspectRatio: change.aspectRatio, locked: change.locked };
        else throw new Error(`Unexpected write: ${path}`);
      }
      data = {};
    } else if (path === 'ucenter/device-list') data = { list: [
      { SN: 'OTHER', ip: '192.0.2.2', modelId: 28944, protocols: [{ linkType: 'http', port: 8088 }] },
      { SN: 'virtual-Q8-test', ip: '127.0.0.1', modelId: 29974, protocols: [{ linkType: 'http', port: 53503 }] },
    ] };
    else if (path === 'node/open-detail') { assert.equal(request.port, 53503); data = { sn: 'virtual-Q8-test', startTime: '12345' }; }
    else if (path === 'node/detail') data = { modelId: 29974 };
    else if (path === 'screen/list-detail') data = { list: screens };
    else if (path === 'layers/list-detail') data = { list: layers };
    else if (path === 'interface/list-detail') data = { list: interfaces };
    else if (path === 'node/subcard/mode') data = [{ nodeId: 1, subcards: cards }];
    else throw new Error(`Unexpected read: ${path}`);
    return structuredClone({ code: 0, data });
  });
  return { client, writes, cards, interfaces };
}

test('Q8 capture maps actual input cards, excluding placeholders, spare ports and outputs', () => {
  const rows = normaliseInputs(capture.interfaces, capture.cards, 'Q8');
  assert.equal(rows.length, 72);
  assert.equal(rows.filter(r => r.supportsEdid).length, 48);
  assert.equal(rows.filter(r => r.family === 'SDI').length, 24);
  assert.equal(new Set(rows.map(r => r.key)).size, 72);
  assert.deepEqual([...new Set(rows.map(r => r.slotId))], [0, 1, 2, 3, 4, 5]);
  assert.ok(rows.every(r => r.cardType === 2 && r.fixedPort && !r.capacityEditable && !r.capacityChoices.length));
  assert.equal(rows.filter(r => r.ports[0].workMode === 2).length, 24);
  const stale = { ...capture.cards.find(c => c.slotId === 0 && c.connectors.length), modelId: 999 };
  assert.equal(normaliseInputs(capture.interfaces, [stale, ...capture.cards, ...capture.cards], 'Q8').length, 72);
  assert.equal(normaliseInputs(capture.interfaces.filter(i => i.interfaceIdObj.slotId !== 2), capture.cards, 'Q8').length, 60);
});

test('Q8 IP-only and explicit-port connections enable two MVR outputs', async () => {
  for (const options of [{ host: '127.0.0.1' }, { host: '127.0.0.1', apiPort: 53503 }]) {
    const { client } = fixture();
    const state = await client.connect(options);
    assert.equal(state.device.model, 'Q8');
    assert.deepEqual(state.capabilities, { inputs: true, mvr: true, audio: false });
    assert.deepEqual(state.screens.map(s => s.id), [1, 2]);
  }
});

test('Q8 bulk name/EDID edits retain card modes and reject capacity, port and SDI EDID changes', async () => {
  const { client, writes, cards } = fixture();
  await client.connect({ host: '127.0.0.1' });
  const before = await readInputs(client), originalCards = structuredClone(cards);
  const changes = before.inputs.map(r => ({ key: r.key, portKey: r.portKey, capacity: r.capacity, name: `Q8 input ${r.number}`,
    ...(r.supportsEdid ? { edid: { width: 1920, height: 1080, frame: 60, standardType: 6, interlaced: 0 } } : {}) }));
  const after = await applyInputs(client, changes);
  assert.ok(after.inputs.every(r => r.ports[0].name === `Q8 input ${r.number}`));
  assert.deepEqual(cards, originalCards);
  assert.deepEqual(writes.map(w => w.path), ['interface/general', 'interface/preset-thumb-timing']);
  assert.equal(writes[1].body.length, 48);
  assert.throws(() => planInputs([{ ...changes[0], capacity: 1 }], before), /supported capacity/);
  assert.throws(() => planInputs([{ ...changes[0], portKey: '8:4' }], before), /no longer exists/);
  const sdi = before.inputs.findIndex(r => r.family === 'SDI');
  assert.throws(() => planInputs([{ ...changes[sdi], edid: changes[0].edid }], before), /SDI does not support EDID/);
});

test('Q8 repeated Apply retains geometry and locks independently on both MVR outputs', async () => {
  const { client, writes } = fixture();
  await client.connect({ host: '127.0.0.1' });
  for (const x of [80, 160, 240]) for (const id of [10, 20]) {
    const state = await client.apply([{ id, window: { x, y: 80, width: 640, height: 360 }, aspectLock: 16 / 9, aspectMode: 5 }]);
    assert.equal(state.layers.find(l => l.id === id).window.x, x);
    assert.equal(state.layers.find(l => l.id === id).aspectLock, 16 / 9);
  }
  assert.equal(writes.filter(w => w.path === 'layers/aspect-ratio').length, 2);
});
