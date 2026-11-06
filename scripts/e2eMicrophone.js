// The end-to-end stand-in microphone (src/testing/e2e/expoAudio.ts) speaks synthetic audio instead of
// listening. It exists to drive the app on an emulator that has no microphone, and it must never be
// inside anything a person installs. Metro swaps it in for expo-audio only when ECHO_E2E=1, and this
// refuses to do so in a release build, so a stray variable in a shell or a CI job fails the build
// loudly instead of shipping a microphone that does not listen.
//
// "Release" is read from three places, because each one covers a way a build can be made:
//  - NODE_ENV: the Expo CLI sets it before it loads metro.config.js. `expo export`, and
//    `expo export:embed` (which Xcode's Release scheme and Gradle's release variant both run with
//    --dev false), set `production`. `expo start` sets `development` unless given --no-dev.
//  - EAS_BUILD: set to `true` on EAS Build servers, whatever the profile. No EAS build is an E2E run.
//  - Metro's own `dev` flag on every resolution, for a bundle asked for in production mode by a dev
//    server that was started in development mode.

const RELEASE_MESSAGE =
  'ECHO_E2E=1 puts a stand-in microphone in the app and must never be set for a production or EAS ' +
  'build. Unset it, or build without it.';

/** Whether this environment is making something that is not a development run. */
function isReleaseBuild(env) {
  return env.NODE_ENV === 'production' || env.EAS_BUILD === 'true';
}

/**
 * Adds the stand-in to a Metro config when ECHO_E2E=1, and throws if that is asked for in a release
 * build. Returns the config, so it can be used in place.
 */
function useTestMicrophone(config, standIn, env = process.env) {
  if (env.ECHO_E2E !== '1') return config;
  if (isReleaseBuild(env)) throw new Error(RELEASE_MESSAGE);

  config.resolver.resolveRequest = (context, name, platform) => {
    // Only the swap is refused. Metro resolves its own empty-module placeholder with dev: false on
    // every dev server, so checking every resolution made a normal development run fail.
    if (name !== 'expo-audio' || context.originModulePath === standIn) {
      return context.resolveRequest(context, name, platform);
    }
    if (context.dev === false) throw new Error(RELEASE_MESSAGE);
    return { type: 'sourceFile', filePath: standIn };
  };
  return config;
}

module.exports = { isReleaseBuild, useTestMicrophone, RELEASE_MESSAGE };
