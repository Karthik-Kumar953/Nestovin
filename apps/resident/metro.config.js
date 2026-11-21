/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS config read by Node/Metro */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** Expo's default config already handles the pnpm monorepo (watch folders, node_modules paths). */
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
