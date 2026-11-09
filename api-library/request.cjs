const { isIP } = require('node:net');

function buildRequest(endpoint, options = {}) {
  const { host, token, query = {}, body, pathParameters = {} } = options;
  if (typeof host !== 'string' || (!isIP(host) && !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))) throw new Error('Supply a host/IP without scheme, port, credentials or path.');
  const port = options.apiPort ?? endpoint.defaultPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Supply apiPort 1–65535; controller/keyboard ports are not inferred.');
  const protocol = options.protocol ?? endpoint.protocol;
  if (!['http', 'https'].includes(protocol)) throw new Error('Protocol must be http or https.');
  if (endpoint.authentication !== 'none' && (typeof token !== 'string' || !token || /[\r\n]/.test(token))) throw new Error('Supply the raw authentication token; consult getAuthentication().');
  const path = endpoint.path.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = pathParameters[key];
    if (value === undefined || value === null) throw new Error(`Missing path parameter: ${key}`);
    if (['.', '..'].includes(String(value))) throw new Error(`Invalid path parameter: ${key}`);
    return encodeURIComponent(String(value));
  });
  const url = new URL(`${protocol}://${isIP(host) === 6 ? `[${host}]` : host}:${port}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!['string', 'number', 'boolean'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) throw new Error(`Query ${key} must be a scalar or array of scalars.`);
      url.searchParams.append(key, String(item));
    }
  }
  if (['GET', 'HEAD'].includes(endpoint.method) && body !== undefined) throw new Error('Use query parameters for GET/HEAD requests.');
  const headers = { Accept: endpoint.responseType === 'text' ? 'application/xml,text/xml,text/plain' : 'application/json' };
  if (token) headers.Authorization = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return { url: url.href, init: { method: endpoint.method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    responseType: endpoint.responseType,
    transportNotes: endpoint.serverKind === 'discovery' ? 'Self-signed HTTPS certificate; configure the transport explicitly if needed.' : null };
}
module.exports = { buildRequest };
