import { el, text } from './ui.js';

// Program-layer stages (WO-016): layers roam freely like PixelFlow (device X/Y ±500000),
// snap to screen edges/centre and other layers; hold Alt to place without snapping.
export const SOURCE_MIME = 'text/x-pixelhue-source';
const MIN = 64;

export function moveWindow(original, dx, dy, handle) {
  if (!handle) return { ...original, x: Math.round(original.x + dx), y: Math.round(original.y + dy) };
  const left = handle.includes('w'), top = handle.includes('n');
  const right = original.x + original.width, bottom = original.y + original.height;
  const width = Math.max(MIN, Math.round(original.width + (left ? -dx : dx)));
  const height = Math.max(MIN, Math.round(original.height + (top ? -dy : dy)));
  return { x: left ? right - width : original.x, y: top ? bottom - height : original.y, width, height };
}

function nearest(values, lines, threshold) {
  let best = null;
  for (const value of values) for (const line of lines) {
    const delta = line - value;
    if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best))) best = delta;
  }
  return best;
}

export function snapWindow(win, screen, others, threshold, handle) {
  const xs = [0, screen.width / 2, screen.width], ys = [0, screen.height / 2, screen.height];
  for (const o of others) { xs.push(o.x, o.x + o.width / 2, o.x + o.width); ys.push(o.y, o.y + o.height / 2, o.y + o.height); }
  const next = { ...win };
  if (!handle) {
    const dx = nearest([win.x, win.x + win.width / 2, win.x + win.width], xs, threshold);
    const dy = nearest([win.y, win.y + win.height / 2, win.y + win.height], ys, threshold);
    if (dx !== null) next.x = Math.round(win.x + dx);
    if (dy !== null) next.y = Math.round(win.y + dy);
    return next;
  }
  const edge = (value, lines) => { const d = nearest([value], lines, threshold); return d === null ? value : Math.round(value + d); };
  if (handle.includes('w')) { const x = Math.min(edge(win.x, xs), win.x + win.width - MIN); next.width = win.x + win.width - x; next.x = x; }
  if (handle.includes('e')) next.width = Math.max(MIN, edge(win.x + win.width, xs) - win.x);
  if (handle.includes('n')) { const y = Math.min(edge(win.y, ys), win.y + win.height - MIN); next.height = win.y + win.height - y; next.y = y; }
  if (handle.includes('s')) next.height = Math.max(MIN, edge(win.y + win.height, ys) - win.y);
  return next;
}

export function dropWindow(source, screen, point) {
  let width = source?.width || Math.round(screen.width / 2), height = source?.height || Math.round(width * 9 / 16);
  const scale = Math.min(1, screen.width / width, screen.height / height);
  width = Math.max(MIN, Math.round(width * scale)); height = Math.max(MIN, Math.round(height * scale));
  return { x: Math.round(point.x - width / 2), y: Math.round(point.y - height / 2), width, height };
}

export function paintStage(stage, screen, layers, selectedId) {
  stage.replaceChildren();
  for (const [index, l] of layers.slice().sort((a, b) => a.zorder - b.zorder).entries()) {
    const node = el('div', { className: `program-layer${l.id === selectedId ? ' selected' : ''}`, 'data-id': l.id });
    Object.assign(node.style, { left: `${100 * l.window.x / screen.width}%`, top: `${100 * l.window.y / screen.height}%`,
      width: `${100 * l.window.width / screen.width}%`, height: `${100 * l.window.height / screen.height}%`, zIndex: index + 1, opacity: l.enabled ? '1' : '.5' });
    node.append(el('span', { className: 'window-title' }, l.name), text(l.sourceName || `Source ${l.sourceId}`));
    if (l.id === selectedId) for (const corner of ['nw', 'ne', 'sw', 'se']) node.append(el('span', { className: `handle ${corner}`, 'data-handle': corner }));
    stage.append(node);
  }
}

// ctx: { layers(), selectedId(), select(id), commit(layer, window), drop(key, point), busy(), repaint() }
export function bindStage(stage, screen, ctx) {
  let drag = null;
  stage.onpointerdown = event => {
    if (ctx.busy() || event.button !== 0) return;
    const target = event.target.closest('.program-layer'); if (!target) return;
    const layer = ctx.layers().find(l => l.id === Number(target.dataset.id)); if (!layer) return;
    ctx.select(layer.id);
    if (ctx.locked?.()) return; // PGM lock (WO-022): select only, no move/resize.
    drag = { layer, before: structuredClone(layer.window), x: event.clientX, y: event.clientY, handle: event.target.dataset.handle, rect: stage.getBoundingClientRect() };
    stage.setPointerCapture(event.pointerId); event.preventDefault();
  };
  stage.onpointermove = event => {
    if (!drag) return;
    const scale = screen.width / drag.rect.width;
    let next = moveWindow(drag.before, (event.clientX - drag.x) * scale, (event.clientY - drag.y) * (screen.height / drag.rect.height), drag.handle);
    if (!event.altKey) next = snapWindow(next, screen, ctx.layers().filter(l => l.id !== drag.layer.id).map(l => l.window), 10 * scale, drag.handle);
    drag.layer.window = next; ctx.repaint();
  };
  const end = event => {
    if (!drag) return;
    const { layer, before } = drag, next = structuredClone(layer.window); drag = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    layer.window = before;
    if (event.type !== 'pointercancel' && JSON.stringify(before) !== JSON.stringify(next)) ctx.commit(layer, next);
    else ctx.repaint();
  };
  stage.onpointerup = end; stage.onpointercancel = end;
  stage.ondragover = event => { if (!ctx.busy() && !ctx.locked?.() && event.dataTransfer.types.includes(SOURCE_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; stage.classList.add('drop-target'); } };
  stage.ondragleave = () => stage.classList.remove('drop-target');
  stage.ondrop = event => {
    stage.classList.remove('drop-target');
    const key = event.dataTransfer.getData(SOURCE_MIME); if (!key || ctx.busy()) return;
    if (ctx.locked?.()) { event.preventDefault(); ctx.onLocked?.(); return; }
    event.preventDefault(); const rect = stage.getBoundingClientRect();
    ctx.drop(key, { x: (event.clientX - rect.left) * screen.width / rect.width, y: (event.clientY - rect.top) * screen.height / rect.height });
  };
  return { dragging: () => Boolean(drag) };
}
