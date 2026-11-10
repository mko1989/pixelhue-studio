import { readFile, readdir, writeFile } from 'node:fs/promises';
const root = new URL('../../docs/pixelflow-parity/', import.meta.url);
const escape = s => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
for (const file of (await readdir(new URL('features/', root))).filter(f => f.endsWith('.json')).sort()) {
  const tab = file.slice(0, -5), rows = JSON.parse(await readFile(new URL(`features/${file}`, root), 'utf8'));
  const text = [`# PixelFlow ${tab} inventory`, '', '[Audit overview](README.md) · Reviewed records: [JSON](features/' + file + ')', '',
    'Feature groups, including device-gated controls. “Implemented” means the listed Studio surface exists, not hardware certification on every product. “Partial” lists the remaining work. Use the source reader below to inspect evidence; original files are embedded in the named source maps.', ''];
  for (const row of rows) text.push(`## ${row.id} · ${row.feature}`, '',
    `**Studio: ${row.status}. Placement: ${row.placement}.**`, '', row.controls.join('; ') + '.', '',
    `Availability: ${row.availability}`, '', ...(row.note ? [row.note, ''] : []),
    ...row.evidence.map(e => `PixelFlow: \`${e.source}:${e.line}\` in \`${e.map}\`.`), '',
    ...(row.studioEvidence.length ? [`Studio: ${row.studioEvidence.map(p => `\`${p}\``).join(', ')}.`, ''] : []));
  await writeFile(new URL(`${tab}.md`, root), text.join('\n').trimEnd() + '\n');
}
