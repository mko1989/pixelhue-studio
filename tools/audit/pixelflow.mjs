import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const n = a.indexOf('='); return [a.slice(2, n), a.slice(n + 1)]; }));
const source = resolve(args.source || join(root, '../extracted-source/web/unicos/static'));
const output = resolve(args.output || join(root, 'docs/pixelflow-parity/census'));
const { parse } = args.parser ? await import(pathToFileURL(resolve(args.parser))) : await import('@babel/parser');
const hash = s => createHash('sha256').update(s).digest('hex');
const sources = new Map(), maps = [], conflicts = [], errors = [], english = new Map();
for (const name of (await readdir(source)).filter(n => n.endsWith('.map')).sort()) {
  const bytes = await readFile(join(source, name), 'utf8'); let map;
  try { map = JSON.parse(bytes); } catch { continue; }
  maps.push({ file: name, sha256: hash(bytes) });
  for (let i = 0; i < (map.sources || []).length; i++) {
    const original = map.sources[i], start = original.indexOf('src/'), body = map.sourcesContent?.[i];
    if (start < 0 || !body || original.slice(0, start).includes('node_modules')) continue;
    const path = original.slice(start), old = sources.get(path);
    if (old && old.body !== body) conflicts.push({ source: path, maps: [old.map, name] });
    if (!old) sources.set(path, { path, body, map: name, original, sha256: hash(body) });
  }
}
if (conflicts.length) throw new Error(`Conflicting original sources: ${JSON.stringify(conflicts)}`);
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) walk(item, visit); return; }
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens', 'errors'].includes(key)) walk(value, visit);
}
function ast(item) {
  try { const tree = parse(item.body, { sourceType: 'unambiguous', plugins: ['typescript', ...(item.path.endsWith('.ts') ? [] : ['jsx']), 'decorators-legacy'], errorRecovery: true });
    for (const e of tree.errors || []) if (!errors.some(x => x.source === item.path && x.error === e.message)) errors.push({ source: item.path, map: item.map, recovered: true, error: e.message });
    return tree; }
  catch (e) { errors.push({ source: item.path, map: item.map, error: e.message }); return null; }
}
for (const item of sources.values()) if (/^src\/lang\/en(?:\/|\.ts)/.test(item.path)) walk(ast(item), n => {
  if (n.type === 'ObjectProperty' && n.value.type === 'StringLiteral' && ['StringLiteral', 'Identifier'].includes(n.key.type)) english.set(n.key.value || n.key.name, n.value.value);
});
const classify = path => {
  if (/pages\/devices\/components\/(input|st2110|sdi-matrix)|components\/common\/(compatibility-mode|edid-export|hdr-setting|input-gain)/.test(path)) return 'inputs';
  if (/pages\/devices\/components\/output/.test(path)) return 'outputs';
  if (/pages\/devices/.test(path)) return 'device';
  if (/pages\/(screen1|adjust|CTL-fix|processing)/.test(path)) return 'screens';
  if (/pages\/(editor1|preset1)/.test(path)) return 'programming';
  if (/pages\/mvr/.test(path)) return 'mvr';
  if (/pages\/audio-matrix/.test(path)) return 'audio';
  if (/pages\/(engineering|maintain|device-upgrade|device-setting|external-setting|virtual-console|companion-manage|user-mode|user-manual|monitor|backup|link-source|screen-control|controller-presets)|components\/(base\/layout|common\/(project|LayoutHeader))|config\/(router|topMenu)/.test(path)) return 'global';
  if (/^src\/components\//.test(path)) return 'shared';
  return null;
};
const groups = new Map(), modules = [], skipped = [];
for (const item of [...sources.values()].sort((a, b) => a.path.localeCompare(b.path))) {
  const tab = classify(item.path), record = { source: item.path, map: item.map, sha256: item.sha256, lines: item.body.split('\n').length, tab };
  modules.push(record); if (!tab || !/\.[jt]sx?$/.test(item.path)) continue;
  const tree = ast(item); if (!tree) continue;
  const labels = [], controls = [], imports = [], gates = [];
  walk(tree, n => {
    if (n.type === 'ImportDeclaration') imports.push({ module: n.source.value, names: n.specifiers.map(s => s.imported?.name || s.local?.name), line: n.loc.start.line });
    if (n.type === 'ObjectProperty' && ['id', 'label', 'title', 'header', 'localeKey', 'text', 'name'].includes(n.key.name || n.key.value) && n.value.type === 'StringLiteral') {
      const id = n.value.value; if (english.has(id)) labels.push({ id, label: english.get(id), line: n.loc.start.line });
    }
    if (n.type === 'JSXOpeningElement') {
      const name = n.name.name || (n.name.type === 'JSXMemberExpression' ? `${n.name.object.name}.${n.name.property.name}` : '');
      if (/^[A-Z]/.test(name) && !['React.Fragment', 'Divider', 'Tooltip', 'Space', 'Spin'].includes(name)) controls.push({ component: name, line: n.loc.start.line });
      for (const a of n.attributes) if (a.name?.name === 'id' && a.value?.type === 'StringLiteral' && english.has(a.value.value)) labels.push({ id: a.value.value, label: english.get(a.value.value), line: a.loc.start.line });
    }
  });
  for (const [i, line] of item.body.split('\n').entries()) if (/\b(Support|Editable|disabled|isSupport\w*|support\w*)\b/.test(line) && !/^\s*(\/\/|\*|import )/.test(line)) gates.push({ line: i + 1, expression: line.trim().slice(0, 220) });
  // A file with only commented placeholders must not become a claimed UI feature.
  if (!controls.length && !labels.length && !imports.some(i => i.module.startsWith('@/api/'))) { skipped.push(item.path); continue; }
  if (!groups.has(tab)) groups.set(tab, []);
  groups.get(tab).push({ ...record, labels, controls, apiImports: imports.filter(i => i.module.startsWith('@/api/')), imports: imports.filter(i => !i.module.startsWith('@/api/') && i.module.startsWith('@/')), gates });
}
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
const save = async (name, value) => writeFile(join(output, name), '{\n' + Object.entries(value).map(([key, item]) => `  ${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(',\n') + '\n}\n');
const chunks = async (prefix, rows) => {
  const files = [];
  for (let i = 0; i < rows.length; i += 80) {
    const file = `${prefix}-${String(i / 80 + 1).padStart(2, '0')}.json`;
    await writeFile(join(output, file), '[\n' + rows.slice(i, i + 80).map(row => JSON.stringify(row)).join(',\n') + '\n]\n'); files.push(file);
  }
  return files;
};
const tabs = {};
for (const [name, rows] of groups) tabs[name] = { files: await chunks(name, rows), modules: rows.length,
  labelReferences: rows.reduce((n, r) => n + r.labels.length, 0), controlReferences: rows.reduce((n, r) => n + r.controls.length, 0) };
await save('index.json', { format: 'pixelflow-source-census', version: 1, sourceMaps: maps, sourceCount: sources.size,
  sourceIndex: await chunks('sources', modules), tabs, parserErrors: errors, excludedEmptyModules: skipped.length,
  warning: 'Static source evidence, not a claim all controls render on a P20 or that Studio implements them. Comments are not parsed as controls; gates are candidate expressions and require review. See the reviewed feature matrix.' });
console.log(JSON.stringify({ sourceCount: sources.size, maps: maps.length, tabs, parserErrors: errors }, null, 2));
