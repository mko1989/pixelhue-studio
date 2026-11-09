import { fail } from './pixelhue.js';
import { connectorLabel } from './input-models.js';
import { name, timing, batch, choice, verified, sameTiming } from './studio-common.js';

export function normaliseOutputs(interfaces) {
  if (!Array.isArray(interfaces)) throw fail('No output interface list returned.', 502);
  return interfaces.filter(i => [4, 8, 16].includes(i.auxiliaryInfo?.connectorInfo?.interfaceType))
    .sort((a, b) => (a.interfaceIdObj?.slotId ?? 0) - (b.interfaceIdObj?.slotId ?? 0) || (a.interfaceIdObj?.connectorId ?? 0) - (b.interfaceIdObj?.connectorId ?? 0))
    .map((i, index) => {
      const info = i.auxiliaryInfo.connectorInfo, preset = i.presetThumbTiming;
      return { id: i.interfaceId, number: index + 1, name: i.general?.name || `Output ${index + 1}`,
        slotId: i.interfaceIdObj?.slotId, port: (i.interfaceIdObj?.connectorId ?? 0) + 1, type: info.type,
        connector: connectorLabel(info.type), role: info.interfaceType === 16 ? 'MVR' : info.interfaceType === 8 ? 'AUX' : 'Output',
        capacity: info.capacity, workMode: info.workMode, copyFrom: info.copyInfo?.id || null,
        screen: i.auxiliaryInfo.screenInfo?.name || '', online: i.auxiliaryInfo.online !== 0,
        timingEditable: info.workMode === 0 && ![24, 25, 33, 52, 53].includes(info.type),
        timing: preset ? { width: preset.width, height: preset.height, frame: preset.frame,
          standardType: preset.standardType ?? 0, interlaced: preset.interlaced ?? 0 } : null,
        timingMode: i.timingSelect?.select ?? preset?.timingSelect,
        colorDepth: i.colorDepth?.preset ?? null, colorSpace: i.colorSpace?.preset ?? null,
        hdcp: i.hdcp?.enable ?? null, testPattern: i.testPattern?.enable ?? null,
        hdcpPreset: i.hdcp?.preset, patternConfig: i.testPattern || {} };
    });
}
export async function readOutputs(client) {
  const response = await client.call('interface/list-detail');
  return { session: client.session, device: client.deviceInfo(), outputs: normaliseOutputs(response.data?.list) };
}
export async function applyOutputs(client, changes) {
  const state = await readOutputs(client), seen = new Set();
  const plan = batch(changes, state.outputs.length).map(change => {
    const output = state.outputs.find(o => o.id === change.id);
    if (!output || seen.has(change.id)) throw fail('Unknown or duplicate output. Refresh outputs.', 409);
    if (Object.keys(change).some(key => !['id', 'name', 'timing', 'colorDepth', 'hdcp', 'testPattern'].includes(key))) throw fail('Unsupported output setting.');
    seen.add(change.id);
    if (change.name !== undefined) name(change.name, 'Output name');
    if (change.timing !== undefined) {
      if (!output.timingEditable) throw fail(`${output.name} uses fixed/copy timing. Set the primary output instead.`);
      change = { ...change, timing: timing(change.timing) };
    }
    if (change.colorDepth !== undefined) {
      if (output.colorDepth === null) throw fail('Color depth is unavailable on this connector.');
      choice(change.colorDepth, [8, 10, 12], 'output color depth');
    }
    for (const key of ['hdcp', 'testPattern']) if (change[key] !== undefined) {
      if (output[key] === null) throw fail(`${key} is unavailable on this connector.`);
      choice(change[key], [0, 1], key);
    }
    return change;
  });
  const writes = [
    ['name', 'interface/general', c => ({ interfaceId: c.id, general: { name: c.name } })],
    ['timing', 'interface/preset-thumb-timing', c => ({ interfaceId: c.id, presetThumbTiming: { ...c.timing, timingSelect: 3 } })],
    ['colorDepth', 'interface/color-depth', c => ({ interfaceId: c.id, colorDepth: { preset: c.colorDepth } })],
    ['hdcp', 'interface/hdcp', c => ({ interfaceId: c.id, hdcp: { enable: c.hdcp, ...(state.outputs.find(o => o.id === c.id).hdcpPreset !== undefined ? { preset: state.outputs.find(o => o.id === c.id).hdcpPreset } : {}) } })],
    ['testPattern', 'interface/test-pattern', c => ({ interfaceId: c.id, testPattern: { ...state.outputs.find(o => o.id === c.id).patternConfig, enable: c.testPattern } })],
  ];
  for (const [key, path, payload] of writes) {
    const items = plan.filter(c => c[key] !== undefined && (key === 'timing' ? !sameTiming(c.timing, state.outputs.find(o => o.id === c.id).timing) : c[key] !== state.outputs.find(o => o.id === c.id)[key]));
    if (items.length) await client.call(path, items.map(payload), { timeoutMs: 20000 });
  }
  return verified(() => readOutputs(client), next => plan.every(change => {
    const actual = next.outputs.find(o => o.id === change.id);
    return actual && Object.keys(change).filter(key => key !== 'id').every(key => key === 'timing' ? sameTiming(actual.timing, change.timing) : actual[key] === change[key]);
  }), 'the output settings');
}
