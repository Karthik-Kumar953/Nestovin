/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS script run by Node */
/**
 * DEV-ONLY: runs the Resident app on web with demo fixtures (src/lib/demo.ts), no API or sign-in needed.
 * Used for design review and screenshots. Open http://localhost:8081 (add ?demo=new or ?demo=pending).
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const app = path.resolve(__dirname, '..');
const child = spawn('npx', ['expo', 'start', '--web', '--port', '8081'], {
  cwd: app,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_DEMO: '1', BROWSER: 'none', CI: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
