import { $, el, text, button, input, select, field, cell, table, panelHeader, sessionPath, setDisabled } from './ui.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createOutputsUI({ api, notice, operation, getSession, invalidate }) {
  const root = $('outputs-content'); let state, session, busy = false, drafts = new Map(), checked = new Set();
  function pending() {
    return (state?.outputs || []).flatMap(row => {
      const draft = drafts.get(row.id), change = { id: row.id };
      for (const key of ['name', 'timing', 'colorDepth', 'hdcp', 'testPattern']) if (!same(draft[key], row[key])) change[key] = draft[key];
      return Object.keys(change).length > 1 ? [change] : [];
    });
  }
  function controls() {
    if (!$('output-save')) return;
    const count = pending().length; $('output-dirty').textContent = count ? `${count} pending ${count === 1 ? 'change' : 'changes'}` : 'No pending changes';
    setDisabled(root, busy); $('output-save').disabled = busy || !count;
  }
  function adopt(next) {
    state = next; session = next.session; drafts = new Map(next.outputs.map(o => [o.id, structuredClone(o)]));
    checked = new Set(next.outputs.map(o => o.id)); render();
  }
  async function refresh() {
    if (!getSession()) return;
    if (pending().length && !window.confirm('Discard pending output changes?')) return;
    await operation(async () => adopt(await api(sessionPath('outputs', getSession()))));
  }
  function render() {
    root.replaceChildren();
    if (!state) { root.append(text('Connect a device to load its outputs.')); return; }
    const head = panelHeader('Outputs', refresh); head.append(text(`${state.outputs.length} physical ports`)); root.append(head);
    const bulk = el('div', { className: 'studio-bulk' });
    const all = input('', 'Select all outputs', 'checkbox'); all.checked = checked.size === state.outputs.length;
    all.onchange = () => { checked = new Set(all.checked ? state.outputs.map(o => o.id) : []); render(); };
    const naming = input('', 'Output name pattern'); naming.placeholder = 'Output {n}';
    const resolution = select([['', 'Keep timing'], ['1920,1080,50', '1080p50'], ['1920,1080,60', '1080p60'], ['3840,2160,50', '2160p50'], ['3840,2160,60', '2160p60']], '', 'Bulk output timing');
    const depth = select([['', 'Keep depth'], [8, '8 bit'], [10, '10 bit'], [12, '12 bit']], '', 'Bulk output depth');
    const hdcp = select([['', 'Keep HDCP'], [0, 'Off'], [1, 'On']], '', 'Bulk output HDCP');
    bulk.append(field('All', all), field('Name pattern', naming), field('Timing', resolution), field('Color depth', depth), field('HDCP', hdcp), button('Fill selected', () => {
      for (const row of state.outputs.filter(o => checked.has(o.id))) {
        const draft = drafts.get(row.id);
        if (naming.value) draft.name = naming.value.replaceAll('{n}', row.number);
        if (resolution.value && row.timingEditable) {
          const [width, height, frame] = resolution.value.split(',').map(Number);
          draft.timing = { width, height, frame, standardType: 6, interlaced: 0 };
        }
        if (depth.value && row.colorDepth !== null) draft.colorDepth = Number(depth.value);
        if (hdcp.value && row.hdcp !== null) draft.hdcp = Number(hdcp.value);
      }
      render();
    })); root.append(bulk);
    const { wrap, body } = table(['Port', 'Capacity', 'Name', 'Output timing', 'Hz', 'Depth', 'HDCP', 'Pattern']);
    for (const row of state.outputs) {
      const draft = drafts.get(row.id), tr = el('tr'), check = input('', `Select output ${row.number}`, 'checkbox');
      check.checked = checked.has(row.id); check.onchange = () => { check.checked ? checked.add(row.id) : checked.delete(row.id); };
      const title = el('label', { className: 'checkbox-label' }); title.append(check, `${row.role} ${row.number} · ${row.connector}`);
      cell(tr, title, text(`Slot ${row.slotId} · Port ${row.port}${row.copyFrom ? ` · Copy of ${row.copyFrom}` : ''}`));
      cell(tr, document.createTextNode(['SL', 'DL', '4K'][row.capacity] || 'Managed'));
      const naming = input(draft.name, `Output ${row.number} name`); naming.maxLength = 32;
      naming.oninput = () => { draft.name = naming.value; controls(); };
      cell(tr, naming, text(row.screen || 'Unassigned'));
      if (draft.timing) {
        const dimensions = el('div', { className: 'compact-fields' });
        for (const key of ['width', 'height']) {
          const control = input(draft.timing[key], `Output ${row.number} ${key}`, 'number'); control.min = 64; control.max = 16384;
          control.dataset.fixed = String(!row.timingEditable);
          control.oninput = () => { draft.timing[key] = Number(control.value); controls(); }; dimensions.append(control);
        }
        cell(tr, dimensions, text(row.timingEditable ? 'Custom timing' : 'Timing follows primary port'));
        const hz = input(draft.timing.frame, `Output ${row.number} Hz`, 'number'); hz.step = '.01'; hz.min = 1; hz.max = 240;
        hz.dataset.fixed = String(!row.timingEditable); hz.oninput = () => { draft.timing.frame = Number(hz.value); controls(); }; cell(tr, hz);
      } else { cell(tr, text('Device-managed')); cell(tr, text('—')); }
      const bits = select([[8, '8 bit'], [10, '10 bit'], [12, '12 bit'], ...(draft.colorDepth === 255 ? [[255, 'Auto']] : [])], draft.colorDepth, `Output ${row.number} depth`);
      bits.dataset.fixed = String(row.colorDepth === null); bits.onchange = () => { draft.colorDepth = Number(bits.value); controls(); }; cell(tr, bits);
      for (const key of ['hdcp', 'testPattern']) {
        const control = select([[0, 'Off'], [1, 'On']], draft[key], `Output ${row.number} ${key === 'hdcp' ? 'HDCP' : 'pattern'}`);
        control.dataset.fixed = String(row[key] === null); control.onchange = () => { draft[key] = Number(control.value); controls(); }; cell(tr, control);
      }
      body.append(tr);
    }
    root.append(wrap, text('Copy ports retain their routing. Timing changes apply to primary ports.'));
    const footer = el('footer', { className: 'action-bar' });
    const dirty = el('span', { id: 'output-dirty' });
    const save = button('Apply outputs', () => operation(async () => {
      adopt(await api('outputs', { session, changes: pending() }, 'PUT')); invalidate('outputs'); notice('Outputs saved.', 'success');
    }), 'button primary'); save.id = 'output-save'; footer.append(dirty, save); root.append(footer); controls();
  }
  render();
  return { open: () => state ? undefined : refresh(), refresh, hasChanges: () => pending().length > 0,
    reset(next) { if (session === next) return; session = next; state = undefined; drafts.clear(); render(); },
    setBusy(value) { busy = value; controls(); } };
}
