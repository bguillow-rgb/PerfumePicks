module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Worklets must run before reanimated so frame-processor worklets are
      // transformed in the right order.
      'react-native-worklets-core/plugin',
      'react-native-reanimated/plugin',
    ],
  };
};
