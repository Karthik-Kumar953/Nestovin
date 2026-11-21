// NativeWind v4: JSX runtime + css-interop plugin. babel-preset-expo adds the Worklets plugin for Reanimated 4.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
