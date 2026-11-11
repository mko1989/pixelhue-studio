// MVR presets kept in the app (WO-040): save the current window arrangement under a name and recall it later,
// without files. Recall uses the same validation and autosave path as "Load layout".
export function createMvrPresets({ api, operation, notice, getState, getScreenId, getDocument, loadDocument }) {
  const $ = id => document.getElementById(id), select = $('mvr-preset'); let presets = [], session;
  const path = () => `mvr-presets?session=${encodeURIComponent(getState().session)}`;
  const chosen = () => presets.find(p => p.id === select.value);
  function render(keep) {
    const here = presets.filter(p => p.screenId === getScreenId());
    select.replaceChildren(new Option(here.length ? 'Preset…' : 'No presets yet', ''), ...here.map(p => new Option(`${p.name} · ${p.windows} windows`, p.id)));
    select.value = here.some(p => p.id === keep) ? keep : ''; controls();
  }
  function controls(busy = false) {
    const connected = Boolean(getState()?.capabilities?.mvr), has = Boolean(chosen());
    select.disabled = busy || !connected; $('mvr-preset-save').disabled = busy || !connected || !getState().layers.some(l => l.screenId === getScreenId());
    $('mvr-preset-recall').disabled = busy || !has; $('mvr-preset-delete').disabled = busy || !has;
  }
  select.onchange = () => controls();
  $('mvr-preset-recall').onclick = () => { const preset = chosen(); if (preset) operation(async () => { loadDocument(preset.document); notice(`${preset.name} recalled. Saving…`); }); };
  $('mvr-preset-save').onclick = () => {
    const current = chosen(); let n = presets.length + 1; while (presets.some(p => p.name === `Preset ${n}`)) n++;
    const name = window.prompt('Save this MVR arrangement as', current?.name || `Preset ${n}`); if (!name || !name.trim()) return;
    const same = presets.find(p => p.name === name.trim() && p.screenId === getScreenId());
    if (same && !window.confirm(`Overwrite MVR preset ${same.name}?`)) return;
    operation(async () => { const result = await api('mvr-presets', { session: getState().session, action: 'save', name, document: getDocument() }, 'PUT'); presets = result.presets; render(result.saved); notice(`MVR preset ${name.trim()} ${result.overwritten ? 'updated' : 'saved'} in the app.`, 'success'); });
  };
  $('mvr-preset-delete').onclick = () => {
    const preset = chosen(); if (!preset || !window.confirm(`Delete MVR preset ${preset.name}?`)) return;
    operation(async () => { presets = (await api('mvr-presets', { session: getState().session, action: 'delete', id: preset.id }, 'PUT')).presets; render(); notice('MVR preset deleted.', 'success'); });
  };
  render();
  return {
    async load() { const state = getState(); if (!state?.capabilities?.mvr || session === state.session) { render(select.value); return; } session = state.session; try { presets = (await api(path())).presets; } catch { presets = []; } render(); },
    reset() { session = undefined; presets = []; render(); }, render: () => render(select.value), setBusy: controls };
}
