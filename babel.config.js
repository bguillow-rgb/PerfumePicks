module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated's babel plugin must be listed last per the docs.
      'react-native-reanimated/plugin',
    ],
  };
};
