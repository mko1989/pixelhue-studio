import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readDevice, applyDevice } from '../lib/studio-device.js';
import { zoneLabel, wallTime, fromWallTime } from '../public/device-extras-ui.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}

test('device clock reads zones from feature XML and writes UTC seconds with the zone enum', async t => {
  const { client, mock } = await fixture(t), before = await readDevice(client);
  assert.deepEqual(before.options.timezones.map(z => [z.value, z.offset, z.name]), [[0, -660, 'Pacific/Midway'], [35, 60, 'Europe/Warsaw'], [70, 480, 'Asia/Shanghai']]);
  assert.deepEqual(before.node.time, { timestamp: 1794248988, timezone: 70 });
  const state = await applyDevice(client, { time: { timezone: 35, timestamp: 1794300000 } });
  assert.deepEqual(mock.writes.at(-1), { path: 'node/clock', method: 'PUT', body: { nodeId: 1, time: { timestamp: 1794300000, timezone: 35 } } });
  assert.deepEqual(state.node.time, { timestamp: 1794300000, timezone: 35 });
  const writes = mock.writes.length;
  await assert.rejects(applyDevice(client, { time: { timezone: 12, timestamp: 1794300000 } }), /Unsupported time zone/);
  await assert.rejects(applyDevice(client, { time: { timezone: 35, timestamp: 17943000001 } }), /Device time/);
  await assert.rejects(applyDevice(client, { name: 'Must not write', time: { timezone: 35 } }), /Device time/);
  assert.equal(mock.writes.length, writes); assert.equal(mock.node.general.name, 'Studio device');
  await assert.rejects(client.call('node/clock', { nodeId: 1, time: { timestamp: 1, timezone: 99 } }), /code 8210/);
});

test('wall time conversion matches PixelFlow: shown time is the instant in the device zone', () => {
  // Live capture: 1794248988 in zone 70 (+480) = 2026-11-10 02:29:48 Shanghai.
  assert.equal(wallTime(1794248988, 480), '2026-11-10T02:29:48');
  assert.equal(fromWallTime('2026-11-10T02:29:48', 480), 1794248988);
  assert.equal(fromWallTime('2026-11-09T19:29', 60), 1794248940); // minute-precision input
  assert.equal(zoneLabel({ offset: 480, name: 'Asia/Shanghai' }), '(UTC+08:00) Asia/Shanghai');
  assert.equal(zoneLabel({ offset: -570, name: 'Pacific/Marquesas' }), '(UTC-09:30) Pacific/Marquesas');
});

test('electrostatic protection posts enable and hold time within the XML range', async t => {
  const { client, mock } = await fixture(t), before = await readDevice(client);
  assert.deepEqual(before.options.antiStatic, { min: 100, max: 2000 }); assert.deepEqual(before.node.antiStatic, { enable: 0, time: 100 });
  const state = await applyDevice(client, { antiStatic: { enable: 1, time: 500 } });
  assert.deepEqual(mock.writes.at(-1), { path: 'node/anti-static', method: 'POST', body: { nodeId: 1, antiStatic: { enable: 1, time: 500 } } });
  assert.deepEqual(state.node.antiStatic, { enable: 1, time: 500 });
  const writes = mock.writes.length;
  await assert.rejects(applyDevice(client, { antiStatic: { enable: 1, time: 2100 } }), /Hold time must be 100–2000/);
  await assert.rejects(applyDevice(client, { antiStatic: { enable: 2 } }), /Unsupported/);
  assert.equal(mock.writes.length, writes);
  await assert.rejects(client.call('node/anti-static', { nodeId: 1, antiStatic: { enable: 1, time: 500 } }), /code 8210/); // PUT is not the contract
  mock.behavior.ignoreSetup = true;
  await assert.rejects(applyDevice(client, { antiStatic: { enable: 0, time: 500 } }), /did not retain/);
});

test('devices without the XML features expose neither block', async t => {
  const { client } = await fixture(t);
  client.configurationPromise = Promise.resolve({ name: 'Device', attributes: {}, children: [] });
  const state = await readDevice(client);
  assert.deepEqual(state.options.timezones, []); assert.equal(state.options.antiStatic, null);
  assert.equal(state.node.time, null); assert.equal(state.node.antiStatic, null);
  await assert.rejects(applyDevice(client, { time: { timezone: 70, timestamp: 1794300000 } }), /clock is unavailable/);
});
