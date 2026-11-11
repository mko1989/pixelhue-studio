import { configuration, xmlFile, xmlTree, child } from './configuration.js';
import { find } from './interface-config.js';
import { fail } from './pixelhue.js';
import { integer, choice } from './studio-common.js';

// Screen test pattern and colour (WO-037). PixelFlow: PUT screen/test-pattern [{ screenId, testPattern }] and
// PUT screen/image-quality [{ screenId, imageQuality }] with the whole object. Options come from screen_<type>.xml.
const LABELS = { 0: 'Black', 1: 'Red', 2: 'Green', 3: 'Blue', 4: 'White', 5: 'Vertical bars', 6: 'Horizontal bars', 7: 'Checkerboard',
  256: 'Gradient → red', 257: 'Gradient → green', 258: 'Gradient → blue', 259: 'Gradient → white', 260: 'Gradient ↓ red', 261: 'Gradient ↓ green', 262: 'Gradient ↓ blue', 263: 'Gradient ↓ white',
  512: 'Horizontal lines', 513: 'Vertical lines', 514: 'Diagonal lines ╲', 515: 'Diagonal lines ╱', 516: 'Grid', 517: 'Diagonal grid' };
const on = node => Boolean(node) && node.attributes.Support === '1' && node.attributes.Editable !== '0';
const enums = node => (node?.children || []).filter(n => n.name === 'Enum').map(n => Number(n.attributes.Value));
export const linePattern = type => type >= 512 && type <= 517; // pixel spacing, line width and speed apply
export const gridPattern = type => (type >= 5 && type <= 7) || (type >= 256 && type <= 263); // gear spacing applies
export async function screenOptions(client) {
  await configuration(client);
  if (client.screenOptionsXml === client.configurationXml && client.screenOptions) return client.screenOptions;
  const result = {};
  for (const type of [2, 4]) {
    const features = find(xmlTree(xmlFile(client.configurationXml, `deviceconfig/device/screen_${type}.xml`)), n => n.name === 'Features');
    const pattern = child(features, 'TestPattern'), quality = child(features, 'ImageQuality'), pixel = child(pattern, 'GridPixel'), width = child(pattern, 'GridLineWidth');
    result[type] = {
      pattern: on(pattern) ? { types: enums(child(pattern, 'Type')).filter(v => LABELS[v]).map(v => [v, LABELS[v]]), bright: enums(child(pattern, 'Bright')), gear: enums(child(pattern, 'GridGear')), speed: enums(child(pattern, 'Speed')),
        pixel: { min: Number(pixel?.attributes.Min ?? 1), max: Number(pixel?.attributes.Max ?? 1024) }, line: { min: Number(width?.attributes.Min ?? 1), max: Number(width?.attributes.Max ?? 64) } } : null,
      quality: on(quality) ? ['Brightness', 'Contrast', 'Hue', 'Saturation'].filter(name => on(child(quality, name))).map(name => name.toLowerCase()) : [] };
  }
  client.screenOptions = result; client.screenOptionsXml = client.configurationXml; return result;
}
export function screenExtras(raw) {
  const t = raw.testPattern, q = raw.imageQuality;
  return { pattern: t ? { enable: t.enable === 1, type: t.type, bright: t.bright, grid: t.grid, lineWidth: t.gridLineWidth, speed: t.speed } : null,
    quality: q ? { brightness: q.brightness?.coefficient ?? 100, contrast: q.contrast?.coefficient ?? 100, hue: q.hue ?? 0, saturation: q.saturation ?? 100 } : null };
}
export async function planScreenExtra(client, request, screen, raw) {
  const options = (await screenOptions(client))[screen.type] || {};
  if (request.action === 'pattern') {
    const limits = options.pattern, old = raw.testPattern, c = request.pattern;
    if (!limits || !old) throw fail('Test patterns are unavailable on this screen.');
    if (!c || typeof c !== 'object' || !Object.keys(c).length || Object.keys(c).some(key => !['enable', 'type', 'bright', 'grid', 'lineWidth', 'speed'].includes(key))) throw fail('Unsupported test pattern setting.');
    const type = c.type === undefined ? old.type : choice(c.type, limits.types.map(t => t[0]), 'test pattern'), line = linePattern(type);
    // The spacing unit follows the pattern: switching between gear and pixel patterns falls back to the XML defaults.
    let grid = c.grid ?? old.grid; const changedUnit = c.grid === undefined && line !== (old.gridType === 1);
    if (changedUnit) grid = line ? 32 : 5;
    if (line) integer(grid, 'Pattern spacing', limits.pixel.min, limits.pixel.max); else if (gridPattern(type)) choice(grid, limits.gear, 'pattern spacing');
    const next = { ...old, enable: c.enable === undefined ? old.enable : choice(c.enable, [true, false], 'pattern state') ? 1 : 0, type,
      bright: c.bright === undefined ? old.bright : choice(c.bright, limits.bright, 'pattern brightness'), grid, gridType: line ? 1 : 0,
      gridLineWidth: c.lineWidth === undefined ? old.gridLineWidth : integer(c.lineWidth, 'Pattern line width', limits.line.min, limits.line.max),
      speed: c.speed === undefined ? old.speed : choice(c.speed, limits.speed, 'pattern speed') };
    if (line) next.verticalGrid = grid; else delete next.verticalGrid; // changeTestPattern.ts: pixel mode carries a vertical spacing
    return { path: 'screen/test-pattern', body: [{ screenId: screen.id, testPattern: next }], timeoutMs: 60000,
      matches: s => s.pattern && s.pattern.enable === (next.enable === 1) && s.pattern.type === next.type && s.pattern.bright === next.bright && s.pattern.grid === next.grid && s.pattern.lineWidth === next.gridLineWidth && s.pattern.speed === next.speed };
  }
  const allowed = options.quality || [], old = raw.imageQuality, c = request.quality;
  if (!allowed.length || !old) throw fail('Colour adjustment is unavailable on this screen.');
  if (!c || typeof c !== 'object' || !Object.keys(c).length || Object.keys(c).some(key => !allowed.includes(key))) throw fail('Unsupported screen colour setting.');
  const next = { ...old };
  if (c.brightness !== undefined) next.brightness = { ...old.brightness, coefficient: integer(c.brightness, 'Brightness', 0, 200) };
  if (c.contrast !== undefined) next.contrast = { ...old.contrast, coefficient: integer(c.contrast, 'Contrast', 0, 200) };
  if (c.hue !== undefined) next.hue = integer(c.hue, 'Hue', -180, 180);
  if (c.saturation !== undefined) next.saturation = integer(c.saturation, 'Saturation', 0, 200);
  return { path: 'screen/image-quality', body: [{ screenId: screen.id, imageQuality: next }], timeoutMs: 20000,
    matches: s => s.quality && Object.entries(c).every(([key, value]) => s.quality[key] === value) };
}
