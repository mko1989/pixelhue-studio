// Audio matrix shaped like the live P20 capture (WO-036): 2 RX channels per input, 2 TX per Main output,
// analog Audio In/Out ports (interfaceType 256), headers "slot,connector,channel,interfaceId,isValid".
export function installAudio(interfaces) {
  const channel = (id, index, type) => ({ channelId: id, channelIndex: index, channelType: type, channelLabel: `Channel ${index + 1}`,
    connectLabel: '', isMute: 0, state: 0, isValid: 1, testAudioEnable: 0 });
  for (const [connectorId, type, name] of [[16, 52, 'Audio In -1'], [18, 53, 'Audio Out -1']]) interfaces.push({ interfaceId: 500000 + connectorId,
    interfaceIdObj: { nodeId: 1, slotId: 3, connectorId }, general: { name }, auxiliaryInfo: { online: 1, connectorInfo: { interfaceType: 256, type, workMode: 0 } } });
  let next = 1; const rows = [], columns = [];
  for (const port of interfaces) {
    const info = port.auxiliaryInfo.connectorInfo, rx = info.interfaceType === 2 || info.type === 52, tx = info.interfaceType === 4 || info.type === 53;
    port.audio = { audioType: info.interfaceType === 256 ? 1 : 0, presetChannelNum: 2, actualChannelNum: 0, sampling: 0,
      channelInfo: rx || tx ? [0, 1].map(index => channel(next++, index, rx ? 1 : 2)) : [] };
    // Inactive connector of a shared HDMI/DP pair is reported invalid on hardware.
    const valid = info.workMode === 2 ? 0 : 1;
    for (const c of port.audio.channelInfo) (rx ? rows : columns).push(`${port.interfaceIdObj.slotId},${port.interfaceIdObj.connectorId},${c.channelIndex},${port.interfaceId},${valid}`);
  }
  const matrix = rows.map(() => columns.map(() => 0));
  return { rows, columns, matrix, behavior: { ignore: false },
    detail: () => ({ columnHeader: columns, rowHeader: rows, matrixData: matrix }),
    // Returns an error message for bodies the device would refuse.
    write(path, body, behavior) {
      if (!Array.isArray(body) || !body.length) return 'audio param invalid';
      if (path === 'audio/matrix-mapping') {
        const plan = body.map(item => ({ row: rows.indexOf(item.rowHeader), column: columns.indexOf(item.columnHeader), enable: item.mappingEnable }));
        if (plan.some(p => p.row < 0 || p.column < 0 || ![0, 1].includes(p.enable) || rows[p.row].endsWith(',0') || columns[p.column].endsWith(',0'))) return 'audio matrix header invalid';
        if (behavior.ignoreAudio) return null;
        for (const p of plan) { if (p.enable) for (const row of matrix) row[p.column] = 0; matrix[p.row][p.column] = p.enable; }
        return null;
      }
      if (path === 'audio/matrix-base') {
        const plan = body.map(item => interfaces.find(i => i.interfaceId === item.interfaceId)?.audio.channelInfo
          .find(c => c.channelIndex === item.channelIndex && c.channelType === item.channelType));
        if (plan.some(c => !c) || body.some(item => ![0, 1].includes(item.isMute) || ![0, 1].includes(item.testAudioEnable))) return 'audio channel invalid';
        if (!behavior.ignoreAudio) plan.forEach((c, index) => { c.isMute = body[index].isMute; c.testAudioEnable = body[index].testAudioEnable; });
        return null;
      }
      return 'unknown audio route';
    } };
}
