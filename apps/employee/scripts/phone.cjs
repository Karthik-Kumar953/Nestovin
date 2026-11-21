/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS script run by Node */
/**
 * DEV-ONLY: runs the app for Expo Go on a phone on the same Wi-Fi as this computer.
 * Points the app at the API on this computer's Wi-Fi address (port 4000) and makes Metro
 * advertise that same address, without editing .env. Pass `--host 192.168.x.x` to choose
 * the address yourself, and `--tunnel` when the phone cannot reach the computer directly.
 */
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const PORT = 8082;
const args = process.argv.slice(2);
const hostArg = args.indexOf('--host') >= 0 ? args[args.indexOf('--host') + 1] : undefined;

/** First private IPv4 on a Wi-Fi or Ethernet adapter; skips VirtualBox/Hyper-V/WSL host-only ranges. */
function lanAddress() {
  const skip = /^(192\.168\.56\.|172\.(1[6-9]|2\d|3[01])\.)/;
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || skip.test(a.address)) continue;
      if (/vethernet|virtualbox|vmware|wsl|hyper-v|loopback/i.test(name)) continue;
      candidates.push({ name, address: a.address, wifi: /wi-?fi|wlan|wireless/i.test(name) });
    }
  }
  candidates.sort((x, y) => Number(y.wifi) - Number(x.wifi));
  return candidates[0]?.address;
}

const host = hostArg ?? lanAddress();
if (!host) {
  console.error('No Wi-Fi address found. Connect to Wi-Fi or pass --host 192.168.x.x');
  process.exit(1);
}
const apiUrl = `http://${host}:4000`;
console.warn(`\nPhone build: the app will call the API at ${apiUrl}`);
console.warn('Keep the API running (corepack pnpm dev:api in the main checkout) and the phone on the same Wi-Fi.\n');

const expoArgs = ['expo', 'start', '--go', '--port', String(PORT), '--clear'];
if (args.includes('--tunnel')) expoArgs.push('--tunnel');
const child = spawn('npx', expoArgs, {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl, REACT_NATIVE_PACKAGER_HOSTNAME: host },
});
child.on('exit', (code) => process.exit(code ?? 0));
