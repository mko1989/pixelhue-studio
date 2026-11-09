export const propertyName = (node) => node?.name ?? node?.value;
export const properties = (node) => Object.fromEntries((node?.properties || [])
  .filter((p) => p.type === 'ObjectProperty').map((p) => [propertyName(p.key), p.value]));
export const code = (node, source) => node ? source.slice(node.start, node.end) : null;

export function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object' || !node.type) return;
  visit(node, parents);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) for (const child of value) walk(child, visit, [...parents, node]);
    else if (value && typeof value === 'object') walk(value, visit, [...parents, node]);
  }
}

export function stringValue(node, source) {
  if (node?.type === 'StringLiteral') return { path: node.value, dynamic: false };
  if (node?.type === 'TemplateLiteral') {
    const parameters = [];
    const path = node.quasis.map((part, i) => {
      if (i >= node.expressions.length) return part.value.cooked;
      let key = code(node.expressions[i], source);
      if (!/^[a-zA-Z_$][\w$]*$/.test(key)) key = `expression${i + 1}`;
      parameters.push({ name: key, expression: code(node.expressions[i], source) });
      return part.value.cooked + `{${key}}`;
    }).join('');
    return { path, dynamic: parameters.length > 0, pathParameters: parameters };
  }
  return null;
}

export function requestObservation(node, parents, source, file) {
  const opts = properties(node.arguments[0]);
  const methodName = propertyName(node.callee.property)?.toLowerCase();
  let method, route, data, params, headers;
  if (methodName === 'request' && opts.url) {
    method = opts.method?.value?.toUpperCase(); route = stringValue(opts.url, source);
    data = opts.data; params = opts.params; headers = opts.headers;
  } else if (['get', 'put', 'post', 'delete', 'patch'].includes(methodName)) {
    method = methodName.toUpperCase(); route = stringValue(node.arguments[0], source);
    const getOptions = properties(node.arguments[1]);
    data = ['GET', 'DELETE'].includes(method) ? getOptions.data : node.arguments[1];
    params = getOptions.params; headers = getOptions.headers;
  } else return null;
  if (!route || !method) return { unresolved: true, source: file, line: node.loc.start.line,
    expression: code(node, source), reason: 'URL or HTTP method requires runtime evaluation' };
  const fn = parents.findLast((p) => /Function|Method/.test(p.type));
  const variable = parents.findLast((p) => p.type === 'VariableDeclarator');
  const enclosing = fn || node;
  const comments = [...parents, node].flatMap((p) => p.leadingComments || []).map((c) => c.value.trim());
  return { method, ...route, source: file, line: node.loc.start.line,
    client: code(node.callee.object, source),
    symbol: fn?.id?.name || propertyName(fn?.key) || variable?.id?.name || null,
    comment: [...new Set(comments)].join('\n'),
    parameters: (fn?.params || []).map((p) => code(p, source)),
    bodyExpression: code(data, source), queryExpression: code(params, source), headerExpression: code(headers, source),
    configExpression: code(node.arguments[0], source),
    context: source.slice(enclosing.start, Math.min(enclosing.end, enclosing.start + 700)).split('\n').slice(0, 8).join('\n') };
}
