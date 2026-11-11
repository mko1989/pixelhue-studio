// Layer preset store for the mock (WO-037). Device rules modelled: all eleven parts present, unique names (8311),
// apply writes only the enabled parts, positions are relative to the screen.
export const layerPresetXml = '<Layer Support="1" Editable="1"><LayerPreset Support="1" Editable="1" maxCount="3"><LabelColors><LabelColor Support="1" Editable="1" R="37" G="124" B="255"> </LabelColor><LabelColor Support="1" Editable="1" R="233" G="106" B="106"> </LabelColor></LabelColors></LayerPreset><DefaultMVRTemplate Support="1" Editable="1"/><CustomMVRTemplate Support="0" Editable="0"/></Layer>';
const PARTS = ['source', 'pos', 'size', 'border', 'effect', 'shadow', 'flip', 'mask', 'cutFill', 'crop', 'freeze'];
export function installLayerPresets(layers, screens) {
  const presets = [];
  const valid = p => p && typeof p.general?.name === 'string' && p.general.name && Number.isInteger(p.general.labelColor?.R) && PARTS.every(key => [0, 1].includes(p[`${key}Preset`]?.enable));
  return { presets,
    // Returns [code, message] for a refusal, or { data } for a success.
    handle(path, method, body, behavior) {
      if (path === 'layers/layer-preset/create' || path === 'layers/layer-preset/apply-modify') {
        if (method !== 'PUT' || !Array.isArray(body) || !body.every(valid)) return [8210, 'layer preset invalid'];
        for (const item of body) {
          const existing = presets.find(p => p.layerPresetId === item.layerPresetId);
          if (presets.some(p => p !== existing && p.general.name === item.general.name)) return [8311, 'name repeat'];
          if (path.endsWith('create')) presets.push({ ...structuredClone(item), layerPresetId: Math.max(0, ...presets.map(p => p.layerPresetId)) + 1 });
          else if (!existing) return [8210, 'layer preset invalid']; else Object.assign(existing, structuredClone(item));
        }
        return { data: {} };
      }
      if (path === 'layers/layer-preset/delete') {
        if (method !== 'DELETE' || !Array.isArray(body)) return [8210, 'layer preset invalid'];
        const fails = [];
        for (const item of body) { const index = presets.findIndex(p => p.layerPresetId === item.layerPresetId); if (index < 0) fails.push(item.layerPresetId); else presets.splice(index, 1); }
        return { data: { fails } };
      }
      if (method !== 'PUT' || !Array.isArray(body) || body.some(item => !valid(item.layerPreset) || !item.layerIds?.every(l => layers.some(x => x.layerId === l.layerId)))) return [8210, 'layer preset invalid'];
      if (path === 'layers/layer-preset/apply-access') return { data: { fails: behavior.layerPresetFail ? [{ layerId: body[0].layerIds[0].layerId, results: [3] }] : [] } };
      for (const { layerPreset: p, layerIds } of body) for (const { layerId } of layerIds) {
        const layer = layers.find(l => l.layerId === layerId), screen = screens.find(s => s.screenId === layer.layerIdObj.attachScreenId), origin = screen?.mosaic?.window || { x: 0, y: 0 };
        if (p.posPreset.enable) Object.assign(layer.window, { x: p.posPreset.x + origin.x, y: p.posPreset.y + origin.y });
        if (p.sizePreset.enable) Object.assign(layer.window, { width: p.sizePreset.width, height: p.sizePreset.height });
        if (p.borderPreset.enable) layer.border = structuredClone(p.borderPreset.border);
        if (p.maskPreset.enable) layer.mask = structuredClone(p.maskPreset.mask);
        if (p.flipPreset.enable) layer.general.flipType = p.flipPreset.flipType;
        if (p.effectPreset.enable) { layer.opacity = p.effectPreset.opacity; layer.general.isMonochrome = p.effectPreset.isMonochrome; }
        if (p.sourcePreset.enable) layer.source = structuredClone(p.sourcePreset.source);
      }
      return { data: null };
    } };
}
