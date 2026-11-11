import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readMvrTemplates, applyMvrTemplate } from '../lib/mvr-templates.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t, model) {
  const mock = createMockStudio({ model }), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}

test('device MVR layouts are listed for the MVR module only and applying one replaces the windows after confirmation', async t => {
  const { client, mock } = await fixture(t), state = await readMvrTemplates(client);
  assert.equal(state.supported, true);
  assert.deepEqual(state.templates, [{ id: 3, type: 1, windows: 2, label: 'Layout 3 · 2 windows' }]); // the layer-module template is not offered
  await assert.rejects(applyMvrTemplate(client, { screenId: 8, templateId: 3, type: 1 }), /replaces every MVR window/);
  await assert.rejects(applyMvrTemplate(client, { screenId: 8, templateId: 9, type: 1, confirmReplace: true }), /layout no longer exists/);
  await assert.rejects(applyMvrTemplate(client, { screenId: 1, templateId: 3, type: 1, confirmReplace: true }), /MVR output no longer exists/);
  assert.equal(mock.writes.length, 0);
  const next = await applyMvrTemplate(client, { screenId: 8, templateId: 3, type: 1, confirmReplace: true });
  assert.deepEqual(mock.writes.at(-1), { path: 'layers/template/select', method: 'PUT', body: { templateId: 3, screenId: 8, sceneType: 2, templateType: 1, moduleType: 0 } });
  assert.deepEqual(next.layers.map(l => l.window), [{ x: 0, y: 0, width: 960, height: 540 }, { x: 960, y: 0, width: 960, height: 540 }]);
  mock.behavior.templateScaling = true;
  await assert.rejects(applyMvrTemplate(client, { screenId: 8, templateId: 3, type: 1, confirmReplace: true }), /scaling limit/);
});

test('models without MVR editing do not query layouts', async t => {
  const { client, mock } = await fixture(t, 'P10');
  assert.deepEqual((await readMvrTemplates(client)).templates, []);
  assert.equal(mock.requests.some(r => r.path === 'layers/template'), false);
});
