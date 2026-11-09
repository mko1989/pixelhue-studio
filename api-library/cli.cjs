#!/usr/bin/env node
const api = require('./index.cjs');
const [command = 'help', ...args] = process.argv.slice(2), positional = [], options = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
  const [name, supplied] = args[i].slice(2).split('=');
  const value = supplied ?? (name === 'manual' ? true : args[++i]);
  options[name === 'scope' ? 'serverKind' : name] = ['limit', 'offset'].includes(name) ? Number(value) : value;
}
try {
  let result;
  if (command === 'search') result = api.searchEndpoints(positional.join(' '), options);
  else if (command === 'list') result = api.listEndpoints(options);
  else if (command === 'show') {
    result = api.getEndpoint(positional.join(' '));
    if (options.manual) {
      const pages = new Set(result.manualSections.flatMap(s => Array.from({ length: s.lastPage - s.firstPage + 1 }, (_, i) => s.firstPage + i)));
      result.manualPages = [...pages].map(api.getManualPage);
    }
  } else if (command === 'types') result = api.searchTypes(positional.join(' '), options);
  else if (command === 'type') result = api.getType(positional[0]);
  else if (command === 'manual') result = api.getManualPage(Number(positional[0]));
  else if (command === 'auth') result = api.getAuthentication();
  else if (command === 'enums') result = api.getEnums();
  else if (command === 'stats') result = api.getCatalog();
  else if (command === 'unresolved') result = api.searchUnresolved(positional.join(' '), options);
  else if (command === 'help') result = { usage: [
    'pixelhue-api search "MVR window" --method PUT --limit 10',
    'pixelhue-api list --group node --model P20 --offset 0 --limit 50',
    'pixelhue-api show put-layers-window', 'pixelhue-api show "GET /unico/v1/screen/list-detail" --manual',
    'pixelhue-api types IMVRLayerUMDRequestType', 'pixelhue-api type IMVRLayerUMDRequestType',
    'pixelhue-api manual 178', 'pixelhue-api auth', 'pixelhue-api enums', 'pixelhue-api stats', 'pixelhue-api unresolved'],
    notes: ['All output is JSON. All commands are offline.', 'Model filters reflect documented/configured scope, not guaranteed firmware support.'] };
  else throw new Error(`Unknown command: ${command}`);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) { process.stderr.write(JSON.stringify({ error: error.message }) + '\n'); process.exitCode = 1; }
