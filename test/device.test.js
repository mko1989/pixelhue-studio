import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { PixelhueClient, makeToken, normalise, validateChanges, validateHost } from '../lib/pixelhue.js';
import { createApp } from '../server.js';

const screens = [
  { screenId: 8, screenIdObj: { type: 8 }, general: { name: 'MVR' }, timing: { horizontal: { addTime: 1920 }, vertical: { addTime: 1080 } } },
  { screenId: 2, screenIdObj: { type: 2 }, general: { name: 'Program' } },
];
const initial = () => [
  { layerId: 10, layerIdObj: { type: 8, attachScreenId: 8 }, general: { name: 'Camera' }, window: { x: 0, y: 0, width: 640, height: 360 } },
  { layerId: 20, layerIdObj: { type: 2, attachScreenId: 2 }, window: { x: 0, y: 0, width: 1920, height: 1080 } },
];
const change = { id: 10, window: { x: 320, y: 200, width: 960, height: 540 } };

async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
const close = (server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });

test('token matches Companion HS256 payload without a timestamp or Bearer prefix', () => {
  const token = makeToken('P20-TEST', '12345');
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { SN: 'P20-TEST' });
  assert.equal(signature, createHmac('sha256', '12345').update(`${header}.${payload}`).digest('base64url'));
});
test('only layers attached to MVR screens are exposed', () => {
  const state = normalise(screens, initial());
  assert.deepEqual(state.screens.map((s) => s.id), [8]);
  assert.deepEqual(state.layers.map((l) => l.id), [10]);
  assert.throws(() => validateChanges([{ ...change, id: 20 }], state), /no longer on an MVR/);
});
test('invalid geometry and duplicate IDs never become write payloads', () => {
  const state = normalise(screens, initial());
  for (const field of [{ x: -1 }, { width: 63 }, { height: 2000 }, { y: 0.2 }, { x: '10' }, { width: null }]) {
    assert.throws(() => validateChanges([{ ...change, window: { ...change.window, ...field } }], state), /must fit/);
  }
  assert.throws(() => validateChanges([change, change], state), /duplicate/);
  assert.throws(() => validateChanges([], state), /Supply/);
});
test('host validation accepts IPs and hostnames and rejects URL/port/path injection', () => {
  for (const host of ['192.168.0.10', 'p20.local', '::1']) assert.equal(validateHost(host), host);
  for (const host of ['http://example.com', 'p20:3000', 'p20/path', 'p20@localhost', '', null]) assert.throws(() => validateHost(host));
});
test('discovery uses HTTPS :19998 and the advertised HTTP port', async () => {
  const calls = [];
  const client = new PixelhueClient(async (options) => {
    calls.push(options);
    if (options.path.endsWith('device-list')) return { data: { list: [{ SN: 'P20-TEST', protocols: [{ linkType: 'http', port: 1234 }] }] } };
    if (options.path.endsWith('open-detail')) return { data: { sn: 'P20-TEST', startTime: '12345', modelId: 28944 } };
    return { data: { list: options.path.includes('screen/') ? screens : initial() } };
  });
  const state = await client.connect({ host: 'p20.local' });
  assert.equal(calls[0].secure, true); assert.equal(calls[0].port, 19998);
  assert.equal(state.device.port, 1234);
  assert.equal(calls[2].token, makeToken('P20-TEST', '12345'));
});
test('IP-only discovery ignores an unrelated NovaStar device, even when it is first', async () => {
  const calls = [];
  const client = new PixelhueClient(async (options) => {
    calls.push(options);
    if (options.path.endsWith('device-list')) return { data: { list: [
      { SN: 'NOVA', ip: '192.168.0.20', protocols: [{ linkType: 'http', port: 8001 }] },
      { SN: 'P20', ip: '192.168.0.10', protocols: [{ linkType: 'http', port: 8002 }] },
    ] } };
    if (options.path.endsWith('open-detail')) { assert.equal(options.port, 8002); return { data: { sn: 'P20', startTime: '12345', modelId: 28944 } }; }
    return { data: { list: options.path.includes('screen/') ? screens : initial() } };
  });
  const state = await client.connect({ host: '192.168.0.10' });
  assert.equal(state.device.serial, 'P20');
  assert.ok(calls.every((call) => call.host === '192.168.0.10'));
});
test('missing discovery IPs fall back to SN verification against the entered host', async () => {
  const client = new PixelhueClient(async (options) => {
    if (options.path.endsWith('device-list')) return { data: { list: [
      { SN: 'OTHER', protocols: [{ linkType: 'http', port: 8001 }] },
      { SN: 'LOCAL', protocols: [{ linkType: 'http', port: 8001 }] },
    ] } };
    if (options.path.endsWith('open-detail')) return { data: { sn: 'LOCAL', startTime: '12345', modelId: 28944 } };
    return { data: { list: options.path.includes('screen/') ? screens : initial() } };
  });
  assert.equal((await client.connect({ host: '192.168.0.10' })).device.serial, 'LOCAL');
});
test('a discovery IP match cannot be redirected to a different serial', async () => {
  const client = new PixelhueClient(async (options) => options.path.endsWith('device-list') ? { data: { list: [
    { SN: 'EXPECTED', ip: '192.168.0.10', protocols: [{ linkType: 'http', port: 8001 }] },
  ] } } : { data: { sn: 'WRONG', startTime: '12345' } });
  await assert.rejects(client.connect({ host: '192.168.0.10' }), /Could not identify/);
});

test('HTTP integration: connect, apply, readback, firmware failures, session and origin guards', async (t) => {
  let layers = initial(), writes = [], code = 0, writeCode = 0, ignoreWrite = false, httpFailure = false, malformed = false;
  const device = http.createServer(async (request, response) => {
    if (httpFailure) { response.writeHead(503).end(); return; }
    if (malformed) { response.end('not-json'); return; }
    const path = new URL(request.url, 'http://localhost').pathname;
    let data;
    if (path.endsWith('open-detail')) data = { sn: 'P20-TEST', startTime: '12345' };
    else {
      assert.equal(request.headers.authorization, makeToken('P20-TEST', '12345'));
      if (path.endsWith('node/detail')) data = { modelId: 28944 };
      else if (path.endsWith('interface/list-detail')) data = { list: [] };
      else if (path.endsWith('screen/list-detail')) data = { list: screens };
      else if (path.endsWith('layers/list-detail')) data = { list: layers };
      else if (path.endsWith('layers/window') && request.method === 'PUT') {
        let body = ''; for await (const chunk of request) body += chunk;
        const changes = JSON.parse(body); writes.push(changes);
        if (writeCode) { response.end(JSON.stringify({ code: writeCode, message: 'MVR size is fixed' })); return; }
        if (!ignoreWrite && [0, 200].includes(code)) for (const item of changes) layers.find((layer) => layer.layerId === item.layerId).window = item.window;
        data = {};
      } else { response.writeHead(404).end(); return; }
    }
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code, message: code ? 'firmware message' : 'ok', data }));
  });
  const app = createApp();
  const deviceUrl = await listen(device), appUrl = await listen(app);
  t.after(async () => { await close(app); await close(device); });
  const call = async (path, body, method = 'POST', headers = {}) => {
    const response = await fetch(appUrl + path, { method: body === undefined ? 'GET' : method,
      headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  let session;
  await t.test('real HTTP handshake and MVR list filtering', async () => {
    const result = await call('/api/connect', { host: '127.0.0.1', apiPort: new URL(deviceUrl).port });
    assert.equal(result.status, 200); assert.equal(result.body.device.serial, 'P20-TEST');
    assert.deepEqual(result.body.layers.map((l) => l.id), [10]); session = result.body.session;
  });
  await t.test('writes exact Companion payload and confirms requested readback', async () => {
    const result = await call('/api/windows', { session, changes: [change] }, 'PUT');
    assert.equal(result.status, 200); assert.deepEqual(result.body.layers[0].window, change.window);
    assert.deepEqual(writes[0], [{ layerId: 10, window: change.window }]);
  });
  await t.test('program layers and out-of-bounds writes are blocked before PUT', async () => {
    const before = writes.length;
    assert.equal((await call('/api/windows', { session, changes: [{ ...change, id: 20 }] }, 'PUT')).status, 409);
    assert.equal((await call('/api/windows', { session, changes: [{ ...change, window: { ...change.window, width: 9999 } }] }, 'PUT')).status, 400);
    assert.equal(writes.length, before);
  });
  await t.test('application error codes and invalid JSON are surfaced', async () => {
    code = 999; assert.equal((await call('/api/state')).status, 502); code = 0;
    malformed = true; assert.match((await call('/api/state')).body.error, /invalid JSON/); malformed = false;
    httpFailure = true; assert.match((await call('/api/state')).body.error, /HTTP 503/); httpFailure = false;
  });
  await t.test('acknowledged but ignored geometry is a failure with actual snapshot', async () => {
    ignoreWrite = true;
    const result = await call('/api/windows', { session, changes: [{ ...change, window: { ...change.window, x: 10 } }] }, 'PUT');
    assert.equal(result.status, 409); assert.match(result.body.error, /did not retain/);
    assert.equal(result.body.snapshot.layers[0].window.x, 320); ignoreWrite = false;
  });
  await t.test('firmware rejection of PUT is reported without claiming success', async () => {
    writeCode = 501;
    const result = await call('/api/windows', { session, changes: [{ ...change, window: { ...change.window, x: 40 } }] }, 'PUT');
    assert.equal(result.status, 502); assert.match(result.body.error, /MVR size is fixed/);
    assert.equal(layers[0].window.x, 320); writeCode = 0;
  });
  await t.test('documented code 200 is accepted alongside firmware code 0', async () => {
    code = 200; assert.equal((await call('/api/state')).status, 200); code = 0;
  });
  await t.test('stale sessions and cross-origin requests cannot write', async () => {
    const before = writes.length;
    assert.equal((await call('/api/windows', { session: 'old', changes: [change] }, 'PUT')).status, 409);
    assert.equal((await call('/api/windows', { session, changes: [change] }, 'PUT', { Origin: 'https://example.com' })).status, 403);
    assert.equal(writes.length, before);
  });
  await t.test('reconnecting invalidates old sessions; demo mode has been removed', async () => {
    assert.equal((await call('/api/connect', { demo: true })).status, 400);
    const result = await call('/api/connect', { host: '127.0.0.1', apiPort: new URL(deviceUrl).port });
    assert.equal(result.status, 200);
    assert.equal((await call('/api/windows', { session, changes: [change] }, 'PUT')).status, 409);
    assert.equal(layers[0].window.x, 320);
  });
  await t.test('unknown routes and static path traversal are refused', async () => {
    assert.equal((await call('/api/unknown')).status, 404);
    assert.equal((await fetch(`${appUrl}/lib/pixelhue.js`)).status, 404);
    const response = await fetch(appUrl); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  });
});
