const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const { useTestMicrophone } = require('./scripts/e2eMicrophone');

const config = getDefaultConfig(__dirname);

// Agent worktrees live under .claude/ in this checkout and must never be crawled by its bundler.
// Anchored to this project's root, because a worktree's own path also contains ".claude".
const worktrees = path.join(__dirname, '.claude').replace(/[/\\.]/g, '\\$&');
const voiceApi = path.join(__dirname, 'voice-api').replace(/[/\\.]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${worktrees}/.*`), new RegExp(`^${voiceApi}/.*`)];

// End-to-end runs only: a stand-in microphone that speaks synthetic test audio. It is let in by
// ECHO_E2E=1, and the build fails if that is set for a production or EAS build (scripts/e2eMicrophone.js),
// so it cannot reach a release.
useTestMicrophone(config, path.join(__dirname, 'src/testing/e2e/expoAudio.ts'));

module.exports = config;
