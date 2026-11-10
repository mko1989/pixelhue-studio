import { spawnSync } from 'node:child_process';
import { sourceFiles } from './check-max-file-lines.js';

// Keep this list explicit so a new regression test cannot silently miss CI.
const FILES = [
  'test/capacity-policy.test.js', 'test/device.test.js', 'test/editor.test.js',
  'test/inputs.test.js', 'test/multi-model.test.js', 'test/mvr-aspect.test.js',
  'test/mvr-repeat-apply.test.js', 'test/mvr-screen-umd.test.js',
  'test/mvr-sync.test.js', 'test/q8.test.js', 'test/studio-client.test.js', 'test/device-maintenance.test.js', 'test/programming-presets.test.js', 'test/mvr-layers.test.js', 'test/layer-groups.test.js', 'test/gallery-sources.test.js', 'test/mvr-input-limit.test.js',
  'api-library/test/catalog.test.cjs',
  'test/program-live.test.js',
  'test/drop-aspect.test.js', 'test/input-advanced.test.js', 'test/pixelflow-audit.test.js',
];
const root = new URL('../../', import.meta.url);
const missing = (await sourceFiles()).filter(path => /\.test\.[cm]?js$/.test(path))
  .filter(path => !FILES.some(file => path.endsWith(`/${file}`)));
if (missing.length) throw new Error(`Add new tests to FILES: ${missing.join(', ')}`);
const result = spawnSync(process.execPath, ['--test', ...FILES], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
