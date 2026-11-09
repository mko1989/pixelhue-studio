import { readFile, readdir } from 'node:fs/promises';
import { join, basename, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { walk, code, requestObservation } from './ast.mjs';

export async function vendorObservations(directory, parse) {
  const sources = new Map(), maps = [];
  for (const file of (await readdir(directory)).filter((f) => f.endsWith('.js.map')).sort()) {
    const bytes = await readFile(join(directory, file)), map = JSON.parse(bytes);
    let used = false;
    for (let i = 0; i < map.sources.length; i++) {
      const source = map.sources[i], text = map.sourcesContent?.[i];
      if (!text || !source.includes('/src/')) continue;
      const name = 'src/' + source.split('/src/')[1];
      if (sources.has(name)) continue;
      sources.set(name, { source: name, text, sourceMap: basename(file) }); used = true;
    }
    if (used) maps.push({ file: basename(file), sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const observations = [], unresolved = [], types = [], typeReferences = [];
  const selected = [...sources.values()].filter((s) => s.source.startsWith('src/api/'));
  for (const source of selected) {
    const ast = parse(source.text, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    walk(ast, (node, parents) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
      if (!/^(API|API_U_CENTER|API_NO_TIMEOUT|SplicerAPIInstance|THIRD_API)$/.test(code(node.callee.object, source.text))) return;
      const record = requestObservation(node, parents, source.text, source.source);
      if (!record) return;
      record.sourceMap = source.sourceMap;
      (record.unresolved ? unresolved : observations).push(record);
    });
  }
  // Include DTO modules imported by API wrappers, then follow their local imports.
  const visited = new Set(), queue = [...selected];
  while (queue.length) {
    const source = queue.shift();
    if (visited.has(source.source)) continue;
    visited.add(source.source);
    const ast = parse(source.text, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    walk(ast, (node) => {
      if (node.type === 'TSTypeReference') typeReferences.push({ name: code(node.typeName, source.text), source: source.source, line: node.loc.start.line });
      if (['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSEnumDeclaration'].includes(node.type) && node.id) {
        types.push({ name: node.id.name, kind: node.type, source: source.source, sourceMap: source.sourceMap,
          line: node.loc.start.line, declaration: code(node, source.text) });
      }
      if (node.type !== 'ImportDeclaration') return;
      const path = node.source.value;
      if (!path.startsWith('@/') && !path.startsWith('.')) return;
      const key = path.startsWith('@/') ? 'src/' + path.slice(2) : posix.normalize(posix.join(posix.dirname(source.source), path));
      const imported = sources.get(key) || sources.get(key + '.ts') || sources.get(key + '.tsx') || sources.get(key + '/index.ts');
      if (imported && (node.importKind === 'type' || /typing|types?|enum/i.test(key))) queue.push(imported);
    });
  }
  return { observations, unresolved, types, typeReferences, sources: selected.map(({ source, sourceMap }) => ({ source, sourceMap })), maps };
}
