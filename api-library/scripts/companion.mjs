import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { properties, propertyName, code, walk } from './ast.mjs';

export async function companionObservations(root, parse) {
  const configurations = new Map();
  const types = [];
  for (const file of (await readdir(join(root, 'src/interfaces'))).filter(f => f.endsWith('.ts')).sort()) {
    const text = await readFile(join(root, 'src/interfaces', file), 'utf8');
    walk(parse(text, { sourceType: 'module', plugins: ['typescript'] }), node => {
      if (['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSEnumDeclaration'].includes(node.type) && node.id) {
        types.push({ name: node.id.name, kind: node.type, source: `Companion/src/interfaces/${file}`,
          line: node.loc.start.line, declaration: code(node, text) });
      }
    });
  }
  for (const file of (await readdir(join(root, 'src/config/devices'))).filter((f) => f.endsWith('.ts')).sort()) {
    const text = await readFile(join(root, 'src/config/devices', file), 'utf8'), endpoints = new Map();
    const ast = parse(text, { sourceType: 'module', plugins: ['typescript'] });
    const flatten = (node, keys = []) => {
      for (const [key, value] of Object.entries(properties(node))) {
        if (value.type === 'StringLiteral') endpoints.set([...keys, key].join('.'), value.value);
        else if (value.type === 'ObjectExpression') flatten(value, [...keys, key]);
      }
    };
    walk(ast, (node) => { if (node.type === 'ObjectProperty' && propertyName(node.key) === 'endpoints') flatten(node.value); });
    configurations.set(file.replace('.ts', ''), endpoints);
  }
  const file = 'src/services/ApiClient.ts', text = await readFile(join(root, file), 'utf8');
  const observations = [];
  walk(parse(text, { sourceType: 'module', plugins: ['typescript'] }), (node, parents) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
    const method = propertyName(node.callee.property)?.toUpperCase();
    if (!['GET', 'PUT', 'POST', 'DELETE'].includes(method) || !code(node.callee.object, text)?.includes('this.http')) return;
    const key = code(node.arguments[0], text)?.match(/^this\.cfg\.endpoints\.(.+)$/)?.[1];
    if (!key) return;
    const fn = parents.findLast((p) => p.type === 'ClassMethod');
    for (const [model, endpoints] of configurations) {
      const path = endpoints.get(key);
      if (!path) continue;
      observations.push({ method, path, source: 'Companion/' + file, line: node.loc.start.line,
        symbol: propertyName(fn?.key), model, endpointKey: key,
        bodyExpression: method === 'GET' ? null : code(node.arguments[1], text),
        queryExpression: method === 'GET' ? code(node.arguments[1], text) : null,
        context: fn ? text.slice(fn.start, Math.min(fn.end, fn.start + 1800)) : code(node, text) });
    }
  });
  return { observations, models: [...configurations.keys()], types };
}
