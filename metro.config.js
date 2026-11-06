const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agent worktrees live under .claude/ and must never be crawled by the main checkout's bundler.
config.resolver.blockList = [/\/\.claude\/.*/];

module.exports = config;
