const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo detects the pnpm monorepo automatically; NativeWind compiles global.css with the Nestovin theme.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
