import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url), base = new URL('docs/pixelflow-parity/', root);
const json = async path => JSON.parse(await readFile(new URL(path, base), 'utf8'));

test('PixelFlow inventory has valid unique source evidence, stable feature IDs and real Studio references', async () => {
  const index = await json('census/index.json'), modules = (await Promise.all(index.sourceIndex.map(p => json(`census/${p}`)))).flat();
  assert.equal(new Set(modules.map(m => m.source)).size, index.sourceCount);
  assert.ok(index.sourceCount >= 3000); assert.equal(index.parserErrors.length, 0);
  const sourceMap = new Map(modules.map(m => [m.source, m])), ids = new Set(); let features = 0;
  for (const file of await readdir(new URL('features/', base))) {
    const rows = await json(`features/${file}`); assert.ok(rows.length);
    const report = await readFile(new URL(file.replace('.json', '.md'), base), 'utf8');
    for (const row of rows) {
      assert.ok(!ids.has(row.id)); ids.add(row.id); features++;
      assert.ok(['implemented', 'partial', 'missing', 'excluded', 'not-rendered'].includes(row.status));
      assert.ok(row.controls.length && row.availability && row.placement && row.evidence.length);
      if (['implemented', 'partial'].includes(row.status)) assert.ok(row.studioEvidence.length, row.id);
      for (const path of row.studioEvidence) await access(new URL(path, root));
      for (const e of row.evidence) {
        const module = sourceMap.get(e.source); assert.ok(module, e.source);
        assert.equal(module.map, e.map); assert.ok(e.line > 0 && e.line <= module.lines);
        assert.match(module.sha256, /^[0-9a-f]{64}$/);
      }
      assert.ok(report.includes(row.id), `Report is stale: ${row.id}`);
    }
  }
  assert.equal(features, 123); // 121 from WO-032 plus AUDIO-04/05 found in WO-036
});
test('census reference counts match chunks and commented placeholders are not advertised as controls', async () => {
  const index = await json('census/index.json');
  for (const [tab, group] of Object.entries(index.tabs)) {
    const modules = (await Promise.all(group.files.map(p => json(`census/${p}`)))).flat();
    assert.equal(modules.length, group.modules);
    assert.equal(modules.reduce((n, m) => n + m.labels.length, 0), group.labelReferences);
    assert.equal(modules.reduce((n, m) => n + m.controls.length, 0), group.controlReferences);
    assert.ok(modules.every(m => m.tab === tab));
    const placeholder = modules.find(m => m.source.endsWith('output-advanced-attr/index.tsx'));
    if (placeholder) assert.equal(placeholder.controls.length, 0);
  }
  const output = await json('features/outputs.json');
  assert.equal(output.find(r => r.feature === 'Rotation placeholder').status, 'not-rendered');
  assert.equal((await json('features/programming.json')).filter(r => r.status === 'excluded').length, 1);
});
