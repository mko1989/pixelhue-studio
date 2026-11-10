import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url), census = new URL('docs/pixelflow-parity/census/', root);
const index = JSON.parse(await readFile(new URL('index.json', census), 'utf8'));
const [source, startText = '1', countText = '60'] = process.argv.slice(2), start = Number(startText), count = Number(countText);
if (!source || !Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 1 || count > 500) throw new Error('Usage: node tools/audit/source.mjs src/path.tsx [first-line=1] [count=60; max=500]');
let entry;
for (const file of index.sourceIndex) {
  entry = JSON.parse(await readFile(new URL(file, census), 'utf8')).find(m => m.source === source);
  if (entry) break;
}
if (!entry) throw new Error(`Source not indexed: ${source}`);
const path = new URL(`../extracted-source/web/unicos/static/${entry.map}`, root), map = JSON.parse(await readFile(path, 'utf8'));
const i = map.sources.findIndex(p => p.slice(p.indexOf('src/')) === source && !p.slice(0, p.indexOf('src/')).includes('node_modules'));
const body = map.sourcesContent[i];
if (!body || createHash('sha256').update(body).digest('hex') !== entry.sha256) throw new Error('Source differs from audited content; regenerate the census.');
console.log(`${source} (${entry.map})`);
console.log(body.split('\n').slice(start - 1, start - 1 + count).map((line, i) => `${start + i}: ${line}`).join('\n'));
