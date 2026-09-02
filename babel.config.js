module.exports = function(api) {
  // Cache per NODE_ENV so the production console-strip plugin is not reused in dev.
  api.cache.using(() => process.env.NODE_ENV);
  const plugins = [];
  if (api.env('production')) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  plugins.push('react-native-reanimated/plugin'); // MUST BE LAST
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
