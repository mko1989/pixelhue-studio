import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { sourceFiles } from './check-max-file-lines.js';

const root = new URL('../../', import.meta.url);
for (const file of (await sourceFiles()).filter(path => path.endsWith('.js') && path.includes('/public/'))) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const html = await readFile(new URL('public/index.html', root), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/([^"]+)"/g)) await access(new URL(`public/${match[1]}`, root));
await access(new URL('public/fonts/OFL.txt', root));
console.log('Client modules, HTML assets and embedded font license verified. Static client needs no compilation.');
