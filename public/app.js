import { keys, sameWindow, clone, fit, dragWindow, readLayout } from './editor.js';
import { createInputsUI } from './inputs.js';
import { canPlace, fixAspectRatios, ratioSize } from './mvr-geometry.js';

const $ = (id) => document.getElementById(id);
const color = () => '#aebdcb';
let state, base, screenId, selectedId, busy = false, drag;
let undo = [], redo = [];
let activeTab = 'mvr';
const screen = () => state?.screens.find((item) => item.id === screenId);
const selected = () => state?.layers.find((item) => item.id === selectedId);
const windows = () => state?.layers.filter((item) => item.screenId === screenId) || [];
const geometry = () => state.layers.map(({ id, window, aspectLock, aspectMode }) => ({ id, window: clone(window), aspectLock, aspectMode }));
const sameEdit = (a, b) => b && sameWindow(a.window, b.window) && a.aspectLock === b.aspectLock && a.aspectMode === b.aspectMode;
const changes = () => state?.layers.filter((item) => !sameEdit(item, base.layers.find((old) => old.id === item.id))) || [];

function notice(message, kind = '') {
  $('notice').textContent = message;
  $('notice').className = kind;
  $('notice').setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

async function api(path, body, method = 'POST') {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function adopt(next) {
  state = clone(next);
  base = clone(next);
  inputsUI.reset(next.session);
  screenId = next.screens.some((item) => item.id === screenId) ? screenId : next.screens[0]?.id;
  selectedId = windows().some((item) => item.id === selectedId) ? selectedId : windows()[0]?.id;
  undo = []; redo = [];
  $('screen').replaceChildren(...state.screens.map((item) => new Option(item.name, item.id)));
  if (!state.screens.length) $('screen').add(new Option('No MVR outputs found', ''));
  showTab(next.capabilities?.mvr === false ? 'inputs' : activeTab, false);
  render();
}

async function operation(action) {
  if (busy) return;
  busy = true; renderControls();
  try { await action(); } catch (error) { notice(error.message, 'error'); }
  finally { busy = false; render(); }
}

function canDiscard() {
  return (!changes().length && !inputsUI.hasChanges()) || window.confirm('Discard your pending changes?');
}

async function connect() {
  if (!canDiscard()) return;
  await operation(async () => {
    notice('Identifying the device at this address…');
    const next = await api('connect', { host: $('host').value.trim(), apiPort: $('api-port').value, serial: $('serial').value.trim() });
    adopt(next);
    document.querySelector('.advanced').open = false;
    try { localStorage.setItem('mvr-connection', JSON.stringify({ host: $('host').value, apiPort: $('api-port').value, serial: $('serial').value })); } catch {}
    const fallback = next.screens.some((item) => item.dimensionsAssumed) ? ' Output dimensions were unavailable; 1920 × 1080 is assumed.' : '';
    notice(next.capabilities?.mvr === false ? `Connected to ${next.device.model} · ${next.device.serial}. Loading inputs…` :
      !next.screens.length ? 'Connected, but this device returned no MVR screens. Enable a multiviewer layout in PixelFlow, then refresh.' :
      !next.layers.length ? 'MVR output found, with no windows. Choose a layout in PixelFlow, then refresh.' :
      `Connected to ${next.device.model}.${fallback}`, 'success');
  });
  if (activeTab === 'inputs') await inputsUI.open();
}

function remember(before = geometry()) {
  undo.push(before);
  if (undo.length > 100) undo.shift();
  redo = [];
}

function restore(layout) {
  for (const item of layout) {
    const layer = state.layers.find((layer) => layer.id === item.id);
    if (layer) { layer.window = clone(item.window); layer.aspectLock = item.aspectLock ?? null; layer.aspectMode = item.aspectMode ?? 5; }
  }
}

function edit(window) {
  if (busy || !selected() || sameWindow(window, selected().window)) return;
  const next = fit(window, screen());
  if (!canPlace(selected(), next, state.layers)) { notice('MVR windows cannot overlap. Choose a smaller size or a free position.', 'error'); render(); return; }
  const resized = next.width !== selected().window.width || next.height !== selected().window.height;
  if (resized && selected().aspectLock && Math.abs(next.height - next.width / selected().aspectLock) > 1) { notice('This size cannot fit while keeping the locked aspect ratio.', 'error'); render(); return; }
  remember(); selected().window = next; render();
}

function renderControls() {
  const connected = Boolean(state);
  const dirty = changes().length;
  for (const id of ['connect', 'host', 'api-port', 'serial']) $(id).disabled = busy;
  $('mvr-tab').disabled = state?.capabilities?.mvr === false;
  $('mvr-tab').title = $('mvr-tab').disabled ? 'Multiviewer editing is available for P20 and Q8' : '';
  inputsUI.setBusy(busy);
  $('screen').disabled = busy || !state?.screens.length;
  $('refresh').disabled = busy || !connected;
  $('save').disabled = busy || !windows().length;
  $('load').disabled = busy || !windows().length;
  $('fix-aspect').disabled = busy || !windows().length;
  $('apply').disabled = busy || !dirty;
  $('undo').disabled = busy || !undo.length;
  $('redo').disabled = busy || !redo.length;
  $('inspector').disabled = busy || !selected();
  $('apply').textContent = busy ? 'Working…' : 'Apply layout';
  $('dirty-label').textContent = dirty ? `${dirty} pending ${dirty === 1 ? 'change' : 'changes'}` : 'No pending changes';
  $('dirty-label').className = dirty ? 'pending' : '';
}

function renderList() {
  $('window-list').replaceChildren();
  windows().forEach((layer) => {
    const row = document.createElement('button');
    row.className = `window-row${layer.id === selectedId ? ' selected' : ''}`;
    row.setAttribute('aria-pressed', String(layer.id === selectedId));
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = color(layer);
    const text = document.createElement('span');
    const name = document.createElement('span'); name.className = 'row-name'; name.textContent = layer.name;
    const size = document.createElement('span'); size.className = 'row-size'; size.textContent = `${layer.window.width} × ${layer.window.height}`;
    text.append(name, size); row.append(swatch, text);
    if (!sameEdit(layer, base.layers.find((item) => item.id === layer.id))) {
      const marker = document.createElement('span'); marker.className = 'row-dirty'; marker.textContent = '•'; row.append(marker);
    }
    row.onclick = () => { if (!busy) { selectedId = layer.id; render(); } };
    $('window-list').append(row);
  });
}

function renderStage() {
  if (!state) return;
  const stage = $('stage'); stage.replaceChildren();
  if (!screen()) return;
  stage.style.aspectRatio = `${screen().width} / ${screen().height}`;
  windows().forEach((layer, i) => {
    const node = document.createElement('div');
    node.className = `window${layer.id === selectedId ? ' selected' : ''}`;
    node.dataset.id = layer.id;
    node.style.setProperty('--window-color', color(layer));
    const { x, y, width, height } = layer.window;
    Object.assign(node.style, { left: `${100 * x / screen().width}%`, top: `${100 * y / screen().height}%`,
      width: `${100 * width / screen().width}%`, height: `${100 * height / screen().height}%` });
    const name = document.createElement('span'); name.className = 'window-title'; name.textContent = layer.name;
    const source = document.createElement('span'); source.className = 'window-source'; source.textContent = layer.source;
    const number = document.createElement('span'); number.className = 'window-number'; number.textContent = String(i + 1).padStart(2, '0');
    node.append(number, name, source);
    if (layer.id === selectedId) for (const direction of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('span'); handle.className = `handle ${direction}`; handle.dataset.handle = direction; node.append(handle);
    }
    stage.append(node);
  });
  if (!windows().length) {
    const hint = document.createElement('div'); hint.className = 'welcome'; hint.textContent = 'No MVR windows. Choose a layout in PixelFlow, then refresh.'; stage.append(hint);
  }
}

function render() {
  renderControls();
  if (!state) return;
  $('connection-label').textContent = `${state.device.model} · ${state.device.host} · ${state.device.serial}`;
  $('connection-dot').className = 'dot connected';
  $('window-count').textContent = windows().length;
  $('screen').value = screenId ?? '';
  $('resolution').textContent = screen() ? `${screen().width} × ${screen().height}` : '—';
  $('canvas-end').textContent = screen() ? `${screen().width} / ${screen().height} PX` : '—';
  $('inspector-empty').hidden = Boolean(selected());
  $('inspector').hidden = !selected();
  if (selected()) {
    $('selected-name').textContent = selected().name;
    $('selected-source').textContent = selected().source || 'MVR window';
    $('selected-swatch').style.background = color(selected());
    $('layer-id').textContent = `Window ID ${selected().id}`;
    for (const key of keys) $(key).value = selected().window[key];
    $('x').max = screen().width - selected().window.width;
    $('y').max = screen().height - selected().window.height;
    $('width').max = screen().width - selected().window.x;
    $('height').max = screen().height - selected().window.y;
    $('aspect').checked = Boolean(selected().aspectLock);
    const signal = state.signals?.find((signal) => signal.id === selected().sourceId && signal.connected);
    $('aspect-info').textContent = selected().sourceType === 2 && signal ? `Input ${signal.width} × ${signal.height}${selected().aspectLock ? ' · locked' : ''}` : selected().aspectLock ? 'Window ratio locked' : '';
  }
  renderList(); renderStage();
}

const inputsUI = createInputsUI({ api, notice, operation, getSession: () => state?.session });
function showTab(name, load = true) {
  if (name === 'mvr' && state?.capabilities?.mvr === false) return;
  activeTab = name;
  for (const tab of ['mvr', 'inputs']) {
    $(`${tab}-tab`).setAttribute('aria-selected', String(tab === name));
    $(`${tab}-tab`).tabIndex = tab === name ? 0 : -1;
    $(`${tab}-panel`).hidden = tab !== name;
  }
  if (name === 'inputs' && load) inputsUI.open();
}
for (const name of ['mvr', 'inputs']) {
  $(`${name}-tab`).onclick = () => showTab(name);
  $(`${name}-tab`).onkeydown = (event) => {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); const next = name === 'mvr' ? 'inputs' : 'mvr';
      if ($(`${next}-tab`).disabled) return;
      showTab(next); $(`${next}-tab`).focus();
    }
  };
}
$('connect-form').onsubmit = (event) => { event.preventDefault(); connect(); };
$('screen').onchange = () => { screenId = Number($('screen').value); selectedId = windows()[0]?.id; render(); };
$('undo').onclick = () => { if (busy || !undo.length) return; redo.push(geometry()); restore(undo.pop()); render(); };
$('redo').onclick = () => { if (busy || !redo.length) return; undo.push(geometry()); restore(redo.pop()); render(); };

for (const key of keys) $(key).onchange = () => {
  if (!selected() || busy) return;
  const value = Number($(key).value);
  if ($(key).value === '' || !Number.isSafeInteger(value)) { notice('Enter a whole number of pixels.', 'error'); render(); return; }
  let next = { ...selected().window, [key]: value };
  if (selected().aspectLock && (key === 'width' || key === 'height')) {
    const ratio = selected().aspectLock;
    const desiredWidth = key === 'width' ? value : value * ratio;
    const size = ratioSize(ratio, screen().width - next.x, screen().height - next.y, Math.max(64, Math.ceil(64 * ratio), desiredWidth));
    if (!size) { notice('No room for this locked aspect ratio at the minimum window size.', 'error'); render(); return; }
    next = { ...next, ...size };
  }
  edit(next);
};
$('center-x').onclick = () => { if (selected()) edit({ ...selected().window, x: Math.round((screen().width - selected().window.width) / 2) }); };
$('center-y').onclick = () => { if (selected()) edit({ ...selected().window, y: Math.round((screen().height - selected().window.height) / 2) }); };
$('aspect').onchange = () => {
  if (!selected() || busy) return;
  remember(); selected().aspectLock = $('aspect').checked ? selected().window.width / selected().window.height : null;
  selected().aspectMode = 5; render();
};
$('fix-aspect').onclick = () => operation(async () => {
  notice('Reading connected input resolutions…');
  const fresh = await api('state');
  const output = fresh.screens.find((item) => item.id === screenId);
  if (fresh.session !== state.session || output?.width !== screen().width || output?.height !== screen().height ||
    fresh.layers.filter((layer) => layer.screenId === screenId).length !== windows().length || windows().some((layer) => {
      const actual = fresh.layers.find((item) => item.id === layer.id), original = base.layers.find((item) => item.id === layer.id);
      return !actual || !sameWindow(actual.window, original.window) || actual.sourceId !== layer.sourceId || actual.sourceType !== layer.sourceType;
    })) throw new Error('The device layout or connection changed. Refresh before fixing aspect ratios.');
  const result = fixAspectRatios(windows(), fresh.signals || [], screen());
  if (result.layers.some((layer) => !sameEdit(layer, state.layers.find((item) => item.id === layer.id)))) { remember(); restore(result.layers); }
  state.signals = fresh.signals;
  const tooSmall = result.skipped.filter((item) => item.reason.includes('64 px')).length;
  notice(result.fixed.length ? `Fixed and locked ${result.fixed.length} connected-input windows; ${result.skipped.length} other windows unchanged.${tooSmall ? ` ${tooSmall} cannot fit the 64 px minimum.` : ''} Apply to send these changes.` :
    tooSmall ? 'Connected input ratios cannot fit inside their current windows at the 64 px minimum. Make room first.' : 'No connected direct-input windows with valid actual resolution were found.');
});

$('stage').onpointerdown = (event) => {
  if (busy || !state || event.button !== 0) return;
  const target = event.target.closest('.window');
  if (!target) return;
  selectedId = Number(target.dataset.id);
  drag = { id: selectedId, x: event.clientX, y: event.clientY, window: clone(selected().window),
    before: geometry(), handle: event.target.dataset.handle, rect: $('stage').getBoundingClientRect() };
  $('stage').setPointerCapture(event.pointerId); $('stage').focus(); event.preventDefault(); render();
};
$('stage').onpointermove = (event) => {
  if (!drag || busy) return;
  const next = dragWindow(drag.window, (event.clientX - drag.x) * screen().width / drag.rect.width,
    (event.clientY - drag.y) * screen().height / drag.rect.height, screen(), drag.handle, Number($('snap').value), selected().aspectLock || false);
  drag.blocked = !canPlace(selected(), next, state.layers);
  if (!drag.blocked) selected().window = next;
  render();
};
function endDrag(event) {
  if (!drag) return;
  if (event.type === 'pointercancel') restore(drag.before);
  else if (!sameWindow(drag.window, selected().window)) remember(drag.before);
  if (drag.blocked) notice('Movement or resizing was limited to avoid overlapping another MVR window.');
  drag = null;
  if ($('stage').hasPointerCapture(event.pointerId)) $('stage').releasePointerCapture(event.pointerId);
  render();
}
$('stage').onpointerup = endDrag;
$('stage').onpointercancel = endDrag;

document.addEventListener('keydown', (event) => {
  if (busy || !state || activeTab !== 'mvr' || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); (event.shiftKey ? $('redo') : $('undo')).click(); return;
  }
  if (!selected() || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const amount = event.shiftKey ? 10 : 1;
  const next = { ...selected().window };
  if (event.key === 'ArrowLeft') next.x -= amount;
  if (event.key === 'ArrowRight') next.x += amount;
  if (event.key === 'ArrowUp') next.y -= amount;
  if (event.key === 'ArrowDown') next.y += amount;
  edit(next);
});

$('refresh').onclick = () => {
  if (changes().length && !window.confirm('Discard your pending window changes?')) return;
  operation(async () => { notice('Reading layout…'); adopt(await api('state')); notice('Layout refreshed.', 'success'); });
};
$('apply').onclick = () => operation(async () => {
  const pending = changes().map(({ id, window, aspectLock, aspectMode }) => ({ id, window, aspectLock, aspectMode }));
  notice('Applying layout…');
  adopt(await api('windows', { session: state.session, changes: pending }, 'PUT'));
  notice('Layout applied.', 'success');
});
$('save').onclick = () => {
  const document = { format: 'pixelhue-mvr-layout', version: 1, serial: state.device.serial, screenId,
    width: screen().width, height: screen().height, windows: windows().map(({ id, window, aspectLock, aspectMode }) => ({ id, window, aspectLock, aspectMode })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
  const link = window.document.createElement('a'); link.href = url; link.download = `mvr-layout-${screenId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Layout saved.');
};
$('load').onclick = () => $('layout-file').click();
$('layout-file').onchange = async () => {
  const file = $('layout-file').files[0]; $('layout-file').value = '';
  if (!file || busy) return;
  await operation(async () => {
    if (file.size > 256_000) throw new Error('Layout file is too large.');
    let document;
    try { document = JSON.parse(await file.text()); } catch { throw new Error('Layout file is not valid JSON.'); }
    const layout = readLayout(document, state, screenId);
    remember(); restore(layout); render(); notice('Layout loaded. Apply to update the device.');
  });
};
window.addEventListener('beforeunload', (event) => { if (changes().length || inputsUI.hasChanges()) { event.preventDefault(); event.returnValue = ''; } });
try {
  const settings = JSON.parse(localStorage.getItem('mvr-connection') || '{}');
  for (const [key, id] of [['host', 'host'], ['apiPort', 'api-port'], ['serial', 'serial']]) $(id).value = settings[key] || '';
} catch {}
render();
