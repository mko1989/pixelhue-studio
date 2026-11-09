import { el, text, button, input, select, field } from './ui.js';

// Preset bank under the PGM/PVW bands (WO-016, reworked WO-022).
// Load and save are independent: a "Load to" target, and separate Save from PVW / Save from PGM
// buttons that open a small form with name + slot (1–128; occupied slots overwrite after confirmation).
// ctx: { presets, loadTarget, setLoadTarget(r), saving (null|2|4), setSaving(v), editing, setEditing(v), command(request, msg), screenIds() }
const SLOTS = 128;
const sceneName = scene => scene === 2 ? 'PGM' : 'PVW';

function saveForm(ctx) {
  const scene = ctx.saving, presets = ctx.presets;
  const free = []; for (let n = 1; n <= SLOTS && free.length < 1; n++) if (!presets.some(p => p.serial === n)) free.push(n);
  const options = [];
  for (let n = 1; n <= SLOTS; n++) {
    const p = presets.find(item => item.serial === n);
    if (p) options.push([n, `${n} · ${p.name} (overwrite)`]);
    else if (n <= Math.max(free[0] ?? 0, ...presets.map(x => x.serial)) + 8) options.push([n, `${n} · empty`]);
  }
  const slot = select(options, free[0] ?? 1, 'Preset slot');
  const name = input(`Preset ${free[0] ?? 1}`, 'Preset name'); name.maxLength = 64;
  slot.onchange = () => { const p = presets.find(item => item.serial === Number(slot.value)); name.value = p ? p.name : `Preset ${slot.value}`; };
  const form = el('form', { className: 'preset-save-form' });
  const submit = () => {
    const serial = Number(slot.value), occupant = presets.find(p => p.serial === serial);
    if (!name.value.trim()) { name.focus(); return; }
    if (occupant && !window.confirm(`Overwrite preset ${serial} · ${occupant.name} with ${sceneName(scene)} of the shown screens?`)) return;
    ctx.setSaving(null);
    ctx.command({ action: 'preset-save', name: name.value.trim(), scene, serial, overwrite: Boolean(occupant), screenIds: ctx.screenIds() },
      occupant ? `Preset ${serial} overwritten from ${sceneName(scene)}.` : `Preset ${serial} saved from ${sceneName(scene)}.`);
  };
  form.onsubmit = event => { event.preventDefault(); submit(); };
  form.append(el('strong', {}, `Save from ${sceneName(scene)}`), field('Slot', slot), field('Name', name),
    button('Save', submit, 'button primary'), button('Cancel', () => ctx.setSaving(null), 'button quiet'));
  setTimeout(() => name.select(), 0);
  return form;
}

export function renderPresets(ctx) {
  const bar = el('section', { className: 'preset-bar', 'aria-label': 'Presets' });
  const head = el('div', { className: 'preset-head' }); head.append(el('h2', {}, 'Presets'));
  if (!ctx.presets) { bar.append(head, text('Presets are unavailable on this device.')); return bar; }
  const target = el('div', { className: 'segmented', role: 'group', 'aria-label': 'Load presets to' });
  target.append(el('span', { className: 'segment-label' }, 'Load to'));
  for (const value of [4, 2]) {
    const b = button(sceneName(value), () => ctx.setLoadTarget(value), `button segment${ctx.loadTarget === value ? ' active' : ''}`);
    b.setAttribute('aria-pressed', String(ctx.loadTarget === value)); target.append(b);
  }
  head.append(target, button('Save from PVW…', () => ctx.setSaving(ctx.saving === 4 ? null : 4)),
    button('Save from PGM…', () => ctx.setSaving(ctx.saving === 2 ? null : 2)),
    button(ctx.editing ? 'Done' : 'Edit', () => ctx.setEditing(!ctx.editing), 'button quiet'));
  bar.append(head);
  if (ctx.saving) bar.append(saveForm(ctx));
  const list = el('div', { className: 'preset-list' });
  if (!ctx.presets.length) list.append(text('No presets yet. Build a look and use Save from PVW or Save from PGM.'));
  const loadName = sceneName(ctx.loadTarget);
  for (const preset of ctx.presets) {
    const item = el('div', { className: 'preset-item' });
    const load = button(`${preset.serial}. ${preset.name}`, () => ctx.command({ action: 'preset-load', guid: preset.guid, target: ctx.loadTarget }, `${preset.name} loaded to ${loadName}.`), 'button preset-load');
    load.title = `Load to ${loadName} · saved from ${sceneName(preset.sourceRegion)}${preset.screens.length ? ` · ${preset.screens.join(', ')}` : ''}`;
    item.append(load);
    if (ctx.editing) item.append(
      button('Rename', () => { const name = window.prompt('Rename preset:', preset.name); if (name?.trim() && name.trim() !== preset.name) ctx.command({ action: 'preset-rename', guid: preset.guid, name: name.trim() }, 'Preset renamed.'); }, 'button quiet'),
      button('Delete', () => { if (window.confirm(`Delete preset ${preset.name}?`)) ctx.command({ action: 'preset-delete', guid: preset.guid }, 'Preset deleted.'); }, 'button danger'));
    list.append(item);
  }
  bar.append(list);
  return bar;
}
