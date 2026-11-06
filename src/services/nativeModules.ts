/* eslint-disable @typescript-eslint/no-require-imports */
// Native modules these services need, loaded on first use. Requiring them here rather than importing
// at the top of a file keeps screens free of native code until a feature is used, so screen tests
// stay simple. These are plain requires because Jest cannot run import() or mock what it loads.

export const loadAudio = () => require('expo-audio') as typeof import('expo-audio');

export const loadNotifications = () =>
  require('expo-notifications') as typeof import('expo-notifications');

export const loadSharing = () => require('expo-sharing') as typeof import('expo-sharing');
