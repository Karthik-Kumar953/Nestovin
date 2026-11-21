/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS script run by Node */
/**
 * DEV-ONLY: runs the API in client-demo mode without editing .env:
 *   TEST_PAYMENTS_ENABLED=true  -> "Test booking (no payment)" in the Resident app
 *   DEMO_LOGIN_ENABLED=true     -> "Demo login" signs in as the seeded demo resident
 * The API itself refuses both switches when NODE_ENV=production.
 * Demo resident phone: DEMO_RESIDENT_PHONE from the environment, else +919999900001.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  TEST_PAYMENTS_ENABLED: 'true',
  DEMO_LOGIN_ENABLED: 'true',
  DEMO_RESIDENT_PHONE: process.env.DEMO_RESIDENT_PHONE ?? '+919999900001',
};
if (env.NODE_ENV === 'production') {
  console.error('Demo mode is for development only.');
  process.exit(1);
}
console.warn('\nNestovin API in DEMO mode: test payments and demo login are ON (development only).\n');
const child = spawn('npx', ['tsx', 'watch', '--env-file-if-exists=.env', 'src/server.ts'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
  env,
});
child.on('exit', (code) => process.exit(code ?? 0));
