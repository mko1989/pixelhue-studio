// EDID fixtures for the mock (WO-037): a structurally valid base block, optionally with one extension block.
export function sampleEdid(extensions = 0) {
  const blocks = [];
  for (let index = 0; index <= extensions; index++) {
    const block = Buffer.alloc(128, index ? 0x11 : 0);
    if (!index) { Buffer.from([0, 255, 255, 255, 255, 255, 255, 0]).copy(block); block[8] = 0x41; block[9] = 0x0c; block[18] = 1; block[19] = 4; block[126] = extensions; }
    block[127] = 0; block[127] = (256 - block.reduce((sum, byte) => (sum + byte) & 255, 0)) & 255; blocks.push(block);
  }
  return Buffer.concat(blocks);
}
export const detailed = () => ({ interlaced: 0, edidName: '', horizontal: { addTime: 1920, frontPorch: 88, sync: 44, syncPolarity: 1, totalTime: 2200 },
  vertical: { addTime: 1080, frontPorch: 4, sync: 5, syncPolarity: 1, totalTime: 1125 }, refresh: 60, refreshScale: 0, refreshInt: 6000, standardType: 0, hBlank: 280 });
// Device rule: a timing whose total is smaller than active + front porch + sync is refused.
export const timingError = t => { const bad = a => !a || ![a.addTime, a.frontPorch, a.sync, a.totalTime].every(Number.isInteger) || a.totalTime < a.addTime + a.frontPorch + a.sync || ![0, 1].includes(a.syncPolarity);
  return !t || bad(t.horizontal) || bad(t.vertical) || !(t.refresh > 0) ? 'timing invalid' : null; };
