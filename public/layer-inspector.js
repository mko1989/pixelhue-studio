import { el, text, button, input, select, field } from './ui.js';

// Selected-layer panel (WO-024), PixelFlow parity for position/size: X/Y/W/H with aspect lock, aspect
// presets (layer_2.xml AspectRatioType), align to screen, fill screen / fill output / native 1:1, stacking,
// and per-layer KeyFrame (enable, curve, start, duration as % of the take).
export const ASPECTS = [[8, 'Source'], [3, '16:9'], [4, '16:10'], [1, '4:3'], [2, '3:2'], [7, '5:4'], [0, '1:1'], [5, 'Custom']];
const RATIOS = { 0: 1, 1: 4 / 3, 2: 3 / 2, 3: 16 / 9, 4: 16 / 10, 7: 5 / 4 };
const CURVES = [[3, 'Linear'], [0, 'S-curve'], [1, 'Logarithmic'], [2, 'Exponential']];

export function alignWindow(w, screen, where) {
  const x = { left: 0, hcenter: Math.round((screen.width - w.width) / 2), right: screen.width - w.width }[where];
  const y = { top: 0, vcenter: Math.round((screen.height - w.height) / 2), bottom: screen.height - w.height }[where];
  if (where === 'center') return { ...w, x: Math.round((screen.width - w.width) / 2), y: Math.round((screen.height - w.height) / 2) };
  return { ...w, ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) };
}

// Output tile (screen-local) under the layer centre, else the first tile; null when the screen has none.
export function outputTile(w, screen) {
  const tiles = (screen.outputs || []).map(o => ({ x: o.pos.x - screen.x, y: o.pos.y - screen.y, width: o.pos.width, height: o.pos.height }));
  const cx = w.x + w.width / 2, cy = w.y + w.height / 2;
  return tiles.find(t => cx >= t.x && cx < t.x + t.width && cy >= t.y && cy < t.y + t.height) || tiles[0] || null;
}

export function nativeWindow(w, source) {
  if (!source?.width || !source?.height) return null;
  return { x: Math.round(w.x + w.width / 2 - source.width / 2), y: Math.round(w.y + w.height / 2 - source.height / 2), width: source.width, height: source.height };
}

export function renderLayerPanel(node, { state, layer: l, screen, command }) {
  const save = (window, message = 'Layer position saved.') => command({ action: 'window', screenId: l.screenId, id: l.id, window }, message);
  const source = state.sources.find(s => s.type === l.sourceType && s.id === l.sourceId);
  const options = state.sources.filter(s => s.type === 2 || s.id !== l.screenId).map(s => [`${s.type}:${s.id}`, s.name]);
  const current = `${l.sourceType}:${l.sourceId}`; if (!options.some(([key]) => key === current)) options.unshift([current, l.sourceName || 'Current source']);
  const routing = select(options, current, 'Selected layer source');
  routing.onchange = () => { const [type, id] = routing.value.split(':').map(Number); command({ action: 'source', screenId: l.screenId, id: l.id, source: { id, type } }, 'Layer source saved.'); };
  node.append(field('Source', routing));

  const pos = el('section', { className: 'inspector-section' }); pos.append(el('h3', {}, 'Position & size'));
  const geometry = el('div', { className: 'field-grid' }), ratio = l.window.width / l.window.height;
  for (const [key, label] of [['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height']]) {
    const control = input(l.window[key], `Layer ${label}`, 'number'); if (key === 'width' || key === 'height') control.min = 64;
    control.onchange = () => {
      const next = { ...l.window, [key]: Number(control.value) };
      if (l.aspectLocked && key === 'width') next.height = Math.max(64, Math.round(next.width / ratio));
      if (l.aspectLocked && key === 'height') next.width = Math.max(64, Math.round(next.height * ratio));
      save(next);
    };
    geometry.append(field(label, control));
  }
  const keep = input('', 'Keep aspect ratio', 'checkbox'); keep.checked = Boolean(l.aspectLocked);
  keep.onchange = () => command({ action: 'aspect', screenId: l.screenId, id: l.id, locked: keep.checked }, keep.checked ? 'Aspect ratio locked to the source.' : 'Aspect ratio unlocked.');
  const keepLabel = el('label', { className: 'checkbox-label' }); keepLabel.append(keep, document.createTextNode(' Keep aspect ratio'));
  const aspect = select(ASPECTS, l.aspectMode, 'Layer aspect ratio');
  aspect.onchange = () => {
    const mode = Number(aspect.value), r = RATIOS[mode];
    command({ action: 'aspect', screenId: l.screenId, id: l.id, mode, locked: mode !== 5 || l.aspectLocked,
      ...(r ? { window: { ...l.window, height: Math.max(64, Math.round(l.window.width / r)) } } : {}) }, `Aspect ratio set to ${aspect.selectedOptions[0].text}.`);
  };
  pos.append(geometry, field('Aspect ratio', aspect), keepLabel);
  const align = el('div', { className: 'align-grid', role: 'group', 'aria-label': 'Align to screen' });
  for (const [where, label] of [['left', 'Left'], ['hcenter', 'Centre H'], ['right', 'Right'], ['top', 'Top'], ['vcenter', 'Centre V'], ['bottom', 'Bottom'], ['center', 'Centre']]) {
    align.append(button(label, () => save(alignWindow(l.window, screen, where), `Layer aligned ${label.toLowerCase()}.`), 'button secondary'));
  }
  const tile = outputTile(l.window, screen), native = nativeWindow(l.window, source);
  const fills = el('div', { className: 'align-grid' });
  fills.append(button('Fill screen', () => save({ x: 0, y: 0, width: screen.width, height: screen.height }, 'Layer fills the screen.')),
    button('Fill output', () => tile && save(tile, 'Layer fills its output.')), button('Native 1:1', () => native && save(native, 'Layer set to the source resolution.')));
  if (!tile) fills.children[1].dataset.fixed = 'true';
  if (!native) { fills.children[2].dataset.fixed = 'true'; fills.children[2].title = 'The source has no signal resolution.'; }
  pos.append(el('span', { className: 'muted' }, 'Align to screen'), align, fills);

  const kf = l.keyFrame, frames = el('section', { className: 'inspector-section' }); frames.append(el('h3', {}, 'KeyFrame'));
  const kfSave = (changes, message) => command({ action: 'keyframe', screenId: l.screenId, id: l.id, keyFrame: changes }, message);
  const enable = input('', 'Layer keyframe', 'checkbox'); enable.checked = kf.enable === 1;
  enable.onchange = () => kfSave({ enable: enable.checked ? 1 : 0 }, enable.checked ? 'KeyFrame on: the layer animates on Take.' : 'KeyFrame off.');
  const enableLabel = el('label', { className: 'checkbox-label' }); enableLabel.append(enable, document.createTextNode(' Animate on Take'));
  const curve = select(CURVES, kf.speedType, 'KeyFrame curve'); curve.onchange = () => kfSave({ speedType: Number(curve.value) }, 'KeyFrame curve saved.');
  const start = input(kf.startTime / 10, 'KeyFrame start percent', 'number'); start.min = 0; start.max = 99.9; start.step = 0.1;
  start.onchange = () => kfSave({ startTime: Math.round(Number(start.value) * 10) }, 'KeyFrame start saved.');
  const length = input(kf.animationTime / 10, 'KeyFrame duration percent', 'number'); length.min = 0.1; length.max = 100; length.step = 0.1;
  length.onchange = () => kfSave({ animationTime: Math.round(Number(length.value) * 10) }, 'KeyFrame duration saved.');
  const timing = el('div', { className: 'field-grid' }); timing.append(field('Start % of take', start), field('Duration % of take', length));
  frames.append(enableLabel, field('Curve', curve), timing, text('Presets store keyframes when they include KF (absolute presets always do).'));

  const order = el('div', { className: 'align-grid' });
  order.append(button('Bring to front', () => command({ action: 'zorder', screenId: l.screenId, id: l.id, to: 3 })),
    button('Send to back', () => command({ action: 'zorder', screenId: l.screenId, id: l.id, to: 4 })),
    button('Delete layer', () => command({ action: 'delete', screenId: l.screenId, id: l.id }, 'Layer deleted.'), 'button danger'));
  node.append(pos, frames, order);
}
