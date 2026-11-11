import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { manageGallery } from '../lib/gallery-manage.js';
import { readGallery } from '../lib/gallery.js';
import { createMockStudio } from '../test-support/mock-studio.js';
import { createApp } from '../server.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); client.capturePollMs = 5; return { mock, client, port };
}
const add = (mock, id, extra = {}) => mock.pictures.push({ pictureId: id, isUsed: 2, pictureObj: { id, type: 1 }, general: { name: `Pic ${id}`, width: 1920, height: 1080 }, path: [{ type: 0, url: `/picture/bkg/p_${id}.jpg` }], ...extra });

test('gallery rename and delete use the PixelFlow bodies; pictures in use and device-kept pictures are reported', async t => {
  const { client, mock } = await fixture(t); add(mock, 7); add(mock, 8, { isUsed: 1 });
  let gallery = await manageGallery(client, { action: 'rename', id: 7, name: 'Stage plot' });
  assert.deepEqual(mock.writes.at(-1), { path: 'picture/general', method: 'PUT', body: { pictureId: 7, name: 'Stage plot' } });
  assert.equal(gallery.pictures.find(p => p.id === 7).name, 'Stage plot');
  const writes = mock.writes.length;
  await assert.rejects(manageGallery(client, { action: 'delete', ids: [7, 8] }), /Pic 8 is in use/);
  await assert.rejects(manageGallery(client, { action: 'delete', ids: [99] }), /no longer in the gallery/);
  await assert.rejects(manageGallery(client, { action: 'delete', ids: [7, 7] }), /Choose pictures/);
  await assert.rejects(manageGallery(client, { action: 'rename', id: 7, name: '' }), /Picture name/);
  await assert.rejects(manageGallery(client, { action: 'purge' }), /Unsupported gallery action/);
  assert.equal(mock.writes.length, writes);
  mock.behavior.keepPictures = true;
  await assert.rejects(manageGallery(client, { action: 'delete', ids: [7] }), /did not delete Stage plot/);
  mock.behavior.keepPictures = false;
  gallery = await manageGallery(client, { action: 'delete', ids: [7, 1] });
  assert.deepEqual(mock.writes.at(-1), { path: 'picture', method: 'DELETE', body: { pictureIds: [7, 1] } });
  assert.deepEqual(gallery.pictures.map(p => p.id), [8]);
});

test('capture posts the source, waits for the capture to complete, then saves it as a background', async t => {
  const { client, mock } = await fixture(t);
  const gallery = await manageGallery(client, { action: 'capture', source: 'pgm', id: 1, name: 'PGM 1' });
  const calls = mock.writes.filter(w => w.path.startsWith('picture/capture'));
  assert.deepEqual(calls[0], { path: 'picture/capture', method: 'POST', body: { source: { type: 0, id: 1 } } });
  assert.deepEqual(calls[1], { path: 'picture/capture/save', method: 'PUT', body: { pictureId: gallery.captured.id, name: 'PGM 1', type: 1 } });
  assert.equal(gallery.captured.name, 'PGM 1'); assert.ok(mock.requests.filter(r => r.path === 'picture/progress').length >= 2);
  const input = mock.interfaces.find(i => i.auxiliaryInfo.connectorInfo.interfaceType === 2).interfaceId;
  await manageGallery(client, { action: 'capture', source: 'input', id: input, name: 'In 1' });
  assert.deepEqual(mock.writes.filter(w => w.path === 'picture/capture').at(-1).body, { source: { type: 1, id: input } });
  const count = mock.writes.length;
  await assert.rejects(manageGallery(client, { action: 'capture', source: 'pgm', id: 1, name: 'PGM 1' }), /already exists/);
  await assert.rejects(manageGallery(client, { action: 'capture', source: 'layer', id: 1, name: 'x' }), /Choose a screen PGM or an input/);
  mock.node.status = 4;
  await assert.rejects(manageGallery(client, { action: 'capture', source: 'pgm', id: 1, name: 'Busy' }), /device is busy/);
  assert.equal(mock.writes.length, count); mock.node.status = 1;
  mock.behavior.captureFails = true;
  await assert.rejects(manageGallery(client, { action: 'capture', source: 'pgm', id: 1, name: 'Fails' }), /could not capture/);
  assert.ok(!(await readGallery(client)).pictures.some(p => p.name === 'Fails'));
  await assert.rejects(client.call('picture/capture', { source: { type: 0, id: 8 } }, { method: 'POST' }), /code 8210/); // MVR screen is not a capture source in the mock
});

test('gallery management HTTP route requires the current session', async t => {
  const mock = createMockStudio(), devicePort = await listen(mock.server), app = createApp(), port = await listen(app);
  t.after(() => Promise.all([close(mock.server), close(app)]));
  const call = (path, body, method = 'PUT') => fetch(`http://127.0.0.1:${port}/api/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
  const { body: state } = await call('connect', { host: '127.0.0.1', apiPort: devicePort }, 'POST');
  assert.equal((await call('gallery/manage?session=stale', { action: 'rename', id: 1, name: 'x' })).status, 409);
  const renamed = await call(`gallery/manage?session=${state.session}`, { action: 'rename', id: 1, name: 'Renamed' });
  assert.equal(renamed.status, 200); assert.equal(renamed.body.pictures[0].name, 'Renamed');
});
