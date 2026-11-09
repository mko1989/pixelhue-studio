import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const excluded = new Set(['.git', '.dist-cache', 'dist', 'node_modules']);
const extensions = new Set(['.js', '.mjs', '.cjs', '.css', '.html']);
export async function sourceFiles(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (extensions.has(extname(path))) files.push(path);
  }
  return files.sort();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await sourceFiles(), failures = [];
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    const count = source.split('\n').length - Number(source.endsWith('\n'));
    if (count > 500) failures.push(`${path.slice(root.length)}: ${count} lines (maximum 500)`);
  }
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log(`Source size check passed: ${files.length} files, all at most 500 lines.`);
}
