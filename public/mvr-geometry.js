export function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function hasOverlap(layers) {
  return layers.some((layer, i) => layers.slice(i + 1).some((other) => layer.screenId === other.screenId && overlaps(layer.window, other.window)));
}

export function canPlace(layer, window, layers) {
  return !layers.some((other) => other.id !== layer.id && other.screenId === layer.screenId && overlaps(window, other.window));
}

export function ratioSize(ratio, maxWidth, maxHeight, desiredWidth = maxWidth) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  let width = Math.min(Math.round(desiredWidth), Math.floor(maxWidth));
  let height = Math.round(width / ratio);
  if (height > maxHeight) { height = Math.floor(maxHeight); width = Math.round(height * ratio); }
  if (width < 64 || height < 64 || width > maxWidth || height > maxHeight) return null;
  return { width, height };
}

function nearbySpace(layer, size, layers, screen) {
  const wantedX = layer.window.x + (layer.window.width - size.width) / 2;
  const wantedY = layer.window.y + (layer.window.height - size.height) / 2;
  const xs = [wantedX, 0, screen.width - size.width], ys = [wantedY, 0, screen.height - size.height];
  for (const other of layers.filter((other) => other.id !== layer.id && other.screenId === layer.screenId)) {
    xs.push(other.window.x - size.width, other.window.x + other.window.width);
    ys.push(other.window.y - size.height, other.window.y + other.window.height);
  }
  const candidates = xs.flatMap((x) => ys.map((y) => ({ x: Math.max(0, Math.min(screen.width - size.width, Math.round(x))),
    y: Math.max(0, Math.min(screen.height - size.height, Math.round(y))), ...size })));
  candidates.sort((a, b) => (a.x - wantedX) ** 2 + (a.y - wantedY) ** 2 - (b.x - wantedX) ** 2 - (b.y - wantedY) ** 2);
  return candidates.find((window) => canPlace(layer, window, layers)) || null;
}

export function orderGeometryChanges(layers, changes) {
  const current = structuredClone(layers), pending = [...changes], ordered = [];
  while (pending.length) {
    const index = pending.findIndex((change) => canPlace(current.find((layer) => layer.id === change.id), change.window, current));
    if (index < 0) throw new Error('These moves would overlap during application. Move one window into free space and apply before swapping positions.');
    const [next] = pending.splice(index, 1); current.find((layer) => layer.id === next.id).window = next.window; ordered.push(next);
  }
  return ordered;
}

export function fixAspectRatios(layers, signals, screen) {
  if (hasOverlap(layers)) throw new Error('Resolve the existing window overlaps before fixing aspect ratios.');
  const result = structuredClone(layers), fixed = [], skipped = [], needsSpace = [];
  for (const layer of result) {
    const signal = signals.find((signal) => signal.id === layer.sourceId);
    if (layer.sourceType !== 2 || !signal?.connected || !signal.width || !signal.height) {
      skipped.push({ id: layer.id, reason: 'No connected direct-input signal' }); continue;
    }
    const ratio = signal.width / signal.height, size = ratioSize(ratio, layer.window.width, layer.window.height);
    if (!size) { needsSpace.push({ layer, ratio }); continue; }
    layer.window = { x: layer.window.x + Math.floor((layer.window.width - size.width) / 2),
      y: layer.window.y + Math.floor((layer.window.height - size.height) / 2), ...size };
    layer.aspectLock = ratio; layer.aspectMode = 8; fixed.push(layer.id);
  }
  // First shrink ordinary fits, then use any freed space for minimum-size fits.
  for (const { layer, ratio } of needsSpace) {
    const size = screen && ratioSize(ratio, screen.width, screen.height, Math.max(64, Math.ceil(64 * ratio)));
    const window = size && nearbySpace(layer, size, result, screen);
    if (!window) { skipped.push({ id: layer.id, reason: 'No free space for this ratio at the 64 px minimum' }); continue; }
    layer.window = window; layer.aspectLock = ratio; layer.aspectMode = 8; fixed.push(layer.id);
  }
  if (hasOverlap(result)) throw new Error('A non-overlapping aspect correction could not be found.');
  return { layers: result, fixed, skipped };
}
