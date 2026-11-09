import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function manualObservations(directory) {
  const pages = [];
  for (const file of (await readdir(directory)).filter((f) => /^\d+\.json$/.test(f)).sort()) {
    pages.push(JSON.parse(await readFile(join(directory, file), 'utf8')));
  }
  let text = '', offsets = [];
  for (const page of pages) { offsets.push({ offset: text.length, page: page.page }); text += page.text + '\n'; }
  const pageAt = (offset) => offsets.findLast((p) => p.offset <= offset)?.page;
  const sections = [...text.matchAll(/Path:\s*([^\n]+)\s+Method:\s*(GET|PUT|POST|DELETE|PATCH)/g)];
  return sections.map((m, i) => {
    const prefix = text.slice(Math.max(0, m.index - 450), m.index);
    const title = [...prefix.matchAll(/^(\d+(?:\.\d+)+)\s+(.+)$/gm)].at(-1);
    const section = title?.[1] ?? null;
    const nextOffset = sections[i + 1]?.index ?? text.length;
    return { method: m[2], path: m[1].replace(/\s+/g, ''), section,
      title: title?.[2]?.trim() || m[1].trim(), firstPage: pageAt(m.index), lastPage: pageAt(nextOffset - 1),
      firmware: section && /^(4|6)\.1(?:\.|$)/.test(section) ? '<1.7.0' : section && /^(4|6)\.2(?:\.|$)/.test(section) ? '>=1.7.0' : 'not specified per operation',
      modelScope: ['P10', 'P20', 'Q8', 'P80'],
      source: 'PixelFlow-OpenAPI Manual-V2.0.1-2.pdf' };
  });
}
