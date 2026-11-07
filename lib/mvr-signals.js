// Raw interface.state uses LinkStateE, before PixelFlow's UI status conversion.
export function inputSignals(interfaces) {
  return interfaces.filter((input) => input.auxiliaryInfo?.connectorInfo?.interfaceType === 2).map((input) => {
    const width = input.actualTiming?.horizontal?.addTime;
    const height = input.actualTiming?.vertical?.addTime;
    const connected = [1, 2, 3, 4].includes(input.state) && input.auxiliaryInfo?.online !== 0 &&
      input.auxiliaryInfo?.connectorInfo?.workMode !== 2 && Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0;
    return { id: input.interfaceId, connected, width: connected ? width : null, height: connected ? height : null };
  });
}

export function layerAspect(layer, signals) {
  const source = layer.source?.general || {};
  const mode = layer.aspectRatio?.aspectRatio === 8 ? 8 : 5;
  const signal = source.sourceType === 2 && signals.find((signal) => signal.id === source.sourceId && signal.connected);
  const ratio = mode === 8 && signal ? signal.width / signal.height : layer.window.width / layer.window.height;
  return { sourceId: source.sourceId ?? null, sourceType: source.sourceType ?? null,
    aspectMode: mode, aspectLock: layer.aspectRatio?.locked === 1 || layer.aspectRatio?.locked === true ? ratio : null };
}
