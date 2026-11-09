import { fail } from './pixelhue.js';
import { choice, verified } from './studio-common.js';

// Presets use the documented v2 family (manual §6.2): GET preset, POST preset/create|apply|update-name|delete.
// preset/list-detail returns 404 on P20 V2.0.0 firmware (WO-016).
export async function readPresets(client) {
  const list = [];
  for (let page = 1; page <= 20; page++) {
    let data;
    try { data = (await client.call(`preset?limit=200&page=${page}`)).data; } catch { return null; }
    list.push(...(data?.list || []));
    if (!data?.totalPage || page >= data.totalPage) break;
  }
  return list.filter(p => p?.guid).map(p => ({ guid: p.guid, serial: p.serial, name: p.name || `Preset ${p.serial}`,
    sourceRegion: p.sourceRegion, screens: (p.screens || []).map(s => s.name).filter(Boolean) }))
    .sort((a, b) => a.serial - b.serial);
}

const presetName = value => {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > 64 || /[\x00-\x1f]/.test(value)) throw fail('Preset name must contain 1–64 UTF-8 bytes.');
  return value.trim();
};

export async function applyPreset(client, request, state, read) {
  const presets = state.presets;
  if (!presets) throw fail('Presets are unavailable on this device.', 409);
  const find = () => { const p = presets.find(item => item.guid === request.guid); if (!p) throw fail('Preset no longer exists. Refresh.', 409); return p; };
  if (request.action === 'preset-load') {
    const preset = find(), targetRegion = choice(request.target, [2, 4], 'preset target');
    // Body as used on hardware by companion-module-pixelhue-switcher ApiClient.loadPreset.
    await client.call('preset/apply', { serial: preset.serial, presetId: preset.guid, targetRegion,
      auxiliary: { keyFrame: { enable: 1 }, switchEffect: { type: 0, time: 0 }, swapEnable: 1, effect: { enable: 1 } } }, { method: 'POST', timeoutMs: 30000 });
    return { ...await read(client), loaded: { guid: preset.guid, target: targetRegion } };
  }
  if (request.action === 'preset-save') {
    const name = presetName(request.name), scene = choice(request.scene, [2, 4], 'preset source');
    const ids = Array.isArray(request.screenIds) ? request.screenIds : [];
    const requested = ids.map(id => state.screens.find(s => s.id === id));
    if (!requested.length || requested.some(s => !s)) throw fail('Choose the screens to save.');
    // The device rejects presets naming a screen with enable 0 ("check screen faild: screen N is not
    // enabled", code 8210). PixelFlow never offers such screens; skip them (WO-018).
    const screens = requested.filter(s => s.enabled), skipped = requested.filter(s => !s.enabled).map(s => s.name);
    if (!screens.length) throw fail(`${skipped.join(', ')} ${skipped.length > 1 ? 'are' : 'is'} disabled on the device, so no preset can be saved from ${skipped.length > 1 ? 'them' : 'it'}. Show an enabled screen.`, 409);
    const raw = (await client.call('layers/list-detail')).data?.list || [];
    const payload = screens.map(screen => ({ guid: screen.guid, layers: raw
      .filter(l => l.layerIdObj?.attachScreenId === screen.id && l.layerIdObj.sceneType === scene && l.serial != null)
      .map(l => ({ serial: l.serial, type: l.layerIdObj.type })) }));
    const used = new Set(presets.map(p => p.serial)); let serial = 1; while (used.has(serial)) serial++;
    await client.call('preset/create', { serial, name, loadType: 1, type: 1, sourceRegion: scene,
      switchEffect: { time: 0, type: 0 }, params: ['3'], screens: payload, interfaces: [] }, { method: 'POST', timeoutMs: 30000 });
    const saved = await verified(() => read(client), next => next.presets?.some(p => p.serial === serial && p.name === name), 'the new preset');
    return skipped.length ? { ...saved, skipped } : saved;
  }
  if (request.action === 'preset-rename') {
    const preset = find(), name = presetName(request.name);
    await client.call('preset/update-name', [{ guid: preset.guid, oldName: preset.name, name }], { method: 'POST' });
    return verified(() => read(client), next => next.presets?.some(p => p.guid === preset.guid && p.name === name), 'the preset name');
  }
  if (request.action === 'preset-delete') {
    const preset = find();
    await client.call('preset/delete', [preset.guid], { method: 'POST' });
    return verified(() => read(client), next => !next.presets?.some(p => p.guid === preset.guid), 'preset deletion');
  }
  throw fail('Unsupported preset action.');
}
