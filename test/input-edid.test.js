import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readInputAdvanced } from '../lib/input-advanced.js';
import { applyInputTiming, validateEdid } from '../lib/input-edid.js';
import { createMockStudio } from '../test-support/mock-studio.js';
import { sampleEdid } from '../test-support/mock-edid.js';
import { createApp } from '../server.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, port };
}
const timing = { refresh: 59.94, horizontal: { active: 3840, front: 48, sync: 32, total: 4000, polarity: 0 }, vertical: { active: 1080, front: 3, sync: 10, total: 1111, polarity: 0 } };

test('detailed timing writes the PixelFlow presetTiming body and is offered on EDID inputs only', async t => {
  const { client, mock } = await fixture(t), state = await readInputAdvanced(client);
  const hdmi = state.inputs.find(i => i.edid), sdi = state.inputs.find(i => !i.edid);
  assert.deepEqual(hdmi.timing, { refresh: 60, horizontal: { active: 1920, front: 88, sync: 44, total: 2200, polarity: 1 }, vertical: { active: 1080, front: 4, sync: 5, total: 1125, polarity: 1 } });
  assert.equal(sdi.timing, null);
  const next = await applyInputTiming(client, { id: hdmi.id, timing }, readInputAdvanced);
  assert.deepEqual(mock.writes.at(-1), { path: 'interface/preset-timing', method: 'PUT', body: [{ interfaceId: hdmi.id, presetTiming: { interlaced: 0, refresh: 59.94, standardType: 0, edidName: '',
    horizontal: { totalTime: 4000, addTime: 3840, frontPorch: 48, sync: 32, syncPolarity: 0 }, vertical: { totalTime: 1111, addTime: 1080, frontPorch: 3, sync: 10, syncPolarity: 0 } } }] });
  assert.deepEqual(next.inputs.find(i => i.id === hdmi.id).timing, timing);
  const writes = mock.writes.length, bad = change => assert.rejects(applyInputTiming(client, { id: hdmi.id, timing: { ...timing, ...change } }, readInputAdvanced));
  await bad({ horizontal: { ...timing.horizontal, total: 3900 } }); // total smaller than active + porch + sync
  await bad({ vertical: { ...timing.vertical, sync: 0 } }); await bad({ refresh: 59.941 }); await bad({ refresh: 0 }); await bad({ horizontal: { ...timing.horizontal, polarity: 2 } });
  await assert.rejects(applyInputTiming(client, { id: sdi.id, timing }, readInputAdvanced), /HDMI or DisplayPort/);
  await assert.rejects(applyInputTiming(client, { id: mock.primary.interfaceId, timing }, readInputAdvanced), /HDMI or DisplayPort/);
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('interface/preset-timing', [{ interfaceId: hdmi.id, presetTiming: { refresh: 60, horizontal: { addTime: 1920, frontPorch: 88, sync: 44, totalTime: 2000, syncPolarity: 0 }, vertical: { addTime: 1080, frontPorch: 4, sync: 5, totalTime: 1125, syncPolarity: 0 } } }]), /code 8210/);
  mock.behavior.ignoreTiming = true;
  await assert.rejects(applyInputTiming(client, { id: hdmi.id, timing: { ...timing, refresh: 50 } }, readInputAdvanced), /did not retain the detailed timing/);
});

test('EDID files are structure-checked before upload', () => {
  assert.equal(validateEdid(sampleEdid()).length, 128); assert.equal(validateEdid(sampleEdid(1)).length, 256);
  const broken = sampleEdid(); broken[20] ^= 1;
  assert.throws(() => validateEdid(broken), /wrong checksum/);
  assert.throws(() => validateEdid(sampleEdid().subarray(0, 100)), /128-byte blocks/);
  assert.throws(() => validateEdid(Buffer.concat([sampleEdid(), sampleEdid()])), /declares 0 extension/);
  assert.throws(() => validateEdid(Buffer.alloc(128, 1)), /EDID header/);
});

test('EDID import and export go through the session-guarded route as binary', async t => {
  const mock = createMockStudio(), devicePort = await listen(mock.server), app = createApp(), port = await listen(app);
  t.after(() => Promise.all([close(mock.server), close(app)]));
  const base = `http://127.0.0.1:${port}/api`, state = await (await fetch(`${base}/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', apiPort: devicePort }) })).json();
  const input = mock.interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2 && i.auxiliaryInfo.connectorInfo.type === 6 && i.auxiliaryInfo.connectorInfo.workMode !== 2), url = `${base}/edid?session=${state.session}&id=${input.interfaceId}`;
  const file = sampleEdid(1);
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file }), result = await put.json();
  assert.equal(put.status, 200); assert.equal(result.importedEdid, input.interfaceId); assert.equal(result.inputs.find(i => i.id === input.interfaceId).edidFile, 'edid.bin');
  const write = mock.writes.find(w => w.path === 'interface/edid-file');
  assert.deepEqual(write.body.interfaceIds, [{ interfaceId: input.interfaceId }]); assert.equal(write.body.fileBytes, 256); assert.match(write.body.contentType, /^multipart\/form-data; boundary=/);
  const get = await fetch(url); assert.equal(get.status, 200); assert.match(get.headers.get('content-disposition'), /attachment; filename=".+\.bin"/);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), file);
  const broken = Buffer.from(file); broken[5] = 0;
  assert.equal((await fetch(url, { method: 'PUT', body: broken })).status, 415); assert.equal(mock.writes.filter(w => w.path === 'interface/edid-file').length, 1);
  assert.equal((await fetch(`${base}/edid?session=stale&id=${input.interfaceId}`)).status, 409);
  assert.equal((await fetch(`${base}/edid?session=${state.session}&id=${mock.primary.interfaceId}`)).status, 409); // an output
});
