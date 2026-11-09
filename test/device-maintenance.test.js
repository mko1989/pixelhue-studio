import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PixelhueClient } from '../lib/pixelhue.js';
import { readDevice } from '../lib/studio-device.js';
import { xmlFile } from '../lib/configuration.js';
import { cardCatalog, labelCards, layerModeOptions, validateNetwork, runDeviceAction, RESET_PRESETS } from '../lib/studio-maintenance.js';
import { xmlTree, child } from '../lib/configuration.js';
import { createMockStudio } from '../test-support/mock-studio.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
async function fixture(t) {
  const mock = createMockStudio(), port = await listen(mock.server), client = new PixelhueClient();
  t.after(() => close(mock.server)); await client.connect({ host: '127.0.0.1', apiPort: port }); return { mock, client };
}

// Reduced from live P20 node/config-file (2026-11-09): feature.xml holds its own <File> feature element.
const CONFIG = `<Files>
<File><path>deviceconfig/device/feature.xml</path><data><DCS><Device><Features>
<File Support="1"><Type Value="1"/></File>
<PowerCtrl Support="1" Editable="1"><Type><Enum Value="0"/><Enum Value="1"/></Type></PowerCtrl>
</Features></Device></DCS></data></File>
<File><path>deviceconfig/device/slot.xml</path><data><DCS><Device><Slots>
<MainControlCardSlots SilkScreenName="MainControl"><Slot Index="100"><Subcards><Subcard ModuleId="28944"><ConnectorGroups>
<ConnectorGroup Value="0" GroupName="In 1"/><ConnectorGroup Value="1" GroupName="In 2"/><ConnectorGroup Value="4" GroupName="MVR"/>
</ConnectorGroups></Subcard></Subcards></Slot></MainControlCardSlots>
<MixCardSlots SilkScreenName="Mix"><Slot Index="2"><Subcards><Subcard ModuleId="15728897"><ConnectorGroups>
<ConnectorGroup Value="0" GroupName="OUTPUT 1"/><ConnectorGroup Value="1" GroupName="OUTPUT 2"/><ConnectorGroup Value="2" GroupName="OUTPUT 3"/>
</ConnectorGroups></Subcard></Subcards></Slot></MixCardSlots></Slots></Device></DCS></data></File>
<File><path>deviceconfig/subcard/mixcard/28944.xml</path><data><DCS><Subcards><Subcard ModelId="28944"><Name><zh_CN>主卡</zh_CN><en>main card</en></Name></Subcard></Subcards></DCS></data></File>
<File><path>deviceconfig/subcard/outputcard/15728897.xml</path><data><DCS><Subcards><Subcard ModelId="15728897"><Name><zh_CN>x</zh_CN><en>
4xHDMI2.0OUT_4xHDMI2.0复制
</en></Name></Subcard></Subcards></DCS></data></File>
</Files>`;

test('configuration files survive nested <File> feature elements (WO-015)', () => {
  const feature = xmlFile(CONFIG, 'deviceconfig/device/feature.xml');
  assert.match(feature, /<PowerCtrl/); assert.ok(feature.endsWith('</File>'));
  assert.doesNotMatch(feature, /slot\.xml/);
  assert.equal(xmlFile(CONFIG, 'missing.xml'), '');
});

test('installed cards get catalog names and rear-panel port labels', () => {
  const cards = labelCards([{ slotId: 2, modelId: 15728897, online: 1 }, { slotId: 100, modelId: 28944, online: 1 }, { slotId: 4, modelId: 123, online: 0 }], cardCatalog(CONFIG));
  assert.deepEqual(cards.map(c => [c.slot, c.kind, c.name, c.ports]), [
    ['Slot 2', 'Output card', '4xHDMI2.0OUT + 4xHDMI2.0 copy', 'OUTPUT 1–3'],
    ['Main', 'Main board', 'Main board', 'In 1–2, MVR'],
    ['Slot 4', 'Card', 'Model 123', ''],
  ]);
});

test('layer profiles carry MAIN/PIP counts and HDR per device type', () => {
  const features = child(xmlTree(`<Features><DynamicRangConversion><LayerModes Support="1">
    <LayerMode HDRSupport="1" Value="0" Type="0"/><LayerMode HDRSupport="0" Value="1" Type="0"/>
    <LayerMode HDRSupport="0" Value="0" Type="1"/><LayerMode HDRSupport="0" Value="1" Type="1"/></LayerModes></DynamicRangConversion></Features>`), 'Features');
  assert.deepEqual(layerModeOptions([0, 1], features, [{ modelId: 15728898 }]).map(m => [m.label, m.main, m.pip, m.hdr]),
    [['2 × MAIN + 10 × PIP', 2, 10, false], ['4 × MAIN + 4 × PIP', 4, 4, false]]);
  assert.equal(layerModeOptions([0], features, [{ modelId: 15728933 }])[0].hdr, true);
  assert.deepEqual(layerModeOptions([5], undefined, []), [{ value: 5, label: 'Profile 6', main: null, pip: null, hdr: null }]);
});

test('network validation rejects unusable static addresses', () => {
  const ok = { dhcp: 0, ip: '192.168.0.20', netmask: '255.255.255.0', gateway: '192.168.0.1' };
  assert.deepEqual(validateNetwork(ok), ok);
  assert.deepEqual(validateNetwork({ dhcp: 1, ip: 'x' }), { dhcp: 1, ip: '', netmask: '', gateway: '' });
  for (const [patch, message] of [[{ ip: '192.168.0.256' }, /IPv4/], [{ netmask: '255.0.255.0' }, /contiguous/],
    [{ gateway: '10.0.0.1' }, /same subnet/], [{ ip: '192.168.0.255' }, /broadcast/], [{ ip: '192.168.0.1' }, /differ/], [{ dhcp: 2 }, /Unsupported/]]) {
    assert.throws(() => validateNetwork({ ...ok, ...patch }), message);
  }
});

test('device actions confirm, write vendor payloads and report reconnects', async t => {
  const { mock, client } = await fixture(t);
  const state = await readDevice(client);
  assert.equal(state.network.ip, '192.168.0.20'); assert.deepEqual(state.options.power, ['restart', 'shutdown']);
  const writes = () => mock.writes.filter(w => ['node/ethernet', 'node/power', 'system/restore-factory'].includes(w.path));
  const network = { dhcp: 0, ip: '192.168.0.20', netmask: '255.255.255.0', gateway: '192.168.0.254' };
  await assert.rejects(runDeviceAction(client, { action: 'network', network }, readDevice), /Confirm/);
  await assert.rejects(runDeviceAction(client, { action: 'factory-reset', keep: 'network', confirm: true }, readDevice), /Type RESET/);
  await assert.rejects(runDeviceAction(client, { action: 'restart' }, readDevice), /Confirm/);
  await assert.rejects(runDeviceAction(client, { action: 'network', network: { ...state.network }, confirm: true }, readDevice), /No network changes/);
  assert.equal(writes().length, 0);

  const saved = await runDeviceAction(client, { action: 'network', network, confirm: true }, readDevice);
  assert.equal(saved.network.gateway, '192.168.0.254');
  assert.deepEqual(writes()[0].body, { nodeId: 1, ethernet: { mode: 0, infos: [{ index: 0, dhcp: 0, ip: '192.168.0.20', netmask: '255.255.255.0', gateway: '192.168.0.254', autoDNS: 0, dns: [] }] } });
  const moved = await runDeviceAction(client, { action: 'network', network: { ...network, ip: '192.168.0.21' }, confirm: true }, readDevice);
  assert.deepEqual([moved.reconnect, moved.host], [true, '192.168.0.21']);
  const dhcp = await runDeviceAction(client, { action: 'network', network: { dhcp: 1 }, confirm: true }, readDevice);
  assert.equal(dhcp.host, null); assert.deepEqual(writes().at(-1).body.ethernet.infos[0].ip, '');

  await runDeviceAction(client, { action: 'restart', confirm: true }, readDevice);
  await runDeviceAction(client, { action: 'shutdown', confirm: true }, readDevice);
  assert.deepEqual(writes().filter(w => w.path === 'node/power').map(w => w.body), [{ nodeId: 1, option: 0 }, { nodeId: 1, option: 1 }]);
  for (const keep of Object.keys(RESET_PRESETS)) await runDeviceAction(client, { action: 'factory-reset', keep, confirm: 'RESET' }, readDevice);
  assert.deepEqual(writes().filter(w => w.path === 'system/restore-factory').map(w => w.body.restoreFactory.map(r => r.type)),
    [[0, 1, 2, 3, 4, 5, 8], [0, 1], [0]]);
  await assert.rejects(runDeviceAction(client, { action: 'sleep', confirm: true }, readDevice), /Unsupported/);
});
