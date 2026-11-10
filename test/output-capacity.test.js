import test from 'node:test'; import assert from 'node:assert/strict'; import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readOutputs, applyOutputs } from '../lib/studio-outputs.js';
import { applyOutputCapacity } from '../lib/output-capacity.js';
import { createOutputMock } from '../test-support/output-capacity.js';
async function fixture(t) { const mock = createOutputMock(); mock.server.listen(0, '127.0.0.1'); await once(mock.server, 'listening'); t.after(() => new Promise(r => { mock.server.close(r); mock.server.closeAllConnections(); })); const client = new PixelhueClient(); await client.connect({ host: '127.0.0.1', apiPort: mock.server.address().port }); return { mock, client }; }
const action = capacity => ({ slotId: 2, capacity, confirmReset: true });
test('P20 XML exposes card-level DL/4K topology and supported standard resolutions with frame/scan/capacity filtering', async t => {
  const { client, mock } = await fixture(t), state = await readOutputs(client), group = state.capacityGroups[0], primary = state.outputs.find(o => o.id === mock.primary.interfaceId);
  assert.deepEqual(group.options.map(o => [o.value, o.independent]), [[1, [1, 3, 5, 7]], [2, [1, 5]]]);
  assert.ok(primary.presets.some(p => p.width === 1920 && p.height === 1080 && p.frame === 59.94 && p.standardType === 6));
  assert.ok(primary.presets.some(p => p.width === 3840 && p.height === 2160 && p.frame === 30));
  assert.ok(!primary.presets.some(p => p.width === 3840 && p.height === 2160 && p.frame === 60)); assert.ok(primary.presets.every(p => p.interlaced === 0));
  assert.equal(primary.limits.width.step, 4); assert.equal(primary.timingCheck, true);
});
test('capacity changes assess first, apply XML copy dependencies, preserve inputs/optical and re-resolve regenerated IDs', async t => {
  const { client, mock } = await fixture(t), unrelated = structuredClone(mock.interfaces.filter(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2 || i.auxiliaryInfo.connectorInfo.type === 33));
  mock.behavior.regenerateIds = true; const next = await applyOutputCapacity(client, action(2)), ports = next.outputs.filter(o => o.slotId === 2 && o.type === 6);
  assert.deepEqual(ports.filter(o => o.workMode === 0).map(o => o.port), [1, 5]);
  for (const port of ports.filter(o => o.workMode === 1)) assert.equal(port.copyFrom, ports.find(p => p.port === (port.port < 5 ? 1 : 5)).id);
  assert.ok(ports.every(p => p.capacity === 2)); assert.equal(mock.writes[0].path, 'node/subcard/mode'); assert.equal(mock.writes[0].body.subcards[0].connectors.length, 8);
  assert.equal(mock.assessments[0].path, 'system/auxiliary/assess/switch-capacity');
  assert.deepEqual(mock.interfaces.filter(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2 || i.auxiliaryInfo.connectorInfo.type === 33), unrelated);
  assert.ok(ports.find(p => p.port === 1).presets.some(p => p.width === 3840 && p.height === 2160 && p.frame === 60));
});
test('PGM-only mode follows its own XML copy relationships and DL restores four independent outputs', async t => {
  const { client, mock } = await fixture(t); mock.node.mode.workMode = 8;
  let next = await applyOutputCapacity(client, action(2)); assert.deepEqual(next.outputs.filter(o => o.slotId === 2 && o.type === 6 && o.workMode === 0).map(o => o.port), [1, 3, 5, 7]);
  next = await applyOutputCapacity(client, action(1)); assert.ok(next.outputs.filter(o => o.slotId === 2 && o.type === 6).every(o => o.capacity === 1));
});
test('unsupported capacity, missing confirmation and resource shortage fail before changing settings', async t => {
  const { client, mock } = await fixture(t);
  await assert.rejects(applyOutputCapacity(client, { ...action(2), confirmReset: false }), /Confirm/);
  await assert.rejects(applyOutputCapacity(client, action(0)), /does not support/); assert.equal(mock.assessments.length, 0);
  mock.behavior.assessmentState = 1; await assert.rejects(applyOutputCapacity(client, action(2)), /insufficient/); assert.equal(mock.writes.length, 0);
});
test('capacity requires actual topology readback, not just a firmware acknowledgement', async t => {
  const { client, mock } = await fixture(t); mock.behavior.ignoreCapacity = true;
  await assert.rejects(applyOutputCapacity(client, action(2)), /did not retain/);
});
test('standard timing keeps fractional Hz, standard type and timingSelect=0; identical geometry can switch out of custom', async t => {
  const { client, mock } = await fixture(t), id = mock.primary.interfaceId; mock.primary.timingSelect.select = 3;
  const timing = { width: 1920, height: 1080, frame: 59.94, standardType: 6, interlaced: 0 };
  const next = await applyOutputs(client, [{ id, timing, timingMode: 0 }]);
  assert.equal(next.outputs.find(o => o.id === id).timingMode, 0); assert.equal(mock.writes[0].body[0].presetThumbTiming.timingSelect, 0);
  assert.equal(mock.writes[0].body[0].presetThumbTiming.frame, 59.94); assert.equal(mock.assessments[0].method, 'POST');
  const copy = next.outputs.find(o => o.copyFrom === id); assert.deepEqual(copy.timing, next.outputs.find(o => o.id === id).timing);
});
test('timing bandwidth assessment includes bit depth and rejects the complete batch before name/timing writes', async t => {
  const { client, mock } = await fixture(t); mock.behavior.bandwidthOver = true;
  await assert.rejects(applyOutputs(client, [{ id: mock.primary.interfaceId, name: 'Must not change', colorDepth: 12 }]), /capacity\/bandwidth/);
  assert.equal(mock.assessments[0].body[0].colorDepth, 12); assert.equal(mock.writes.length, 0);
});
test('capacity/width step/interlace and copy timing restrictions reject invalid presets before writing', async t => {
  const { client, mock } = await fixture(t), state = await readOutputs(client), id = mock.primary.interfaceId;
  for (const timing of [{ width: 3840, height: 2160, frame: 60, standardType: 6, interlaced: 0 }, { width: 1921, height: 1080, frame: 50, standardType: 0, interlaced: 0 }, { width: 1920, height: 1080, frame: 50, standardType: 6, interlaced: 1 }]) await assert.rejects(applyOutputs(client, [{ id, timing, timingMode: timing.width === 1921 ? 3 : 0 }]));
  await assert.rejects(applyOutputs(client, [{ id: state.outputs.find(o => o.copyFrom && o.type === 6).id, timing: { width: 1920, height: 1080, frame: 50, standardType: 6, interlaced: 0 } }]), /fixed\/copy/);
  assert.equal(mock.writes.length, 0);
});

test('screen and genlock timing dependencies require explicit confirmation before any settings write', async t => {
  const { client, mock } = await fixture(t); mock.primary.auxiliaryInfo.screenInfo = { name: 'Main screen' };
  const change = { id: mock.primary.interfaceId, name: 'Pending', timing: { width: 1920, height: 1080, frame: 50, standardType: 6, interlaced: 0 }, timingMode: 0 };
  await assert.rejects(applyOutputs(client, [change]), /Confirm.*screen configuration/); assert.equal(mock.writes.length, 0);
  await applyOutputs(client, [{ ...change, confirmTimingReset: true }]); assert.equal(mock.primary.general.name, 'Pending');
  mock.primary.auxiliaryInfo.screenInfo.name = ''; mock.node.genlock.type = 1; const before = mock.writes.length;
  await assert.rejects(applyOutputs(client, [{ ...change, timing: { ...change.timing, frame: 60 } }]), /Confirm/); assert.equal(mock.writes.length, before);
});
