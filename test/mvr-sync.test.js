import test from 'node:test';
import assert from 'node:assert/strict';
import { createMvrSync } from '../public/mvr-sync.js';
import { reconcileMvr } from '../public/mvr-reconcile.js';
import { discoverPixelhue, lanTargets } from '../lib/discovery.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const layer = x => ({ id: 1, window: { x, y: 0, width: 640, height: 360 }, aspectLock: null, aspectMode: 5 });

test('MVR edits coalesce and wait until drag completion; cancelling a drag produces no write', async () => {
  let local = [], dragging = true; const writes = [];
  const sync = createMvrSync({ getChanges: () => local, submit: async sent => { writes.push(sent); return sent; },
    onResult: () => { local = []; }, onError: assert.fail, canSend: () => !dragging, delay: 5 });
  local = [layer(10)]; sync.schedule(); await pause(15); assert.equal(writes.length, 0);
  local = []; dragging = false; await sync.flush(); assert.equal(writes.length, 0, 'cancelled drag');
  for (const x of [20, 40, 60]) { local = [layer(x)]; sync.schedule(); }
  await pause(25); assert.equal(writes.length, 1); assert.equal(writes[0][0].window.x, 60); sync.reset();
});

test('MVR readback preserves edits created in flight and saves the newest snapshot next', async () => {
  let base = { layers: [layer(0)] }, local = { layers: [layer(20)] };
  const first = deferred(), second = deferred(), writes = [];
  const sync = createMvrSync({ getChanges: () => local.layers.filter(l => l.window.x !== base.layers[0].window.x),
    submit: sent => { writes.push(sent); return writes.length === 1 ? first.promise : second.promise; },
    onResult(next, sent) { local = reconcileMvr(local, base, next, sent); base = next; }, onError: assert.fail });
  const task = sync.flush(); await pause(0); local.layers[0] = layer(80);
  first.resolve({ layers: [layer(20)] }); await task; assert.equal(local.layers[0].window.x, 80);
  await pause(10); assert.equal(writes.length, 2); assert.equal(writes[1][0].window.x, 80);
  second.resolve({ layers: [layer(80)] }); await sync.idle(); await pause(0);
  assert.equal(local.layers[0].window.x, base.layers[0].window.x); sync.reset();
});

test('failed automatic writes stop retry loops and can be explicitly retried without losing pending geometry', async () => {
  let pending = [layer(40)], calls = 0, errors = 0;
  const sync = createMvrSync({ getChanges: () => pending, submit: async () => {
    calls++; if (calls === 1) throw new Error('Offline'); return {};
  }, onResult: () => { pending = []; }, onError: () => { errors++; }, delay: 5 });
  await sync.flush(); await pause(25); assert.equal(calls, 1); assert.equal(errors, 1); assert.equal(pending[0].window.x, 40);
  await sync.retry(); assert.equal(calls, 2); assert.equal(pending.length, 0); assert.equal(sync.error, null); sync.reset();
});

test('connection changes discard old autosave replies and still allow the next connection to save', async () => {
  let pending = [layer(30)], accepted = [], calls = 0; const old = deferred();
  const sync = createMvrSync({ getChanges: () => pending, submit: () => { calls++; return calls === 1 ? old.promise : Promise.resolve('new'); },
    onResult: result => { accepted.push(result); pending = []; }, onError: assert.fail });
  const running = sync.flush(); await pause(0); sync.reset(); pending = [layer(60)];
  old.resolve('old'); await running; await pause(15); assert.deepEqual(accepted, ['new']); sync.reset();
});

test('native discovery filters unsupported devices, deduplicates serials and uses advertised HTTP ports', async () => {
  const calls = [];
  const result = await discoverPixelhue({ seed: '192.0.2.10' }, async request => {
    calls.push(request); return { data: { list: [
      { SN: 'OTHER', modelId: 1, ip: '192.0.2.9', protocols: [{ linkType: 'http', port: 8088 }] },
      { SN: 'P20', modelId: 28944, deviceName: 'Desk', ip: '192.0.2.10', protocols: [{ linkType: 'http', port: 8088 }] },
      { SN: 'OFF', modelId: 29974, online: 0, ip: '192.0.2.11', protocols: [{ linkType: 'http', port: 8088 }] },
    ] } };
  }, {});
  assert.equal(result.devices.length, 1); assert.equal(result.devices[0].apiPort, 8088); assert.equal(result.devices[0].model, 'P20');
  assert.ok(calls.every(c => c.secure && c.port === 19998 && c.path.endsWith('clientType=8')));
  assert.equal(result.scanned, 0);
});

test('LAN discovery is bounded to local private /24 networks and limits concurrent service probes', async () => {
  const interfaces = { en0: [{ family: 'IPv4', internal: false, address: '192.168.1.40', netmask: '255.255.255.0' }],
    vpn: [{ family: 'IPv4', internal: false, address: '100.64.1.2', netmask: '255.255.255.255' }] };
  const targets = lanTargets(interfaces); assert.equal(targets.length, 253); assert.ok(!targets.includes('192.168.1.40'));
  let active = 0, peak = 0;
  const result = await discoverPixelhue({}, async request => {
    active++; peak = Math.max(active, peak); await pause(1); active--;
    return { data: { list: request.host === '192.168.1.7' ? [{ SN: 'Q8', modelId: 29974, ip: request.host, protocols: [{ linkType: 'http', port: 9000 }] }] : [] } };
  }, interfaces);
  assert.ok(peak <= 32); assert.equal(result.scanned, 253); assert.equal(result.devices[0].model, 'Q8');
});
