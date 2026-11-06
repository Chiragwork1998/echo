const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agent worktrees live under .claude/ in this checkout and must never be crawled by its bundler.
// Anchored to this project's root, because a worktree's own path also contains ".claude".
const worktrees = path.join(__dirname, '.claude').replace(/[/\\.]/g, '\\$&');
const voiceApi = path.join(__dirname, 'voice-api').replace(/[/\\.]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${worktrees}/.*`), new RegExp(`^${voiceApi}/.*`)];

// End-to-end runs only: a stand-in microphone that speaks synthetic test audio. It is unreachable
// from a release bundle, which is built without this variable.
if (process.env.ECHO_E2E === '1') {
  const standIn = path.join(__dirname, 'src/testing/e2e/expoAudio.ts');
  config.resolver.resolveRequest = (context, name, platform) =>
    name === 'expo-audio' && context.originModulePath !== standIn
      ? { type: 'sourceFile', filePath: standIn }
      : context.resolveRequest(context, name, platform);
}

module.exports = config;
