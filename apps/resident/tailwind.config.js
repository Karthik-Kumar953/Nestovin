/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui-native/src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('../../packages/ui-native/tailwind-preset.js')],
};
