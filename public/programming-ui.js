import { $, el, text, button, input, select, field, sessionPath, setDisabled } from './ui.js';
import { paintStage, bindStage, dropWindow, SOURCE_MIME } from './program-stage.js';
import { renderPresets } from './presets-ui.js';

// Programming (WO-016): several screens at once, PGM band on top and PVW below, drag sources
// onto a stage to create layers, free layer roaming, preset bank.
const STORE = 'program-screens';
export function createProgrammingUI({ api, notice, operation, getSession, invalidate }) {
  const root = $('programming-content');
  let state, session, selectedId, sourceKey, busy = false, refreshTimer, durationMs = 500, shouldSwap = true;
  let shown = null, presetRegion = 4, editingPresets = false; const stages = [];
  try { shown = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
  const visible = () => state.screens.filter(s => shown.includes(s.id));
  const layer = () => state?.layers.find(l => l.id === selectedId);
  const active = () => state.screens.find(s => s.id === layer()?.screenId && shown.includes(s.id)) || visible()[0];
  const sourceFor = key => state?.sources.find(s => `${s.type}:${s.id}` === key);
  const remember = () => { try { localStorage.setItem(STORE, JSON.stringify(shown)); } catch {} };
  function adopt(next) {
    state = next; session = next.session;
    const ids = next.screens.map(s => s.id);
    shown = (shown || []).filter(id => ids.includes(id));
    if (!shown.length) shown = next.screens.filter(s => s.outputs.length).map(s => s.id);
    if (!shown.length) shown = ids.slice(0, 1);
    if (!next.layers.some(l => l.id === selectedId)) selectedId = undefined;
    sourceKey ||= next.sources.find(s => s.type === 2) ? `2:${next.sources.find(s => s.type === 2).id}` : undefined;
    render();
  }
  async function refresh() { if (getSession()) await operation(async () => adopt(await api(sessionPath('programming', getSession())))); }
  const editing = () => root.contains(document.activeElement) && document.activeElement.matches('input,select,textarea');
  function scheduleRefresh(delay) {
    const epoch = session; clearTimeout(refreshTimer);
    const update = async (attempt = 0) => {
      if (session !== epoch) return;
      if (busy || stages.some(s => s.dragging()) || editing()) { if (attempt < 30) refreshTimer = setTimeout(() => update(attempt + 1), 150); return; }
      try { const next = await api(sessionPath('programming', epoch)); if (session === epoch && !stages.some(s => s.dragging()) && !editing()) adopt(next); }
      catch (error) { if (!$('programming-panel').hidden) notice(error.message, 'error'); }
    };
    refreshTimer = setTimeout(update, delay);
  }
  async function command(request, success = 'Programming updated.') {
    await operation(async () => {
      const before = new Set(state.layers.map(l => l.id));
      const next = await api('programming', { session, ...request }, 'PUT');
      if (request.action === 'create') selectedId = next.layers.find(l => !before.has(l.id))?.id ?? selectedId;
      adopt(next); invalidate('programming'); notice(success, 'success');
      if (['take', 'cut'].includes(request.action)) scheduleRefresh(request.action === 'take' ? (request.time || 500) + 150 : 150);
      if (request.action === 'preset-load') scheduleRefresh(600);
    });
    setDisabled(root, busy);
  }
  function addLayer(key, screen, scene, point) {
    const source = sourceFor(key); if (!source || !screen) { notice('Choose a source first.'); return; }
    if ([3, 4].includes(source.type) && source.id === screen.id) { notice('A screen cannot show its own PGM/PVW.', 'error'); return; }
    const window = dropWindow(source, screen, point || { x: screen.width / 2, y: screen.height / 2 });
    command({ action: 'create', screenId: screen.id, scene, source: { id: source.id, type: source.type }, window, name: 'Layer' }, 'Layer created.');
  }
  function paintAll() {
    for (const node of root.querySelectorAll('.program-stage')) {
      const screen = state.screens.find(s => s.id === Number(node.dataset.screen)), scene = Number(node.dataset.scene);
      paintStage(node, screen, state.layers.filter(l => l.screenId === screen.id && l.scene === scene), selectedId);
    }
  }
  function band(scene, label) {
    const wrap = el('section', { className: `program-band ${scene === 2 ? 'pgm' : 'pvw'}` });
    wrap.append(el('h2', {}, label));
    const row = el('div', { className: 'program-band-row' }), screens = visible();
    // Cells flex by pixel width so all screens share one scale; the row is capped so the
    // tallest stage leaves room for both bands (stage height = rowWidth * height / totalWidth).
    const total = screens.reduce((sum, s) => sum + s.width, 0), tallest = Math.max(...screens.map(s => s.height));
    row.style.maxWidth = `max(320px, calc((100dvh - 330px) / 2 * ${(total / tallest).toFixed(5)}))`;
    for (const screen of screens) {
      const cell = el('div', { className: 'program-cell' }); cell.style.flex = `${screen.width} 1 0`;
      const stage = el('div', { className: 'program-stage', tabindex: 0, 'data-screen': screen.id, 'data-scene': scene, 'aria-label': `${screen.name} ${label}` });
      stage.style.aspectRatio = `${screen.width}/${screen.height}`;
      cell.append(el('div', { className: 'program-cell-head' }, `${screen.name} · ${screen.width} × ${screen.height}`), stage); row.append(cell);
      stages.push(bindStage(stage, screen, {
        layers: () => state.layers.filter(l => l.screenId === screen.id && l.scene === scene),
        select: id => { selectedId = id; paintAll(); renderInspector(); }, busy: () => busy, repaint: paintAll,
        commit: (l, window) => command({ action: 'window', screenId: screen.id, id: l.id, window }, 'Layer position saved.'),
        drop: (key, point) => addLayer(key, screen, scene, point),
      }));
    }
    wrap.append(row); return wrap;
  }
  function render() {
    root.replaceChildren(); stages.length = 0;
    if (!state) { root.append(text('Connect a device to program screens.')); return; }
    const bar = el('div', { className: 'program-toolbar' }), chips = el('div', { className: 'screen-chips', role: 'group', 'aria-label': 'Shown screens' });
    for (const s of state.screens) {
      const on = shown.includes(s.id);
      const chip = button(s.name, () => {
        shown = on ? shown.filter(id => id !== s.id) : [...shown, s.id];
        if (!shown.length) shown = [s.id];
        shown.sort((a, b) => state.screens.findIndex(x => x.id === a) - state.screens.findIndex(x => x.id === b)); remember(); render();
      }, `button chip${on ? ' active' : ''}`);
      chip.setAttribute('aria-pressed', String(on)); chips.append(chip);
    }
    const duration = input(durationMs, 'Transition duration ms', 'number'); duration.min = 0; duration.max = 10000;
    duration.onchange = () => { durationMs = Number(duration.value); };
    const swap = select([[1, 'Swap'], [0, 'Copy']], shouldSwap ? 1 : 0, 'Transition mode'); swap.onchange = () => { shouldSwap = swap.value === '1'; };
    const ids = () => visible().map(s => s.id);
    bar.append(chips, el('span', { className: 'toolbar-spacer' }), field('ms', duration), swap,
      button('Cut', () => command({ action: 'cut', screenIds: ids(), swap: shouldSwap }, 'Cut sent.')),
      button('Take', () => command({ action: 'take', screenIds: ids(), time: Number(duration.value), swap: shouldSwap }, 'Take sent.'), 'button primary take'),
      button('Refresh', refresh, 'button quiet'));
    root.append(bar);
    if (!state.screens.length) { root.append(text('Create or map a screen in Screens first.')); return; }
    const workspace = el('div', { className: 'program-workspace' }), sources = el('aside', { className: 'program-sources' });
    const search = input('', 'Filter programming sources'); search.placeholder = 'Filter sources';
    sources.append(el('h2', {}, 'Sources'), text('Drag onto PGM or PVW · double-click adds to PVW'), search);
    const list = el('div', { className: 'source-list' });
    for (const item of state.sources) {
      const key = `${item.type}:${item.id}`;
      const row = button(item.name, () => { sourceKey = key; for (const c of list.children) c.classList.toggle('selected', c.dataset.key === key); }, `button source-choice${sourceKey === key ? ' selected' : ''}`);
      Object.assign(row.dataset, { key, search: item.name.toLowerCase() }); row.draggable = true;
      row.ondragstart = event => { sourceKey = key; event.dataTransfer.setData(SOURCE_MIME, key); event.dataTransfer.effectAllowed = 'copy'; };
      row.ondblclick = () => { sourceKey = key; addLayer(key, active(), 4); };
      row.append(text(`${item.width || '?'} × ${item.height || '?'}${item.type === 2 && !item.connected ? ' · No signal' : ''}`)); list.append(row);
    }
    search.oninput = () => { for (const row of list.children) row.hidden = !row.dataset.search.includes(search.value.toLowerCase()); };
    sources.append(list);
    const views = el('section', { className: 'program-views' });
    views.append(band(2, 'PGM'), band(4, 'PVW'), renderPresets({ presets: state.presets, region: presetRegion, editing: editingPresets,
      setRegion: r => { presetRegion = r; render(); }, setEditing: v => { editingPresets = v; render(); }, command, screenIds: ids }));
    workspace.append(sources, views, el('aside', { id: 'program-properties', className: 'program-properties' })); root.append(workspace);
    paintAll(); renderInspector(); setDisabled(root, busy);
  }
  function renderInspector() {
    const node = $('program-properties'); if (!node) return; node.replaceChildren(el('h2', {}, 'Layer'));
    const l = layer(), screen = l && state.screens.find(s => s.id === l.screenId);
    if (!l) node.append(text('Click a layer, or drag a source onto PGM or PVW.'));
    else {
      node.append(el('strong', {}, l.name), text(`${screen.name} · ${l.scene === 2 ? 'PGM' : 'PVW'}`));
      const options = state.sources.filter(s => s.type === 2 || s.id !== l.screenId).map(s => [`${s.type}:${s.id}`, s.name]);
      const current = `${l.sourceType}:${l.sourceId}`; if (!options.some(([key]) => key === current)) options.unshift([current, l.sourceName || 'Current source']);
      const routing = select(options, current, 'Selected layer source');
      routing.onchange = () => { const [type, id] = routing.value.split(':').map(Number); command({ action: 'source', screenId: l.screenId, id: l.id, source: { id, type } }, 'Layer source saved.'); };
      const geometry = el('div', { className: 'field-grid' });
      for (const [key, label] of [['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height']]) {
        const control = input(l.window[key], `Layer ${label}`, 'number'); if (key === 'width' || key === 'height') control.min = 64;
        control.onchange = () => command({ action: 'window', screenId: l.screenId, id: l.id, window: { ...l.window, [key]: Number(control.value) } }, 'Layer position saved.');
        geometry.append(field(label, control));
      }
      const fill = button('Fill screen', () => command({ action: 'window', screenId: l.screenId, id: l.id, window: { x: 0, y: 0, width: screen.width, height: screen.height } }, 'Layer position saved.'));
      node.append(field('Source', routing), geometry, fill,
        button('Bring to front', () => command({ action: 'zorder', screenId: l.screenId, id: l.id, to: 3 })),
        button('Send to back', () => command({ action: 'zorder', screenId: l.screenId, id: l.id, to: 4 })),
        button('Delete layer', () => command({ action: 'delete', screenId: l.screenId, id: l.id }, 'Layer deleted.'), 'button danger'));
    }
    const s = active(); if (!s) return;
    const list = el('div', { className: 'program-layer-list' }); list.append(el('h2', {}, `${s.name} layers`));
    for (const scene of [2, 4]) for (const item of state.layers.filter(x => x.screenId === s.id && x.scene === scene).sort((a, b) => b.zorder - a.zorder)) {
      list.append(button(`${scene === 2 ? 'PGM' : 'PVW'} · ${item.name} · ${item.sourceName || `Source ${item.sourceId}`}`,
        () => { selectedId = item.id; paintAll(); renderInspector(); }, `button${item.id === selectedId ? ' selected' : ''}`));
    }
    node.append(list); setDisabled(node, busy);
  }
  render();
  return { open: () => state ? undefined : refresh(), refresh, hasChanges: () => stages.some(s => s.dragging()),
    reset(next) { if (session === next) return; clearTimeout(refreshTimer); session = next; state = undefined; render(); },
    setBusy(value) { busy = value; setDisabled(root, busy); } };
}
