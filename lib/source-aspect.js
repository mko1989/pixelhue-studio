// Source defaults for normal/program layers. Fit around the existing centre; native lock handles
// sources without usable timing when they acquire a signal. Minimum dimension is 64 pixels.
export function fitSourceWindow(rect, source) {
  if (!(source?.width > 0 && source?.height > 0)) return { ...rect };
  const scale = Math.max(Math.min(rect.width / source.width, rect.height / source.height), 64 / source.width, 64 / source.height);
  const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
  return { x: Math.round(rect.x + (rect.width - width) / 2), y: Math.round(rect.y + (rect.height - height) / 2), width, height };
}
export const sourceAspectMatches = (layer, source) => layer?.aspectLocked && layer.aspectMode === 8 &&
  (!(source?.width > 0 && source?.height > 0) || Math.abs(layer.window.height - layer.window.width * source.height / source.width) <= 1);
