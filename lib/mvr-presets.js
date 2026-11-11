import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from './pixelhue.js';
import { name as validName } from './studio-common.js';
import { dataDir } from './group-sources.js';

// MVR presets (WO-040): window geometry and aspect locks kept in the app's own data folder per device serial
// ($PIXELHUE_STUDIO_DATA or ~/.pixelhue-studio), never in the repo. A preset is the same document as a layout file
// (public/editor.js readLayout), so recalling one goes through the same checks and the normal MVR autosave.
const LIMIT = 64, file = () => join(dataDir(), 'mvr-presets.json');
async function load() { try { const all = JSON.parse(await readFile(file(), 'utf8')); return all && typeof all === 'object' && !Array.isArray(all) ? all : {}; } catch { return {}; } }
async function save(all) {
  await mkdir(dataDir(), { recursive: true });
  const temp = `${file()}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(all, null, 2)); await rename(temp, file());
}
const int = value => Number.isSafeInteger(value);
function layoutDocument(document, client, state) {
  if (document?.format !== 'pixelhue-mvr-layout' || document.version !== 1 || !Array.isArray(document.windows)) throw fail('Supply an MVR layout to store.');
  if (document.serial !== client.serial) throw fail('This layout belongs to another device.', 409);
  const screen = state.screens.find(s => s.id === document.screenId);
  if (!screen || document.width !== screen.width || document.height !== screen.height) throw fail('MVR output changed. Refresh before saving a preset.', 409);
  const current = state.layers.filter(l => l.screenId === screen.id), seen = new Set();
  if (!document.windows.length || document.windows.length > 128 || document.windows.length !== current.length) throw fail('MVR windows changed. Refresh before saving a preset.', 409);
  const windows = document.windows.map(item => {
    const w = item?.window;
    if (!item || seen.has(item.id) || !current.some(l => l.id === item.id) || !['x', 'y', 'width', 'height'].every(key => int(w?.[key])) || w.x < 0 || w.y < 0 || w.width < 64 || w.height < 64 || w.x + w.width > screen.width || w.y + w.height > screen.height) throw fail('The layout contains an unknown window or invalid geometry.');
    seen.add(item.id);
    if (item.aspectLock != null && !(typeof item.aspectLock === 'number' && Number.isFinite(item.aspectLock) && item.aspectLock >= 1 / 256 && item.aspectLock <= 256)) throw fail('The layout contains an invalid aspect lock.');
    return { id: item.id, window: { x: w.x, y: w.y, width: w.width, height: w.height }, aspectLock: item.aspectLock ?? null, aspectMode: [5, 8].includes(item.aspectMode) ? item.aspectMode : 5,
      ...(int(item.umdHeight) ? { umdHeight: item.umdHeight } : {}) };
  });
  return { format: 'pixelhue-mvr-layout', version: 1, serial: client.serial, screenId: screen.id, width: screen.width, height: screen.height, windows };
}
const listed = (client, all) => ({ session: client.session, presets: (all[client.serial] || []).map(p => ({ id: p.id, name: p.name, screenId: p.document.screenId, windows: p.document.windows.length, savedAt: p.savedAt, document: p.document })) });
export async function readMvrPresets(client) { return listed(client, await load()); }
export async function applyMvrPresets(client, body) {
  const all = await load(), list = all[client.serial] || [], find = () => { const index = list.findIndex(p => p.id === body.id); if (index < 0) throw fail('MVR preset not found. Refresh.', 404); return index; };
  if (body.action === 'save') {
    const name = validName(typeof body.name === 'string' ? body.name.trim() : body.name, 'Preset name'), document = layoutDocument(body.document, client, await client.read());
    // Same name on the same output overwrites, so "save again" needs no delete first.
    const existing = list.findIndex(p => p.name === name && p.document.screenId === document.screenId);
    if (existing < 0 && list.length >= LIMIT) throw fail(`At most ${LIMIT} MVR presets are kept per device. Delete one first.`);
    const preset = { id: existing < 0 ? randomUUID() : list[existing].id, name, savedAt: new Date().toISOString(), document };
    if (existing < 0) list.push(preset); else list[existing] = preset;
    all[client.serial] = list; await save(all); return { ...listed(client, all), saved: preset.id, overwritten: existing >= 0 };
  }
  if (body.action === 'rename') {
    const index = find(), name = validName(typeof body.name === 'string' ? body.name.trim() : body.name, 'Preset name');
    if (list.some((p, i) => i !== index && p.name === name && p.document.screenId === list[index].document.screenId)) throw fail('An MVR preset with this name already exists.', 409);
    list[index] = { ...list[index], name }; all[client.serial] = list; await save(all); return listed(client, all);
  }
  if (body.action === 'delete') { list.splice(find(), 1); all[client.serial] = list; await save(all); return listed(client, all); }
  throw fail('Unsupported MVR preset action.');
}
