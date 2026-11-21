/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS config read by Node/Metro */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui-native/src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('../../packages/ui-native/tailwind-preset.js')],
};
