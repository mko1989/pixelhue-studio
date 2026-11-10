import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { targets, nativeTarget } from '../packaging/targets.mjs';

const run = promisify(execFile), root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist');
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const native = nativeTarget();
assert.deepEqual(manifest.targets.map(t => t.target).sort(), targets.map(t => t.id).sort(), 'all configured distribution targets must be present exactly once');
const checks = [];
for (const target of manifest.targets) {
  const definition = targets.find(t => t.id === target.target);
  const archive = join(dist, target.archive), name = target.archive.replace(/\.(zip|tar\.gz)$/, ''), bundle = join(dist, name);
  assert.equal(sha(await readFile(archive)), target.sha256, `${target.target} archive checksum`);
  const info = JSON.parse(await readFile(join(bundle, 'build-info.json'), 'utf8'));
  assert.equal(info.runtimeArchiveSha256, target.runtimeArchiveSha256);
  for (const file of info.applicationFiles) {
    assert.equal(sha(await readFile(join(bundle, file.path))), file.sha256);
    assert.equal(sha(await readFile(join(root, file.path.replace(/^app\//, '')))), file.sha256, 'distribution must match current source');
  }
  const binary = join(bundle, 'runtime', definition.executable);
  const format = (await run('file', [binary])).stdout;
  assert.match(format, definition.binaryFormat);
  const listing = target.archive.endsWith('.zip') ? (await run('unzip', ['-Z1', archive])).stdout : (await run('tar', ['-tzf', archive])).stdout;
  const launcher = definition.launcher;
  if (target.target !== 'windows-x64') for (const path of [binary, join(bundle, launcher)]) assert.ok((await stat(path)).mode & 0o111, 'Unix runtime and launcher must be executable');
  assert.ok(listing.includes(`${name}/app/server.js`)); assert.ok(listing.includes(`${name}/runtime/LICENSE`));
  assert.ok(listing.includes(`${name}/${launcher}`)); assert.ok(listing.includes(`${name}/app/public/index.html`));
  for (const fontFile of ['Rewir-Light.woff', 'Rewir-Light.ttf', 'OFL.txt', 'README.txt']) assert.ok(listing.includes(`${name}/app/public/fonts/${fontFile}`));
  assert.ok(!listing.split('\n').some((entry) => entry.split('/').includes('..')));
  checks.push({ target: target.target, checksum: 'pass', sourceHashes: 'pass', binaryFormat: format.trim().split(': ').slice(1).join(': '), archiveContents: 'pass' });
  console.log(`Verified ${target.target}: checksum, source, architecture and archive contents`);
  if (target.target !== native) continue;
  const temp = await mkdtemp(join(tmpdir(), 'pixelhue-dist-'));
  let child;
  try {
    if (target.archive.endsWith('.zip')) await run('unzip', ['-q', archive, '-d', temp]);
    else await run('tar', ['-xzf', archive, '-C', temp]);
    const extracted = join(temp, name), runtime = join(extracted, 'runtime', target.target === 'windows-x64' ? 'node.exe' : 'bin/node');
    assert.equal((await run(runtime, ['--version'])).stdout.trim(), manifest.nodeVersion);
    const ready = new Promise((resolveReady, reject) => {
      child = spawn(target.target === 'windows-x64' ? 'cmd.exe' : '/bin/sh', target.target === 'windows-x64' ? ['/c', join(extracted, launcher)] : [join(extracted, launcher)],
        { cwd: temp, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', PIXELHUE_NO_BROWSER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const timer = setTimeout(() => reject(new Error('Native launcher did not become ready.')), 15000);
      child.stdout.on('data', (data) => { output += data; const match = output.match(/Pixelhue Studio: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolveReady(match[1]); } });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Launcher exited before readiness (${code}): ${output}`)); });
    });
    const url = await ready;
    const response = await fetch(url); assert.equal(response.status, 200); assert.match(await response.text(), /Pixelhue Studio/);
    assert.equal((await fetch(`${url}/inputs.js`)).status, 200);
    assert.equal((await fetch(`${url}/program-sync.js`)).status, 200);
    const font = await fetch(`${url}/fonts/Rewir-Light.woff`);
    assert.equal(font.status, 200); assert.equal(font.headers.get('content-type'), 'font/woff');
    assert.equal(sha(Buffer.from(await font.arrayBuffer())), sha(await readFile(join(root, 'public/fonts/Rewir-Light.woff'))));
    assert.match(await (await fetch(`${url}/fonts/OFL.txt`)).text(), /SIL OPEN FONT LICENSE Version 1.1/);
    assert.equal((await fetch(`${url}/api/state`)).status, 409);
    checks.at(-1).nativeLauncher = 'pass'; console.log(`Native extracted ${target.target} launcher/runtime/HTTP smoke passed`);
  } finally {
    if (child && child.exitCode === null) { const stopped = new Promise((resolveStop) => child.once('exit', resolveStop)); child.kill('SIGTERM'); await stopped; }
    await rm(temp, { recursive: true, force: true });
  }
}
await writeFile(join(dist, 'verification.json'), JSON.stringify({ nativeTarget: native, checks,
  notExecutedTargets: manifest.targets.filter((target) => target.target !== native).map((target) => target.target) }, null, 2) + '\n');
