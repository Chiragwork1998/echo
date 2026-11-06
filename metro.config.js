const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agent worktrees live under .claude/ in this checkout and must never be crawled by its bundler.
// Anchored to this project's root, because a worktree's own path also contains ".claude".
const worktrees = path.join(__dirname, '.claude').replace(/[/\\.]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${worktrees}/.*`)];

module.exports = config;
