import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readProgramming, applyProgramming } from '../lib/studio-programming.js';
import { readGallery, uploadPicture, multipart } from '../lib/gallery.js';
import { createMockStudio } from '../test-support/mock-studio.js';
import { createApp } from '../server.js';

process.env.PIXELHUE_STUDIO_DATA = await mkdtemp(join(tmpdir(), 'pixelhue-studio-test-'));
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client, port };
}

test('gallery lists BKG/LOGO support and pictures; upload sends PixelFlow multipart and waits for the picture (WO-027)', async t => {
  const { client, mock } = await fixture(t);
  let gallery = await readGallery(client);
  assert.deepEqual(gallery.support, { bkg: { maxWidth: 65535, maxHeight: 65535 }, logo: { maxWidth: 512, maxHeight: 512 } });
  assert.deepEqual(gallery.pictures.map(p => [p.id, p.type, p.name, p.thumb]), [[1, 1, 'Grid', '/picture/bkg/grid_1.jpg']]);
  gallery = await uploadPicture(client, { type: 2, name: 'Brand', width: 800, height: 400, mime: 'image/png', buffer: Buffer.from('PNGDATA') });
  const write = mock.writes.find(w => w.path === 'picture/import').body;
  assert.match(write.contentType, /^multipart\/form-data; boundary=/);
  assert.deepEqual(write.description, { type: 1, pictureObj: { type: 2 }, general: { name: 'Brand', width: 512, height: 400 } }, 'logo clamped to 512');
  assert.equal(gallery.uploaded.name, 'Brand'); assert.equal(gallery.uploaded.type, 2);
  const writes = mock.writes.length;
  await assert.rejects(uploadPicture(client, { type: 1, name: 'x', width: 10, height: 10, mime: 'image/gif', buffer: Buffer.from('x') }), /PNG, JPEG or BMP/);
  await assert.rejects(uploadPicture(client, { type: 3, name: 'x', width: 10, height: 10, mime: 'image/png', buffer: Buffer.from('x') }), /does not accept/);
  assert.equal(mock.writes.length, writes);
  const { body, contentType } = multipart({ description: '{}' }, { filename: 'a"b.png', mime: 'image/png', buffer: Buffer.from('X') });
  assert.ok(contentType.includes('boundary=')); assert.match(body.toString(), /filename="a_b.png"/);
});

test('background: drop a picture sets the BKG layer source and switches it on; off again (WO-027)', async t => {
  const { client, mock } = await fixture(t);
  let state = await readProgramming(client);
  assert.deepEqual(state.backgrounds.filter(b => b.screenId === 1).map(b => [b.scene, b.enabled, b.pictureId]), [[2, false, null], [4, false, null]]);
  const writes = mock.writes.length;
  await assert.rejects(applyProgramming(client, { action: 'bkg', screenId: 1, scene: 4, enable: true }), /Choose a background picture first/);
  await assert.rejects(applyProgramming(client, { action: 'bkg', screenId: 1, scene: 4, pictureId: 99 }), /from the gallery/);
  assert.equal(mock.writes.length, writes);
  state = await applyProgramming(client, { action: 'bkg', screenId: 1, scene: 4, pictureId: 1, enable: true });
  assert.deepEqual(mock.writes.slice(-3).map(w => [w.path, w.body]), [['layers/source', [{ layerId: 904, source: { general: { sourceId: 1, sourceType: 5, sourceName: 'Grid' } } }]],
    ['layers/aspect-ratio', [{ layerId: 904, aspectRatio: 8, locked: 1 }]],
    ['layers/switch', [{ layerId: 904, enable: 1, sn: client.serial }]]]);
  assert.deepEqual(state.backgrounds.find(b => b.layerId === 904), { screenId: 1, scene: 4, layerId: 904, enabled: true, pictureId: 1, name: 'Grid', aspectLocked: true, aspectMode: 8 });
  state = await applyProgramming(client, { action: 'bkg', screenId: 1, scene: 4, enable: false });
  assert.equal(state.backgrounds.find(b => b.layerId === 904).enabled, false);
});

test('logo: placed at native size, replaces the scene logo, then moves like a layer (WO-027)', async t => {
  const { client, mock } = await fixture(t);
  await uploadPicture(client, { type: 2, name: 'Brand', width: 300, height: 120, mime: 'image/png', buffer: Buffer.from('x') });
  let state = await applyProgramming(client, { action: 'logo', screenId: 1, scene: 4, pictureId: 2, point: { x: 200, y: 100 } });
  let logos = state.layers.filter(l => l.type === 32);
  assert.equal(logos.length, 1); assert.deepEqual(logos[0].window, { x: 50, y: 40, width: 300, height: 120 });
  assert.deepEqual(mock.writes.filter(w => w.path === 'layers/create').at(-1).body.source.general, { sourceId: 2, sourceType: 6 });
  assert.equal(mock.writes.filter(w => w.path === 'layers/create').at(-1).body.locked, 1);
  assert.deepEqual(mock.writes.filter(w => w.path === 'layers/create').at(-1).body.aspectRatio, { aspectRatio: 8, locked: 1 });
  state = await applyProgramming(client, { action: 'logo', screenId: 1, scene: 4, pictureId: 2, point: { x: 900, y: 500 } });
  logos = state.layers.filter(l => l.type === 32);
  assert.equal(logos.length, 1, 'previous logo replaced'); assert.equal(logos[0].window.x, 750);
  state = await applyProgramming(client, { action: 'window', screenId: 1, id: logos[0].id, window: { ...logos[0].window, x: 10 } });
  assert.equal(state.layers.find(l => l.id === logos[0].id).window.x, 10);
});

test('group sources are saved per device outside the repo, listed with groups already on screen, and deletable (WO-027)', async t => {
  const { client } = await fixture(t);
  let state = await readProgramming(client);
  const inputs = state.sources.filter(s => s.type === 2).slice(0, 2);
  state = await applyProgramming(client, { action: 'groupsource-save', screenId: 1, orientation: 'V', name: 'Stack', sources: inputs.map(s => ({ type: 2, id: s.id })) });
  const saved = state.groupSources.find(g => g.id === state.savedGroupSource);
  assert.deepEqual([saved.name, saved.orient, saved.available], ['Stack', 'V', true]);
  const file = JSON.parse(await readFile(join(process.env.PIXELHUE_STUDIO_DATA, 'group-sources.json'), 'utf8'));
  assert.equal(file[client.serial][0].name, 'Stack');
  await assert.rejects(applyProgramming(client, { action: 'groupsource-save', screenId: 1, orientation: 'H', sources: [inputs[0], inputs[0]].map(s => ({ type: 2, id: s.id })) }), /two different/);
  state = await applyProgramming(client, { action: 'group-create', screenId: 1, scene: 4, orientation: 'H', sources: inputs.map(s => ({ type: 2, id: s.id })) });
  assert.ok(state.groupSources.some(g => g.onDevice && g.orient === 'H'), 'placed group listed as a source');
  state = await applyProgramming(client, { action: 'groupsource-delete', screenId: 1, id: saved.id });
  assert.ok(!state.groupSources.some(g => g.id === saved.id));
});

test('gallery HTTP routes: session guard, thumbnail proxy, raw upload (WO-027)', async t => {
  const { port } = await fixture(t);
  const app = createApp(), appPort = await listen(app); t.after(() => close(app));
  const url = `http://127.0.0.1:${appPort}/api/`;
  const state = await (await fetch(url + 'connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', apiPort: port }) })).json();
  assert.equal((await fetch(url + 'gallery?session=wrong')).status, 409);
  const thumb = await fetch(url + `gallery/thumb?session=${state.session}&id=1`);
  assert.equal(thumb.status, 200); assert.equal(thumb.headers.get('content-type'), 'image/jpeg');
  const up = await fetch(url + `gallery/upload?session=${state.session}&type=1&name=Wall&width=1920&height=1080`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  const result = await up.json(); assert.equal(up.status, 200, JSON.stringify(result)); assert.equal(result.uploaded.name, 'Wall');
});
