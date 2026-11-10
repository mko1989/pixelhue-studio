import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { programInputSources, readProgramSources } from '../lib/program-sources.js';
import { interfaces as q8 } from '../test-support/q8-capture.js';
import { createApp } from '../server.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const input = (id, slot, connector, state = 1, extra = {}) => ({ interfaceId: id, interfaceIdObj: { slotId: slot, connectorId: connector }, general: { name: `Custom ${id}` }, state,
  auxiliaryInfo: { connectorInfo: { interfaceType: 2, workMode: 0, type: 6 }, ...extra }, actualTiming: { horizontal: { addTime: 1920 }, vertical: { addTime: 1080 } } });

test('Q8 live inputs sort numerically by physical mapping independent of names, API order and interface IDs', () => {
  const raw = [input(1, 2, 1), input(2, 0, 9), input(90, 1, 0), input(4, 0, 1), input(100, 0, 0, 0), input(3, 0, 0)];
  const actual = programInputSources({ model: 'Q8' }, raw);
  assert.deepEqual(actual.map(s => s.id), [3, 4, 2, 90, 1, 100]);
  assert.deepEqual(actual.map(s => s.mapping), ['IN 1-1', 'IN 1-2', 'IN 1-10', 'IN 2-1', 'IN 3-2', 'IN 1-1']);
  assert.equal(actual[0].name, 'Custom 3'); assert.equal(raw[0].interfaceId, 1);
  const captured = programInputSources({ model: 'Q8' }, structuredClone(q8));
  assert.equal(captured.find(s => s.id === 1).mapping, 'IN 3-1');
  assert.equal(captured.find(s => s.id === 47).mapping, 'IN 2-1');
  assert.ok(captured.findIndex(s => s.id === 47) < captured.findIndex(s => s.id === 1));
});
test('fixed P10/P20 input pairs use panel numbers, including SDI, not internal main-board slot 100', () => {
  const raw = [input(1, 100, 1), input(2, 100, 0), input(3, 0, 3), input(4, 1, 1), input(5, 3, 6)];
  const p20 = programInputSources({ model: 'P20' }, raw);
  assert.deepEqual(p20.map(s => s.mapping), ['IN 1', 'IN 1', 'IN 6', 'IN 7', 'IN 12']);
  assert.equal(programInputSources({ model: 'P10' }, [input(5, 0, 2)])[0].mapping, 'IN 6');
});
test('live status follows firmware states, offline wins over stale signal, disabled/output interfaces are excluded', () => {
  const raw = Array.from({ length: 10 }, (_, i) => input(i, 0, i, i)); raw.push(input(12, 1, 0, 1, { online: 0 }));
  const disabled = input(13, 1, 1); disabled.auxiliaryInfo.connectorInfo.workMode = 2; raw.push(disabled);
  const output = input(14, 1, 2); output.auxiliaryInfo.connectorInfo.interfaceType = 4; raw.push(output);
  const sources = programInputSources({ model: 'Q8' }, raw);
  assert.deepEqual(sources.filter(s => s.connected).map(s => s.id), [1, 2, 3, 4, 7]);
  assert.equal(sources.find(s => s.id === 3).signalLabel, 'Live · unstable'); assert.equal(sources.find(s => s.id === 4).signalLabel, 'Live · nonstandard');
  assert.equal(sources.find(s => s.id === 9).signalHealth, 'off'); assert.equal(sources.find(s => s.id === 12).signalLabel, 'Offline');
  assert.ok(!sources.some(s => [13, 14].includes(s.id)));
});
test('firmware physical aliases, Q8 ST2110 subports and P80 printed connector groups are preserved', () => {
  assert.equal(programInputSources({ model: 'Q8' }, [input(1, 0, 0, 1, { alias: 'IN 2-4' })])[0].mapping, 'IN 2-4');
  const optical = input(1, 0, 0), stream = input(2, 0, 7);
  optical.auxiliaryInfo.connectorInfo = { ...optical.auxiliaryInfo.connectorInfo, subCardModelId: 30983, type: 65 };
  stream.auxiliaryInfo.connectorInfo.subCardModelId = 30983;
  assert.deepEqual(programInputSources({ model: 'Q8' }, [stream, optical]).map(s => s.mapping), ['IN 1-1', 'IN 1-1-1']);
  const client = { model: 'P80', configurationXml: '<File><path>deviceconfig/subcard/inputcard/123.xml</path><data><DCS><Subcards><Subcard><ConnectorSelect><Capacity><Group PrintKeyNo="1"><Connector Position="0"/><Connector Position="1"/></Group></Capacity></ConnectorSelect></Subcard></Subcards></DCS></data></File>' };
  const grouped = [input(1, 0, 1), input(2, 0, 2)]; grouped.forEach(i => { i.auxiliaryInfo.connectorInfo.subCardModelId = 123; });
  assert.deepEqual(programInputSources(client, grouped).map(s => s.mapping), ['IN 1-1', 'IN 1-2']);
});
test('lean source refresh reads only interface metadata and rejects malformed payloads', async () => {
  const calls = [], client = { model: 'Q8', session: 'source-test', async call(path) { calls.push(path); return { data: { list: [input(1, 0, 0)] } }; } };
  const next = await readProgramSources(client); assert.equal(next.session, 'source-test'); assert.equal(next.sources[0].mapping, 'IN 1-1');
  assert.deepEqual(calls, ['interface/list-detail']); client.call = async () => ({ data: {} }); await assert.rejects(readProgramSources(client), /not returned/);
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
test('source status HTTP endpoint is live, read-only and protected by session/origin guards', async t => {
  const mock = createMockStudio(), port = await listen(mock.server), app = createApp(), ap = await listen(app); t.after(async () => { await close(app); await close(mock.server); });
  const url = `http://127.0.0.1:${ap}/api/`, connected = await (await fetch(url + 'connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', apiPort: port }) })).json();
  const sourceUrl = url + `programming/sources?session=${connected.session}`;
  const before = mock.requests.length, source = mock.interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2 && i.auxiliaryInfo.connectorInfo.workMode === 0); source.state = 0;
  let state = await (await fetch(sourceUrl)).json(); assert.equal(state.sources.find(s => s.id === source.interfaceId).signalLabel, 'No signal');
  source.state = 1; state = await (await fetch(sourceUrl)).json(); assert.equal(state.sources.find(s => s.id === source.interfaceId).signalLabel, 'Live');
  assert.ok(mock.requests.slice(before).every(r => r.path === 'interface/list-detail'));
  assert.equal((await fetch(url + 'programming/sources?session=wrong')).status, 409);
  assert.equal((await fetch(sourceUrl, { headers: { Origin: 'http://other.invalid' } })).status, 403);
  assert.equal((await fetch(sourceUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: connected.session }) })).status, 405);
  assert.equal(mock.writes.length, 0);
});
