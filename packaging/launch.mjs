import { spawn } from 'node:child_process';
import { createApp } from './app/server.js';

const host = process.env.HOST || '127.0.0.1';
const requestedPort = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  console.error('PORT must be a number between 0 and 65535.'); process.exit(1);
}
const server = createApp();
let currentPort = requestedPort;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && !process.env.PORT && currentPort < 3220) {
    server.listen(++currentPort, host); return;
  }
  console.error(`Cannot start Pixelhue Studio: ${error.message}`); process.exit(1);
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Pixelhue Studio: ${url}`);
  console.log('Keep this window open. Press Ctrl+C to stop.');
  if (process.env.PIXELHUE_NO_BROWSER === '1') return;
  const command = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ?
    ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Open ${url} in your browser.`)); child.unref();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0)); server.closeAllConnections();
});
server.listen(currentPort, host);
