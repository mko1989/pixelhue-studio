import { el, text, button, input, select, field } from './ui.js';

// Screens tab: test pattern and colour for the selected screen (WO-037). Applies on change.
const isLine = type => type >= 512 && type <= 517, isGrid = type => (type >= 5 && type <= 7) || (type >= 256 && type <= 263);
let open = false;
export function renderScreenExtras(screen, options, command) {
  const limits = options?.[screen.type]; if (!limits || (!limits.pattern && !limits.quality.length)) return null;
  const box = el('details', { className: 'screen-extras' }); box.open = open || Boolean(screen.pattern?.enable); box.ontoggle = () => { open = box.open; };
  const summary = el('summary', {}, 'Test pattern and colour'); if (screen.pattern?.enable) summary.append(el('span', { className: 'fx-on' }, 'pattern on')); box.append(summary);
  if (limits.pattern && screen.pattern) {
    const p = screen.pattern, row = el('div', { className: 'studio-bulk' }), set = pattern => command({ action: 'pattern', id: screen.id, pattern }, true);
    const type = select([['off', 'Off'], ...limits.pattern.types], p.enable ? p.type : 'off', 'Screen test pattern');
    type.onchange = () => set(type.value === 'off' ? { enable: false } : { enable: true, type: Number(type.value) });
    const bright = select(limits.pattern.bright.map(v => [v, `${v * 25}%`]), p.bright, 'Pattern brightness'); bright.onchange = () => set({ bright: Number(bright.value) });
    row.append(field('Pattern', type), field('Brightness', bright));
    if (isGrid(p.type)) { const gear = select(limits.pattern.gear.map(v => [v, `${Math.round(2048 / 2 ** v)} px`]), p.grid, 'Pattern spacing'); gear.onchange = () => set({ grid: Number(gear.value) }); row.append(field('Spacing', gear)); }
    if (isLine(p.type)) {
      const number = (label, value, min, max, key) => { const control = input(value, label, 'number'); control.min = min; control.max = max;
        control.onchange = () => { const next = Number(control.value); if (Number.isInteger(next) && next >= min && next <= max) set({ [key]: next }); else control.value = value; }; return control; };
      const speed = select(limits.pattern.speed.map(v => [v, v ? `Speed ${v}` : 'Still']), p.speed, 'Pattern motion'); speed.onchange = () => set({ speed: Number(speed.value) });
      row.append(field('Spacing px', number('Pattern spacing', p.grid, limits.pattern.pixel.min, limits.pattern.pixel.max, 'grid')),
        field('Line px', number('Pattern line width', p.lineWidth, limits.pattern.line.min, limits.pattern.line.max, 'lineWidth')), field('Motion', speed));
    }
    box.append(row);
  }
  if (limits.quality.length && screen.quality) {
    const q = screen.quality, row = el('div', { className: 'studio-bulk' }), set = quality => command({ action: 'quality', id: screen.id, quality }, true);
    for (const [key, label, min, max] of [['brightness', 'Brightness', 0, 200], ['contrast', 'Contrast', 0, 200], ['saturation', 'Saturation', 0, 200], ['hue', 'Hue °', -180, 180]]) {
      if (!limits.quality.includes(key)) continue;
      const control = input(q[key], `Screen ${label}`, 'number'); control.min = min; control.max = max;
      control.onchange = () => { const next = Number(control.value); if (Number.isInteger(next) && next >= min && next <= max) set({ [key]: next }); else control.value = q[key]; };
      row.append(field(label, control));
    }
    const defaults = Object.fromEntries([['brightness', 100], ['contrast', 100], ['saturation', 100], ['hue', 0]].filter(([key]) => limits.quality.includes(key)));
    row.append(button('Reset colour', () => set(defaults), 'button quiet')); box.append(row);
  }
  box.append(text('Applies to the whole screen output, on top of layer and output settings.'));
  return box;
}
