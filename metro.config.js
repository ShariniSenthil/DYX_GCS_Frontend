const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Watcher timeout on Windows is often caused by watching huge build directories
config.watchFolders = [__dirname];

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList || []),
  /android\/app\/build\/.*/,
  /android\/.gradle\/.*/,
  /ios\/build\/.*/,
  /\.git\/.*/
];

module.exports = config;
