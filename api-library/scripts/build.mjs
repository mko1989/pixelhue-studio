import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { vendorObservations } from './vendor.mjs';
import { companionObservations } from './companion.mjs';
import { manualObservations } from './manual.mjs';
import { curated, auth, enums } from './curated.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), data = join(root, 'data');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const i = arg.indexOf('='); return [arg.slice(2, i), arg.slice(i + 1)]; }));
const workspace = resolve(root, '../..');
const parser = args.parser ? await import(pathToFileURL(resolve(args.parser))) : await import('@babel/parser');
const vendor = await vendorObservations(args.vendor || join(workspace, 'extracted-source/web/unicos/static'), parser.parse);
const companion = await companionObservations(args.companion || join(workspace, 'companion-module-pixelhue-switcher-2.2.7'), parser.parse);
const manual = await manualObservations(join(data, 'manual'));
const manualInfo = JSON.parse(await readFile(join(data, 'manual/index.json'), 'utf8'));
const hash = (text) => createHash('sha256').update(text).digest('hex');
// Keep bounded, line-oriented JSON files; pretty-print one selected operation via CLI.
const save = (file, value) => writeFile(join(data, file), '{\n' + Object.entries(value)
  .map(([key, item]) => `  ${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(',\n') + '\n}\n');
for (const dir of ['endpoints', 'groups', 'types']) {
  await rm(join(data, dir), { recursive: true, force: true }); await mkdir(join(data, dir), { recursive: true });
}
const records = new Map(), unresolved = [...vendor.unresolved];
function canonical(path, client) {
  if (/^https?:\/\//.test(path)) {
    const url = new URL(path);
    if (!url.pathname.startsWith('/unico/')) return null;
    return url.pathname;
  }
  path = path.replace(/^\{[^}]+\}(\/unico\/)/, '$1').split('?')[0];
  if (path.startsWith('/unico/')) return path;
  if (/^\/?v\d+\//.test(path)) return '/unico/' + path.replace(/^\//, '');
  if (client === 'SplicerAPIInstance') return null;
  return (client === 'THIRD_API' ? '/keyboard/' : '/unico/v1/') + path.replace(/^\/+/, '');
}
function recordFor(method, path, client) {
  const route = canonical(path, client);
  if (!route) return null;
  const key = `${method} ${route}`;
  if (!records.has(key)) {
    const group = route.replace(/^\/unico\/v\d+\//, '').split('/').filter(Boolean)[0] || 'root';
    records.set(key, { method, path: route, group, summary: '', tags: [], authentication: 'device-token',
      serverKind: client === 'THIRD_API' ? 'keyboard' : route.includes('/ucenter/') ? 'controller' : 'device',
      protocol: 'http', defaultPort: client === 'THIRD_API' || route.includes('/ucenter/') ? null : 8088,
      responseType: 'json', requestSchema: null, exampleBody: null, queryExample: null,
      manualSections: [], vendorEvidence: [], companionEvidence: [], notes: [],
      support: { documentedModels: [], companionConfiguredModels: [], studioUsedModels: [], deviceVerified: false } });
  }
  return records.get(key);
}
for (const observation of vendor.observations) {
  const record = recordFor(observation.method, observation.path, observation.client);
  if (!record) { unresolved.push({ ...observation, reason: 'External or alternate-base URL; no canonical device route inferred' }); continue; }
  record.vendorEvidence.push(observation);
}
for (const observation of companion.observations) {
  const record = recordFor(observation.method, observation.path);
  record.companionEvidence.push(observation);
  record.support.companionConfiguredModels.push(observation.model);
}
for (const observation of manual) {
  const record = recordFor(observation.method, observation.path);
  record.manualSections.push(observation);
  record.support.documentedModels.push(...observation.modelScope);
  record.summary ||= observation.title;
}
for (const item of curated) {
  const record = recordFor(item.method, item.path);
  Object.assign(record, item, { group: record.group });
  record.support.studioUsedModels = /\/(layers|screen)\//.test(item.path) || item.path.endsWith('/config-file') ? ['P20', 'Q8'] : ['P10', 'P20', 'Q8', 'P80'];
  record.curatedEvidence = ['Studio v1.5.0 lib/pixelhue.js', 'Studio v1.5.0 lib/inputs.js',
    'Studio v1.5.0 lib/mvr-umd.js', 'Companion model configs and services'];
}
const operations = [...records.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const groups = new Map(), ids = new Set();
for (const record of operations) {
  const slug = record.path.replace(/^\/unico\/v\d+\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  let id = `${record.method.toLowerCase()}-${slug}`;
  if (ids.has(id)) id += '-' + hash(record.path).slice(0, 8);
  ids.add(id); record.id = id;
  record.summary ||= record.vendorEvidence.find((e) => e.symbol)?.symbol?.replace(/([a-z])([A-Z])/g, '$1 $2') || `${record.method} ${record.path}`;
  record.tags = [...new Set([...record.tags, record.group, ...record.path.split('/').slice(3)])];
  for (const key of ['documentedModels', 'companionConfiguredModels']) record.support[key] = [...new Set(record.support[key])].sort();
  record.contractStatus = record.requestSchema ? 'curated partial schema' : record.manualSections.length ? 'manual tables and observed source contracts' : 'observed source contracts only';
  if (record.method === 'POST' && record.path.endsWith('/system/auth/login')) record.authentication = 'none';
  if (record.path.endsWith('/screen/select') && record.companionEvidence.some((e) => e.symbol === 'selectLayer')) {
    record.notes.push('Companion selectLayer sends a layer selection payload to screen/select. This observation is inconsistent with screen selection; review vendor layers/select instead of copying it as an example.');
  }
  const templates = [...record.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  record.pathParameters = templates;
  await save(`endpoints/${id}.json`, record);
  const entry = { id, method: record.method, path: record.path, group: record.group, summary: record.summary, tags: record.tags,
    models: [...new Set([...record.support.documentedModels, ...record.support.companionConfiguredModels, ...record.support.studioUsedModels])],
    symbols: [...new Set([...record.vendorEvidence, ...record.companionEvidence].map((e) => e.symbol).filter(Boolean))],
    keywords: record.notes.join(' ') + ' ' + record.vendorEvidence.map(e => [e.parameters?.join(' '), e.bodyExpression, e.queryExpression].filter(Boolean).join(' ')).join(' '),
    serverKind: record.serverKind, manual: record.manualSections.length > 0, file: `endpoints/${id}.json` };
  if (!groups.has(record.group)) groups.set(record.group, []);
  groups.get(record.group).push(entry);
}
for (const [name, entries] of groups) await save(`groups/${name}.json`, { group: name, endpoints: entries });
const typeIndex = [];
for (const item of [...vendor.types, ...companion.types].sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name))) {
  const id = `${item.name}-${hash(item.source + ':' + item.line).slice(0, 8)}`;
  await save(`types/${id}.json`, { id, ...item });
  typeIndex.push({ id, name: item.name, source: item.source, file: `types/${id}.json` });
}
const referenceGroups = new Map();
for (const item of vendor.typeReferences) {
  if (/^(Array|Promise|Record|Partial|Required|Pick|Omit|Readonly|Set|Map|Exclude|Extract|ReturnType|Parameters|NonNullable|Awaited|ReadonlyArray|PromiseLike)$/.test(item.name)) continue;
  if (!referenceGroups.has(item.name)) referenceGroups.set(item.name, []);
  referenceGroups.get(item.name).push(item);
}
for (const [name, references] of referenceGroups) {
  if (typeIndex.some(t => t.name === name)) continue;
  const id = `reference-${name.replace(/[^a-zA-Z0-9]+/g, '-')}-${hash(name).slice(0, 8)}`;
  await save(`types/${id}.json`, { id, name, availability: 'referenced-only', references,
    note: 'The wrapper references this type, but its definition is not present in the supplied source maps. Consult manual tables and observed expressions; no definition has been invented.' });
  typeIndex.push({ id, name, source: references[0].source, availability: 'referenced-only', file: `types/${id}.json` });
}
const typeChunks = [];
for (let i = 0; i < typeIndex.length; i += 250) {
  const file = `types/index-${String(typeChunks.length + 1).padStart(3, '0')}.json`;
  await save(file, { symbols: typeIndex.slice(i, i + 250) }); typeChunks.push(file);
}
await save('authentication.json', auth); await save('enums.json', enums);
await save('unresolved.json', { explanation: 'Observed calls whose method/path cannot be resolved statically or use an alternate API base. No guessed endpoint was generated.', calls: unresolved });
await save('sources.json', { manual: manualInfo, companionVersion: '2.2.7', vendorSourceFiles: vendor.sources, sourceMaps: vendor.maps });
await save('catalog.json', { format: 'pixelhue-api-catalog', version: '0.1.0', operationCount: operations.length,
  coverage: { manualSections: manual.length, vendorRequestObservations: vendor.observations.length + vendor.unresolved.length,
    companionObservations: companion.observations.length, unresolvedCalls: unresolved.length, typeDeclarations: vendor.types.length + companion.types.length,
    referenceOnlyTypes: typeIndex.filter(t => t.availability === 'referenced-only').length,
    scope: 'All parsed HTTP calls in the 55 supplied src/api modules, documented manual operations, Companion calls, and curated Studio contracts. Not a guarantee of every endpoint on every device/firmware.' },
  groups: [...groups].map(([name, entries]) => ({ name, count: entries.length, file: `groups/${name}.json` })),
  typeIndexes: typeChunks, authentication: 'authentication.json', enums: 'enums.json', sources: 'sources.json',
  caveats: ['Controller/keyboard endpoints are separate services; do not assume they run on a P20.',
    'Manual sections preserve conflicting methods and firmware variants; raw table hierarchy is not inferred as JSON Schema.',
    'Examples contain placeholder IDs. All helpers are offline; importing or searching this library performs no device calls.'] });
console.log(JSON.stringify({ operations: operations.length, groups: groups.size, manualSections: manual.length,
  vendorObservations: vendor.observations.length, unresolved: unresolved.length, types: typeIndex.length }));
