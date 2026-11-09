const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHmac } = require('node:crypto');
const { buildRequest: prepare } = require('./request.cjs');
const root = join(__dirname, 'data'), cache = new Map();
function read(file) {
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(join(root, file), 'utf8')));
  return cache.get(file);
}
const catalog = read('catalog.json');
const entries = catalog.groups.flatMap((group) => read(group.file).endpoints);
const types = catalog.typeIndexes.flatMap((file) => read(file).symbols);
const clone = (value) => structuredClone(value);
const normalize = (text) => String(text).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const page = (items, options = {}) => {
  const limit = options.limit ?? 20, offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0) throw new Error('Use integer limit 1–1000 and offset >= 0.');
  return clone(items.slice(offset, offset + limit));
};
function filter(options = {}) {
  return entries.filter((e) => (!options.method || e.method === options.method.toUpperCase()) &&
    (!options.group || e.group === options.group) &&
    (!options.model || e.models.includes(options.model)) && (!options.serverKind || e.serverKind === options.serverKind));
}
function searchEndpoints(query = '', options = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  const ranked = filter(options).map((entry) => {
    const title = normalize(`${entry.method} ${entry.path} ${entry.summary} ${entry.tags.join(' ')}`);
    const haystack = title + ' ' + normalize(`${entry.symbols.join(' ')} ${entry.keywords || ''}`);
    if (!words.every(word => haystack.includes(word))) return null;
    return { entry, score: words.reduce((score, word) => score + (title.includes(word) ? 4 : 1), 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
  return page(ranked.map(r => r.entry), options);
}
function getEndpoint(idOrMethod, path) {
  let entry;
  if (path) entry = entries.find(e => e.method === idOrMethod.toUpperCase() && e.path === path);
  else entry = entries.find(e => e.id === idOrMethod || `${e.method} ${e.path}` === idOrMethod);
  if (!entry) throw new Error(`Unknown API operation: ${idOrMethod}${path ? ' ' + path : ''}`);
  return clone(read(entry.file));
}
function getManualPage(number) {
  const source = read('manual/index.json');
  if (!Number.isInteger(number) || number < 1 || number > source.pageCount) throw new Error(`Manual page must be 1–${source.pageCount}.`);
  return clone(read(`manual/${String(number).padStart(3, '0')}.json`));
}
function getType(idOrName) {
  const matches = types.filter(t => t.id === idOrName || t.name === idOrName);
  if (!matches.length) throw new Error(`Unknown type: ${idOrName}`);
  return matches.map(t => clone(read(t.file)));
}
function makeToken(sn, startTime) {
  if (typeof sn !== 'string' || !sn || !['string', 'number'].includes(typeof startTime) || String(startTime).length === 0) throw new Error('Supply device sn and startTime from node/open-detail.');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const text = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ SN: sn })}`;
  return `${text}.${createHmac('sha256', String(startTime)).update(text).digest('base64url')}`;
}
module.exports = {
  getCatalog: () => clone(catalog),
  listEndpoints: (options) => page(filter(options), options), searchEndpoints, getEndpoint,
  getManualPage, getAuthentication: () => clone(read('authentication.json')), getEnums: () => clone(read('enums.json')),
  searchTypes: (query = '', options) => page(types.filter(t => normalize(`${t.name} ${t.source}`).includes(normalize(query))), options),
  getType, getSources: () => clone(read('sources.json')),
  searchUnresolved: (query = '', options) => page(read('unresolved.json').calls.filter(e => normalize(JSON.stringify(e)).includes(normalize(query))), options),
  makeToken, buildRequest: (id, options) => prepare(getEndpoint(id), options),
};
