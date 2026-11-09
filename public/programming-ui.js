import { $, el, text, button, input, select, field, panelHeader, sessionPath, setDisabled } from './ui.js';
import { dragWindow } from './editor.js';

export function createProgrammingUI({ api, notice, operation, getSession, invalidate }) {
  const root = $('programming-content');
  let state, session, screenId, selectedId, sourceKey, busy = false, drag, targetScene = 4, refreshTimer, durationMs = 500, shouldSwap = true;
  const screen = () => state?.screens.find(s => s.id === screenId);
  const layer = () => state?.layers.find(l => l.id === selectedId && l.screenId === screenId);
  const source = () => state?.sources.find(s => `${s.type}:${s.id}` === sourceKey);
  function adopt(next) {
    state = next; session = next.session;
    screenId = next.screens.some(s => s.id === screenId) ? screenId : next.screens[0]?.id;
    selectedId = next.layers.some(l => l.id === selectedId && l.screenId === screenId) ? selectedId : next.layers.find(l => l.screenId === screenId)?.id;
    sourceKey ||= next.sources.find(s => s.type === 2) ? `2:${next.sources.find(s => s.type === 2).id}` : undefined;
    render();
  }
  async function refresh() {
    if (!getSession()) return;
    await operation(async () => adopt(await api(sessionPath('programming', getSession()))));
  }
  async function command(request, success = 'Programming updated.') {
    await operation(async () => {
      adopt(await api('programming', { session, screenId, ...request }, 'PUT'));
      invalidate('programming'); notice(success, 'success');
      if (['take', 'cut'].includes(request.action)) {
        const epoch = session;
        const update = async (attempt = 0) => {
          if (session !== epoch) return;
          const editing = () => root.contains(document.activeElement) && document.activeElement.matches('input,select,textarea');
          if (busy || drag || editing()) { if (attempt < 30) refreshTimer = setTimeout(() => update(attempt + 1), 150); return; }
          try {
            const next = await api(sessionPath('programming', epoch));
            if (session === epoch && !drag && !editing()) adopt(next);
          } catch (error) { if (!$('programming-panel').hidden) notice(error.message, 'error'); }
        };
        clearTimeout(refreshTimer); refreshTimer = setTimeout(update, request.action === 'take' ? (request.time || 500) + 150 : 150);
      }
    });
    paintStages(); renderInspector(); setDisabled(root, busy);
  }
  function createLayer() {
    const selectedSource = source(); if (!selectedSource || !screen()) { notice('Choose a source first.'); return; }
    command({ action: 'create', scene: targetScene, source: { id: selectedSource.id, type: selectedSource.type }, name: 'Layer' }, 'Layer created.');
  }
  function paintStages() {
    const s = screen(); if (!s) return;
    for (const scene of [2, 4]) {
      const stage = $(`program-stage-${scene}`); if (!stage) continue;
      stage.style.aspectRatio = `${s.width}/${s.height}`; stage.replaceChildren();
      const visible = state.layers.filter(l => l.screenId === s.id && l.scene === scene).sort((a, b) => a.zorder - b.zorder);
      for (const [index, l] of visible.entries()) {
        const node = el('div', { className: `program-layer${l.id === selectedId ? ' selected' : ''}`, 'data-id': l.id });
        Object.assign(node.style, { left: `${100 * l.window.x / s.width}%`, top: `${100 * l.window.y / s.height}%`,
          width: `${100 * l.window.width / s.width}%`, height: `${100 * l.window.height / s.height}%`, zIndex: index + 1, opacity: l.enabled ? '1' : '.5' });
        node.append(el('span', { className: 'window-title' }, l.name), text(l.sourceName || `Source ${l.sourceId}`));
        if (l.id === selectedId) for (const corner of ['nw', 'ne', 'sw', 'se']) node.append(el('span', { className: `handle ${corner}`, 'data-handle': corner }));
        stage.append(node);
      }
    }
  }
  function render() {
    root.replaceChildren(); if (!state) { root.append(text('Connect a device to program screens.')); return; }
    const heading = panelHeader('Programming', refresh);
    const screens = select(state.screens.map(s => [s.id, s.name]), screenId, 'Programming screen');
    screens.onchange = () => { screenId = Number(screens.value); selectedId = undefined; render(); };
    heading.append(screens); root.append(heading);
    const s = screen(); if (!s) { root.append(text('Create or map a screen in Screens first.')); return; }
    const controls = el('div', { className: 'studio-bulk' });
    const duration = input(durationMs, 'Transition duration ms', 'number'); duration.min = 0; duration.max = 10000;
    duration.onchange = () => { durationMs = Number(duration.value); };
    const swap = select([[1, 'Swap PGM/PVW'], [0, 'Copy PVW to PGM']], shouldSwap ? 1 : 0, 'Transition mode');
    swap.onchange = () => { shouldSwap = swap.value === '1'; };
    controls.append(field('Transition', duration), swap,
      button('Take', () => command({ action: 'take', time: Number(duration.value), swap: swap.value === '1' }, 'Take sent.'), 'button primary'),
      button('Cut', () => command({ action: 'cut', swap: swap.value === '1' }, 'Cut sent.'), 'button secondary'));
    root.append(controls);
    const workspace = el('div', { className: 'program-workspace' }), sources = el('aside', { className: 'program-sources' });
    sources.append(el('h2', {}, 'Sources'));
    const target = select([[4, 'Add to PVW'], [2, 'Add to PGM']], targetScene, 'New layer target'); target.onchange = () => { targetScene = Number(target.value); };
    sources.append(target, button('Add layer', createLayer));
    const search = input('', 'Filter programming sources'); search.placeholder = 'Filter sources'; sources.append(search);
    const list = el('div', { className: 'source-list' });
    for (const item of state.sources.filter(item => item.type === 2 || item.id !== s.id)) {
      const key = `${item.type}:${item.id}`, row = button(item.name, () => {
        sourceKey = key; for (const child of list.children) child.classList.toggle('selected', child.dataset.key === sourceKey);
      }, `button source-choice${sourceKey === key ? ' selected' : ''}`);
      row.dataset.key = key;
      row.dataset.search = item.name.toLowerCase(); row.ondblclick = () => { sourceKey = key; createLayer(); };
      row.append(text(`${item.width || '?'} × ${item.height || '?'}${item.type === 2 && !item.connected ? ' · No signal' : ''}`)); list.append(row);
    }
    search.oninput = () => { for (const row of list.children) row.hidden = !row.dataset.search.includes(search.value.toLowerCase()); };
    sources.append(list); workspace.append(sources);
    const views = el('section', { className: 'program-views' });
    for (const [scene, label] of [[2, 'PGM'], [4, 'PVW']]) {
      const view = el('div', { className: `program-view ${scene === 2 ? 'pgm' : 'pvw'}` });
      const stage = el('div', { id: `program-stage-${scene}`, className: 'program-stage', tabindex: 0, 'aria-label': `${label} layout` });
      const layerList = el('div', { className: 'program-layer-list' });
      for (const item of state.layers.filter(l => l.screenId === s.id && l.scene === scene).sort((a, b) => b.zorder - a.zorder)) {
        layerList.append(button(`${item.name} · ${item.sourceName || `Source ${item.sourceId}`}`, () => { selectedId = item.id; paintStages(); renderInspector(); }));
      }
      view.append(el('h2', {}, label), stage, layerList); views.append(view);
      stage.onpointerdown = event => {
        if (busy || event.button !== 0) return;
        const target = event.target.closest('.program-layer'); if (!target) return;
        selectedId = Number(target.dataset.id);
        drag = { id: selectedId, before: structuredClone(layer().window), x: event.clientX, y: event.clientY,
          handle: event.target.dataset.handle, rect: stage.getBoundingClientRect(), stage };
        stage.setPointerCapture(event.pointerId); event.preventDefault(); paintStages(); renderInspector();
      };
      stage.onpointermove = event => {
        if (!drag || busy) return;
        layer().window = dragWindow(drag.before, (event.clientX - drag.x) * s.width / drag.rect.width,
          (event.clientY - drag.y) * s.height / drag.rect.height, s, drag.handle);
        paintStages();
      };
      const end = event => {
        if (!drag) return;
        const before = drag.before, edited = layer(), next = structuredClone(edited.window);
        if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        drag = null; edited.window = before;
        if (event.type !== 'pointercancel' && JSON.stringify(before) !== JSON.stringify(next)) command({ action: 'window', id: edited.id, window: next }, 'Layer position saved.');
        else { paintStages(); renderInspector(); }
      };
      stage.onpointerup = end; stage.onpointercancel = end;
    }
    workspace.append(views, el('aside', { id: 'program-properties', className: 'program-properties' })); root.append(workspace);
    paintStages(); renderInspector(); setDisabled(root, busy);
  }
  function renderInspector() {
    const node = $('program-properties'); if (!node) return; node.replaceChildren(el('h2', {}, 'Layer'));
    const l = layer(); if (!l) { node.append(text('Select a layer, or choose a source and Add layer.')); return; }
    node.append(el('strong', {}, l.name), text(l.scene === 2 ? 'PGM' : 'PVW'));
    const sources = state.sources.filter(s => s.type === 2 || s.id !== screenId).map(s => [`${s.type}:${s.id}`, s.name]);
    const current = `${l.sourceType}:${l.sourceId}`; if (!sources.some(([key]) => key === current)) sources.unshift([current, l.sourceName || 'Current source']);
    const routing = select(sources, current, 'Selected layer source');
    routing.onchange = () => { const [type, id] = routing.value.split(':').map(Number); command({ action: 'source', id: l.id, source: { id, type } }, 'Layer source saved.'); };
    node.append(field('Source', routing));
    const geometry = el('div', { className: 'field-grid' });
    for (const [key, label] of [['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height']]) {
      const control = input(l.window[key], `Layer ${label}`, 'number'); control.min = key === 'x' || key === 'y' ? 0 : 64;
      control.onchange = () => command({ action: 'window', id: l.id, window: { ...l.window, [key]: Number(control.value) } }, 'Layer position saved.');
      geometry.append(field(label, control));
    }
    node.append(geometry, button('Bring to front', () => command({ action: 'zorder', id: l.id, to: 3 })),
      button('Send to back', () => command({ action: 'zorder', id: l.id, to: 4 })),
      button('Delete layer', () => command({ action: 'delete', id: l.id }, 'Layer deleted.'), 'button danger'), text(`Layer ${l.id}`));
  }
  render();
  return { open: () => state ? undefined : refresh(), refresh, hasChanges: () => Boolean(drag),
    reset(next) { if (session === next) return; clearTimeout(refreshTimer); session = next; state = undefined; drag = undefined; render(); },
    setBusy(value) { busy = value; setDisabled(root, busy); } };
}
