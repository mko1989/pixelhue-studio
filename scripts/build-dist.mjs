import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, writeFile, chmod, rm, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { targets } from '../packaging/targets.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const nodeVersion = 'v22.23.4';
const base = `https://nodejs.org/dist/${nodeVersion}/`;
const dist = join(root, 'dist'), cache = join(root, '.dist-cache', nodeVersion);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else files.push(path);
  }
  return files;
}
await mkdir(dist, { recursive: true }); await mkdir(cache, { recursive: true });
const checksums = (await download(base + 'SHASUMS256.txt')).toString('utf8');
await writeFile(join(cache, 'SHASUMS256.txt'), checksums);
const manifest = { application: 'Pixelhue Studio', version, nodeVersion, targets: [] };
for (const target of targets) {
  const runtimeExtension = target.runtime.startsWith('win-') ? 'zip' : 'tar.gz';
  const runtimeName = `node-${nodeVersion}-${target.runtime}`;
  const runtimeFile = `${runtimeName}.${runtimeExtension}`;
  const expected = checksums.split('\n').map((line) => line.trim().split(/\s+/)).find((line) => line[1] === runtimeFile)?.[0];
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`No official checksum for ${runtimeFile}`);
  const cached = join(cache, runtimeFile);
  let data = await readFile(cached).catch(() => null);
  if (!data || hash(data) !== expected) {
    console.log(`Downloading ${runtimeFile}…`);
    data = await download(base + runtimeFile);
    if (hash(data) !== expected) throw new Error(`Runtime checksum mismatch: ${runtimeFile}`);
    await writeFile(cached, data);
  }
  console.log(`Verified ${runtimeFile}`);
  const unpacked = join(cache, target.runtime);
  await rm(unpacked, { recursive: true, force: true }); await mkdir(unpacked);
  if (runtimeExtension === 'zip') await run('unzip', ['-q', cached, '-d', unpacked]);
  else await run('tar', ['-xzf', cached, '-C', unpacked]);
  const name = `Pixelhue-Studio-${version}-${target.id}`;
  const bundle = join(dist, name);
  await rm(bundle, { recursive: true, force: true });
  await mkdir(join(bundle, 'runtime', target.runtime.startsWith('win-') ? '' : 'bin'), { recursive: true });
  await mkdir(join(bundle, 'app'), { recursive: true });
  for (const path of ['server.js', 'package.json', 'lib', 'public']) await cp(join(root, path), join(bundle, 'app', path), { recursive: true });
  const binary = join(bundle, 'runtime', target.executable);
  await cp(join(unpacked, runtimeName, target.executable), binary);
  await cp(join(unpacked, runtimeName, 'LICENSE'), join(bundle, 'runtime', 'LICENSE'));
  await chmod(binary, 0o755);
  await cp(join(root, 'packaging', 'launch.mjs'), join(bundle, 'launch.mjs'));
  const windows = target.runtime.startsWith('win-');
  const launcher = await readFile(join(root, 'packaging', windows ? 'start-windows.cmd' : 'start-unix.sh'), 'utf8');
  await writeFile(join(bundle, target.launcher), windows ? launcher.replace(/\r?\n/g, '\r\n') : launcher, { mode: 0o755 });
  await writeFile(join(bundle, 'README.txt'), (await readFile(join(root, 'packaging', 'README.txt'), 'utf8')).replaceAll('__VERSION__', version));
  const applicationFiles = [];
  for (const path of (await filesIn(join(bundle, 'app'))).sort()) applicationFiles.push({ path: relative(bundle, path).split('\\').join('/'), sha256: hash(await readFile(path)) });
  await writeFile(join(bundle, 'build-info.json'), JSON.stringify({ version, target: target.id, nodeVersion,
    runtimeDownload: base + runtimeFile, runtimeArchiveSha256: expected, applicationFiles }, null, 2) + '\n');
  const archive = `${name}.${target.format}`, archivePath = join(dist, archive);
  await rm(archivePath, { force: true });
  if (target.format === 'zip') await run('zip', ['-q', '-r', '-X', archivePath, name], { cwd: dist, maxBuffer: 1024 * 1024 });
  else await run('tar', ['-czf', archivePath, name], { cwd: dist, env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const archiveHash = hash(await readFile(archivePath));
  manifest.targets.push({ target: target.id, label: target.label, archive, bytes: (await stat(archivePath)).size, sha256: archiveHash,
    nodeRuntimeArchive: runtimeFile, runtimeArchiveSha256: expected });
  console.log(`Prepared ${archive}`);
}
await writeFile(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(dist, 'SHASUMS256.txt'), manifest.targets.map((target) => `${target.sha256}  ${target.archive}`).join('\n') + '\n');
await writeFile(join(dist, 'README.md'), '# Pixelhue Studio distributions\n\nExtract an archive and run the launcher in its folder. Node.js is bundled.\n\n' +
  manifest.targets.map((target) => `- [${target.label}](${target.archive})`).join('\n') + '\n\nRaspberry Pi: choose the archive matching your OS bitness (`getconf LONG_BIT`). Extract it and run `./"Start Pixelhue Studio.sh"`. For headless access: `HOST=0.0.0.0 PIXELHUE_NO_BROWSER=1 ./"Start Pixelhue Studio.sh"`, then open the Pi\'s IP with the printed port from another computer. Raspberry Pi OS Bullseye or newer; ARMv7 or ARM64 CPU, no ARMv6 build.\n\nSee each bundle\'s README.txt for usage and verification limits. Checksums: SHASUMS256.txt.\n');
console.log(`Done: ${dist}`);
