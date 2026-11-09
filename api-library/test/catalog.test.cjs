const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const api = require('../index.cjs');
const root = path.resolve(__dirname, '..'), catalog = api.getCatalog();
const all = [...Array(Math.ceil(catalog.operationCount / 1000))].flatMap((_, i) => api.listEndpoints({ limit: 1000, offset: i * 1000 }));

test('catalog has a unique resolvable entry for every indexed operation and every JSON artifact is valid/bounded', () => {
  assert.equal(all.length, catalog.operationCount);
  assert.equal(new Set(all.map(e => e.id)).size, all.length);
  assert.equal(new Set(all.map(e => `${e.method} ${e.path}`)).size, all.length);
  assert.equal(all.reduce((count, e) => count + api.getEndpoint(e.id).vendorEvidence.length, 0) + catalog.coverage.unresolvedCalls,
    catalog.coverage.vendorRequestObservations);
  assert.equal(all.reduce((count, e) => count + api.getEndpoint(e.id).companionEvidence.length, 0), catalog.coverage.companionObservations);
  for (const entry of all) {
    const doc = api.getEndpoint(entry.id);
    assert.equal(doc.path, entry.path);
    assert.match(doc.method, /^(GET|PUT|POST|DELETE|PATCH)$/);
    assert.doesNotMatch(doc.path, /\/v1\/v1\//);
    assert.ok(doc.vendorEvidence.length || doc.companionEvidence.length || doc.manualSections.length || doc.curatedEvidence?.length);
  }
  const scan = directory => {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      if (fs.statSync(file).isDirectory()) scan(file);
      else if (name.endsWith('.json')) {
        const text = fs.readFileSync(file, 'utf8'); JSON.parse(text);
        assert.ok(text.split('\n').length <= 500, `${file} line count`);
      }
    }
  };
  scan(path.join(root, 'data'));
});

test('all 33 manual sections and all 243 original field-table pages remain available', () => {
  assert.equal(all.flatMap(e => api.getEndpoint(e.id).manualSections).length, 33);
  for (let i = 1; i <= 243; i++) {
    const page = api.getManualPage(i); assert.equal(page.page, i); assert.equal(typeof page.text, 'string');
    assert.ok(Array.isArray(page.tables));
  }
  const login = api.getManualPage(4);
  assert.ok(login.tables.some(t => t.rows.some(r => r[0] === 'username' && r[1] === 'string')));
  const cut = api.getEndpoint('PUT', '/unico/v1/screen/cut');
  assert.deepEqual(cut.manualSections.map(s => s.firmware), ['<1.7.0', '>=1.7.0']);
  assert.ok(api.getEndpoint('POST', '/unico/v1/preset/apply').manualSections.some(s => s.firmware === '>=1.7.0'));
  assert.throws(() => api.getManualPage('../index'), /Manual page/);
});

test('semantic search, method/model/group filters, pagination and immutable reads work together', () => {
  assert.ok(api.searchEndpoints('MVR window', { method: 'PUT' }).some(e => e.id === 'put-layers-window'));
  assert.ok(api.searchEndpoints('EDID', { method: 'PUT', model: 'P20' }).some(e => e.id === 'put-interface-preset-thumb-timing'));
  assert.ok(api.searchEndpoints('UMD height', { group: 'node' }).some(e => e.id === 'get-node-config-file'));
  assert.ok(api.listEndpoints({ group: 'layers', limit: 1000 }).every(e => e.group === 'layers'));
  const first = api.listEndpoints({ limit: 2 });
  assert.notEqual(first[0].id, api.listEndpoints({ limit: 2, offset: 2 })[0].id);
  first[0].summary = 'changed'; assert.notEqual(api.listEndpoints({ limit: 2 })[0].summary, 'changed');
  const doc = api.getEndpoint('put-layers-window'); doc.notes.length = 0;
  assert.ok(api.getEndpoint('put-layers-window').notes.length);
  assert.throws(() => api.listEndpoints({ limit: -1 }), /limit/);
  assert.throws(() => api.getEndpoint('../../package.json'), /Unknown API/);
});

test('source contracts preserve exact payload expressions, model scope, types and unresolved calls', () => {
  const doc = api.getEndpoint('put-layers-window');
  assert.ok(doc.vendorEvidence.some(e => e.source.endsWith('/layer.ts') && e.bodyExpression === 'data' && e.line > 0));
  assert.ok(doc.companionEvidence.some(e => e.symbol === 'applyLayerBounds' && e.context.includes('{ layerId, window: bounds }')));
  assert.deepEqual(doc.requestSchema.items.required, ['layerId', 'window']);
  assert.equal(doc.exampleBody[0].window.height, 384);
  assert.ok(api.getType('LayerUMD').some(t => t.declaration.includes('enable: 0 | 1')));
  assert.equal(api.getType('IMVRLayerUMDRequestType')[0].availability, 'referenced-only');
  assert.ok(api.searchTypes('LayerUMD').length);
  assert.ok(api.searchUnresolved('', { limit: 1000 }).length === catalog.coverage.unresolvedCalls);
  assert.ok(api.getEndpoint('put-screen-select').notes.some(n => n.includes('inconsistent')));
});

test('request planning is offline, encodes values and keeps raw JWT headers/body shapes', () => {
  const token = api.makeToken('EXAMPLE', '12345');
  const request = api.buildRequest('put-layers-window', { host: '192.0.2.10', token, body: [{ layerId: 10, window: { x: 0, y: 0, width: 640, height: 384 } }] });
  assert.equal(request.url, 'http://192.0.2.10:8088/unico/v1/layers/window');
  assert.equal(request.init.headers.Authorization, token);
  assert.equal(request.init.method, 'PUT'); assert.ok(Array.isArray(JSON.parse(request.init.body)));
  const read = api.buildRequest('get-layers-list-detail', { host: '::1', token, query: { attachScreenId: 7, name: 'Main & PVW', ids: [1, 2] } });
  const url = new URL(read.url); assert.equal(url.hostname, '[::1]'); assert.equal(url.searchParams.get('name'), 'Main & PVW');
  assert.deepEqual(url.searchParams.getAll('ids'), ['1', '2']);
  const discovery = api.buildRequest('get-ucenter-device-list', { host: '192.0.2.10' });
  assert.equal(new URL(discovery.url).port, '19998'); assert.match(discovery.url, /^https:/);
  assert.equal(discovery.init.headers.Authorization, undefined);
  assert.equal(api.buildRequest('get-node-config-file', { host: '192.0.2.10', token }).responseType, 'text');
  assert.throws(() => api.buildRequest('put-layers-window', { host: 'host' }), /token/);
  assert.throws(() => api.buildRequest('get-node-detail', { host: 'https://host', token }), /host/);
  assert.throws(() => api.buildRequest('get-node-detail', { host: 'host', token, query: { x: {} } }), /scalar/);
});

test('dynamic routes require explicit encoded parameters; controller ports are not guessed', () => {
  const entry = all.find(e => api.getEndpoint(e.id).pathParameters.length);
  assert.ok(entry, 'at least one source-defined template');
  const doc = api.getEndpoint(entry.id);
  const values = Object.fromEntries(doc.pathParameters.map(name => [name, 'a/b ?']));
  assert.throws(() => api.buildRequest(entry.id, { host: 'host', apiPort: 19999, token: 'example' }), /Missing path/);
  const request = api.buildRequest(entry.id, { host: 'host', apiPort: 19999, token: 'example', pathParameters: values });
  assert.ok(request.url.includes('a%2Fb%20%3F'));
  const controller = all.find(e => e.serverKind === 'controller');
  assert.throws(() => api.buildRequest(controller.id, { host: 'host', token: 'example' }), /apiPort/);
});

test('ESM/CommonJS exports and authentication match the tested Studio wire format', async () => {
  const esm = await import('../index.js');
  assert.equal(esm.getCatalog().operationCount, catalog.operationCount);
  const { makeToken } = await import('../../lib/pixelhue.js');
  assert.equal(api.makeToken('EXAMPLE', '12345'), makeToken('EXAMPLE', '12345'));
  const payload = JSON.parse(Buffer.from(api.makeToken('EXAMPLE', '12345').split('.')[1], 'base64url'));
  assert.deepEqual(payload, { SN: 'EXAMPLE' });
});

test('CLI returns agent-readable JSON and structured failures without contacting devices', () => {
  const cli = path.join(root, 'cli.cjs');
  const result = JSON.parse(execFileSync(process.execPath, [cli, 'search', 'MVR window', '--method', 'PUT'], { encoding: 'utf8' }));
  assert.ok(result.some(e => e.id === 'put-layers-window'));
  const bad = spawnSync(process.execPath, [cli, 'show', 'missing'], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(JSON.parse(bad.stderr).error, /Unknown API/);
});
