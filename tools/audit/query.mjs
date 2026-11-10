import { readFile } from 'node:fs/promises';
const root = new URL('../../docs/pixelflow-parity/census/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', root), 'utf8'));
const [tab, ...terms] = process.argv.slice(2), query = terms.join(' ').toLowerCase();
if (!tab || !index.tabs[tab]) { console.log(JSON.stringify({ tabs: index.tabs, usage: 'node tools/audit/query.mjs inputs mac' }, null, 2)); }
else {
  const rows = (await Promise.all(index.tabs[tab].files.map(file => readFile(new URL(file, root), 'utf8').then(JSON.parse)))).flat();
  const hits = rows.flatMap(row => {
    const labels = row.labels.filter(label => !query || `${label.id} ${label.label}`.toLowerCase().includes(query));
    return labels.length || row.source.toLowerCase().includes(query) ? [{ source: row.source, map: row.map, labels, apiImports: row.apiImports, gates: row.gates }] : [];
  });
  console.log(JSON.stringify(hits, null, 2));
}
