const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Metro tests ignorePattern against OS paths. Forward-slash-only regexes
// do not match Windows `android\app\build\...`, so the watcher crawls the
// Gradle output tree and the dependency graph never finishes initializing.
const extraBlockList = [
  /android[/\\]app[/\\]build[/\\].*/,
  /android[/\\]build[/\\].*/,
  /android[/\\]\.gradle[/\\].*/,
  /android[/\\]\.cxx[/\\].*/,
  /ios[/\\]build[/\\].*/,
  /\.git[/\\].*/,
  /\.hprof$/,
];

config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  ...extraBlockList,
];

module.exports = config;
