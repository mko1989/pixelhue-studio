import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readAudio, applyAudio, parseHeader } from '../lib/studio-audio.js';
import { pairRoutes } from '../public/audio-ui.js';
import { createMockStudio } from '../test-support/mock-studio.js';
import { createApp } from '../server.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t, options) {
  const mock = createMockStudio(options), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); const state = await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, port, state };
}
const audioWrites = mock => mock.writes.filter(w => w.path.startsWith('audio/'));

test('audio matrix lists valid RX rows and TX columns from headers and interface channels, gated by feature XML', async t => {
  const { client, mock, state: connected } = await fixture(t);
  assert.equal(connected.capabilities.audio, true);
  const state = await readAudio(client);
  assert.equal(state.supported, true);
  assert.deepEqual(parseHeader('3,16,1,500016,1'), { slot: 3, connector: 16, channel: 1, interfaceId: 500016, valid: true });
  // Hidden like PixelFlow: headers flagged invalid (inactive HDMI/DP alternates).
  const invalid = mock.audio.rows.filter(key => key.endsWith(',0'));
  assert.ok(invalid.length); assert.ok(invalid.every(key => !state.inputs.some(i => i.key === key)));
  assert.equal(state.inputs.length, mock.audio.rows.length - invalid.length);
  assert.equal(state.outputs.length, mock.audio.columns.length);
  assert.ok(state.inputs.every(c => c.type === 1) && state.outputs.every(c => c.type === 2));
  const analog = state.inputs.filter(c => c.kind === 'Analog'); assert.equal(analog.length, 2);
  assert.equal(analog[0].port, 'Audio In -1'); assert.equal(analog[0].signal, null);
  assert.equal(state.inputs.find(c => c.kind === 'Input').signal, 0);
  assert.ok(Object.values(state.routes).every(v => v === null));
  const none = await fixture(t, { audioFeature: false });
  assert.equal(none.state.capabilities.audio, false);
  assert.equal((await readAudio(none.client)).supported, false);
  await assert.rejects(applyAudio(none.client, { clear: true }), /does not advertise/);
  assert.equal(none.mock.requests.some(r => r.path.startsWith('audio/')), false);
});

test('routing posts only changed crosspoints, replaces an output source like the device, and clears with disables', async t => {
  const { client, mock } = await fixture(t);
  let state = await readAudio(client); const [a, b] = state.inputs, [out, out2] = state.outputs;
  state = await applyAudio(client, { routes: [{ output: out.key, input: a.key }] });
  assert.equal(state.routes[out.key], a.key);
  assert.deepEqual(audioWrites(mock).at(-1), { path: 'audio/matrix-mapping', method: 'POST', body: [{ columnHeader: out.key, rowHeader: a.key, mappingEnable: 1 }] });
  // Replacing sends just the new crosspoint (PixelFlow updateMatrixData); the device drops the old one.
  state = await applyAudio(client, { routes: [{ output: out.key, input: b.key }, { output: out2.key, input: b.key }] });
  assert.equal(state.routes[out.key], b.key); assert.equal(state.routes[out2.key], b.key);
  assert.deepEqual(audioWrites(mock).at(-1).body.map(i => i.mappingEnable), [1, 1]);
  assert.equal(mock.audio.matrix.flat().filter(Boolean).length, 2);
  const count = audioWrites(mock).length;
  await applyAudio(client, { routes: [{ output: out.key, input: b.key }] }); // already routed: no write
  assert.equal(audioWrites(mock).length, count);
  state = await applyAudio(client, { routes: [{ output: out.key, input: null }] });
  assert.equal(state.routes[out.key], null);
  assert.deepEqual(audioWrites(mock).at(-1).body, [{ columnHeader: out.key, rowHeader: b.key, mappingEnable: 0 }]);
  state = await applyAudio(client, { clear: true });
  assert.ok(Object.values(state.routes).every(v => v === null));
  assert.deepEqual(audioWrites(mock).at(-1).body, [{ columnHeader: out2.key, rowHeader: b.key, mappingEnable: 0 }]);
});

test('invalid audio requests write nothing; the mock device refuses invalid headers; ignored writes are reported', async t => {
  const { client, mock } = await fixture(t);
  const state = await readAudio(client), out = state.outputs[0], hidden = mock.audio.rows.find(key => key.endsWith(',0'));
  await assert.rejects(applyAudio(client, { routes: [{ output: out.key, input: hidden }] }), /Unknown audio input/);
  await assert.rejects(applyAudio(client, { routes: [{ output: 'x', input: null }] }), /Unknown or duplicate/);
  await assert.rejects(applyAudio(client, { routes: [{ output: out.key, input: null }, { output: out.key, input: null }] }), /duplicate/);
  await assert.rejects(applyAudio(client, { channels: [{ key: out.key, type: 1, mute: 1 }] }), /Unknown or duplicate audio channel/);
  await assert.rejects(applyAudio(client, { channels: [{ key: out.key, type: 2, mute: 2 }] }), /Unsupported mute/);
  await assert.rejects(applyAudio(client, { channels: [{ key: out.key, type: 2 }] }), /Choose mute or test tone/);
  await assert.rejects(applyAudio(client, { volume: 3 }), /Unsupported audio setting/);
  await assert.rejects(applyAudio(client, {}), /No audio change/);
  assert.equal(audioWrites(mock).length, 0);
  // Device rule modelled in the mock: an invalid header is refused with an error code, not silently accepted.
  await assert.rejects(client.call('audio/matrix-mapping', [{ columnHeader: out.key, rowHeader: hidden, mappingEnable: 1 }], { method: 'POST' }), /code 8210/);
  await assert.rejects(client.call('audio/matrix-mapping', [{ columnHeader: out.key, rowHeader: state.inputs[0].key, mappingEnable: 1 }]), /code 8210/); // PUT is not the contract
  mock.behavior.ignoreAudio = true;
  await assert.rejects(applyAudio(client, { routes: [{ output: out.key, input: state.inputs[0].key }] }), /did not retain the audio routing/);
  await assert.rejects(applyAudio(client, { channels: [{ key: out.key, type: 2, tone: 1 }] }), /did not retain/);
});

test('mute and test tone send both flags per channel, keeping the untouched one', async t => {
  const { client, mock } = await fixture(t);
  let state = await readAudio(client); const input = state.inputs[0], out = state.outputs[1];
  state = await applyAudio(client, { channels: [{ key: input.key, type: 1, mute: 1 }, { key: out.key, type: 2, tone: 1 }] });
  assert.deepEqual(audioWrites(mock).at(-1), { path: 'audio/matrix-base', method: 'POST', body: [
    { interfaceId: input.interfaceId, channelIndex: input.channel, isMute: 1, testAudioEnable: 0, channelType: 1 },
    { interfaceId: out.interfaceId, channelIndex: out.channel, isMute: 0, testAudioEnable: 1, channelType: 2 }] });
  assert.equal(state.inputs[0].mute, 1); assert.equal(state.outputs[1].tone, 1);
  state = await applyAudio(client, { channels: [{ key: input.key, type: 1, tone: 1 }] });
  assert.deepEqual(audioWrites(mock).at(-1).body, [{ interfaceId: input.interfaceId, channelIndex: input.channel, isMute: 1, testAudioEnable: 1, channelType: 1 }]);
  assert.equal(state.inputs[0].mute, 1); assert.equal(state.inputs[0].tone, 1);
});

test('pair routing maps same-numbered channels of two ports and only removes the pair it made', () => {
  const ch = (key, interfaceId, channel) => ({ key, interfaceId, channel });
  const state = { inputs: [ch('a0', 1, 0), ch('a1', 1, 1), ch('b0', 2, 0)], outputs: [ch('x0', 9, 0), ch('x1', 9, 1)], routes: { x0: 'a0', x1: 'b0' } };
  assert.deepEqual(pairRoutes(state, state.inputs[0], state.outputs[0], true), [{ output: 'x0', input: 'a0' }, { output: 'x1', input: 'a1' }]);
  assert.deepEqual(pairRoutes(state, state.inputs[0], state.outputs[0], false), [{ output: 'x0', input: null }]);
  assert.deepEqual(pairRoutes(state, state.inputs[2], state.outputs[0], true), [{ output: 'x0', input: 'b0' }]);
});

test('audio HTTP resource requires the current session and same origin', async t => {
  const mock = createMockStudio(), devicePort = await listen(mock.server), app = createApp(), port = await listen(app);
  t.after(() => Promise.all([close(mock.server), close(app)]));
  const call = (path, options) => fetch(`http://127.0.0.1:${port}/api/${path}`, options).then(async r => ({ status: r.status, body: await r.json() }));
  const json = body => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const { body: state } = await call('connect', { ...json({ host: '127.0.0.1', apiPort: devicePort }), method: 'POST' });
  const audio = (await call(`audio?session=${state.session}`)).body;
  assert.equal(audio.supported, true);
  assert.equal((await call('audio?session=stale')).status, 409);
  assert.equal((await call('audio', json({ session: 'stale', clear: true }))).status, 409);
  assert.equal((await call('audio', { ...json({ session: state.session, clear: true }), headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' } })).status, 403);
  const routed = await call('audio', json({ session: state.session, routes: [{ output: audio.outputs[0].key, input: audio.inputs[0].key }] }));
  assert.equal(routed.status, 200); assert.equal(routed.body.routes[audio.outputs[0].key], audio.inputs[0].key);
});
