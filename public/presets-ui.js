import { el, text, button } from './ui.js';

// Preset bank under the PGM/PVW bands (WO-016). Click loads; Edit reveals rename/delete.
// ctx: { presets, region, setRegion(r), editing, setEditing(v), command(request, message), screenIds() }
export function renderPresets(ctx) {
  const bar = el('section', { className: 'preset-bar', 'aria-label': 'Presets' });
  const head = el('div', { className: 'preset-head' }); head.append(el('h2', {}, 'Presets'));
  if (!ctx.presets) { bar.append(head, text('Presets are unavailable on this device.')); return bar; }
  const region = el('div', { className: 'segmented', role: 'group', 'aria-label': 'Preset target' });
  for (const [value, label] of [[4, 'PVW'], [2, 'PGM']]) {
    const b = button(label, () => ctx.setRegion(value), `button segment${ctx.region === value ? ' active' : ''}`);
    b.setAttribute('aria-pressed', String(ctx.region === value)); region.append(b);
  }
  const regionName = ctx.region === 2 ? 'PGM' : 'PVW';
  head.append(region, button(`Save ${regionName} as preset…`, () => {
    const ids = ctx.screenIds(); if (!ids.length) return;
    const name = window.prompt(`Preset name (saves ${regionName} of the shown screens):`, `Preset ${ctx.presets.length + 1}`);
    if (name?.trim()) ctx.command({ action: 'preset-save', name: name.trim(), scene: ctx.region, screenIds: ids }, 'Preset saved.');
  }), button(ctx.editing ? 'Done' : 'Edit', () => ctx.setEditing(!ctx.editing), 'button quiet'));
  const list = el('div', { className: 'preset-list' });
  if (!ctx.presets.length) list.append(text('No presets yet. Build a look in PVW and save it.'));
  for (const preset of ctx.presets) {
    const item = el('div', { className: 'preset-item' });
    const load = button(`${preset.serial}. ${preset.name}`, () => ctx.command({ action: 'preset-load', guid: preset.guid, target: ctx.region }, `${preset.name} loaded to ${regionName}.`), 'button preset-load');
    load.title = `Load to ${regionName}${preset.screens.length ? ` · ${preset.screens.join(', ')}` : ''}`;
    item.append(load);
    if (ctx.editing) item.append(
      button('Rename', () => { const name = window.prompt('Rename preset:', preset.name); if (name?.trim() && name.trim() !== preset.name) ctx.command({ action: 'preset-rename', guid: preset.guid, name: name.trim() }, 'Preset renamed.'); }, 'button quiet'),
      button('Delete', () => { if (window.confirm(`Delete preset ${preset.name}?`)) ctx.command({ action: 'preset-delete', guid: preset.guid }, 'Preset deleted.'); }, 'button danger'));
    list.append(item);
  }
  bar.append(head, list);
  return bar;
}
