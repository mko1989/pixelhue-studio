// One target list for packaging, architecture checks and native launcher selection.
const unix = (id, label, runtime, binaryFormat) => ({ id, label, runtime, format: 'tar.gz', executable: 'bin/node', launcher: 'Start Pixelhue Studio.sh', binaryFormat });
export const targets = [
  { id: 'macos-intel', label: 'Intel Mac', runtime: 'darwin-x64', format: 'zip', executable: 'bin/node', launcher: 'Start Pixelhue Studio.command', binaryFormat: /Mach-O 64-bit executable x86_64/ },
  { id: 'macos-silicon', label: 'Apple Silicon Mac', runtime: 'darwin-arm64', format: 'zip', executable: 'bin/node', launcher: 'Start Pixelhue Studio.command', binaryFormat: /Mach-O 64-bit executable arm64/ },
  { id: 'windows-x64', label: 'Windows x64', runtime: 'win-x64', format: 'zip', executable: 'node.exe', launcher: 'Start Pixelhue Studio.cmd', binaryFormat: /PE32\+ executable.*x86-64/ },
  unix('ubuntu-x64', 'Ubuntu x64', 'linux-x64', /ELF 64-bit.*x86-64/),
  unix('raspberry-pi-arm64', 'Raspberry Pi — 64-bit OS (ARM64)', 'linux-arm64', /ELF 64-bit.*(?:aarch64|ARM64)/i),
  unix('raspberry-pi-armv7', 'Raspberry Pi — 32-bit OS (ARMv7)', 'linux-armv7l', /ELF 32-bit.*ARM.*EABI5/),
];
export const nativeTarget = (platform = process.platform, arch = process.arch) => targets.find(t =>
  t.runtime === `${platform === 'win32' ? 'win' : platform}-${arch === 'arm' ? 'armv7l' : arch}`)?.id;
