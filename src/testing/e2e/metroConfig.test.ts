import path from 'node:path';

// The Metro config is where the test microphone is let in, so it is where it is kept out of anything
// that ships. This loads the real metro.config.js under the environments the Expo CLI and EAS give it.

const root = path.resolve(__dirname, '../../..');
const standIn = path.join(root, 'src/testing/e2e/expoAudio.ts');
const KEYS = ['ECHO_E2E', 'NODE_ENV', 'EAS_BUILD'] as const;

type Resolution = { type: 'sourceFile'; filePath: string };
type Context = {
  dev?: boolean;
  originModulePath: string;
  resolveRequest: jest.Mock<Resolution | null, [unknown, string, string | null]>;
};
type Resolver = (context: Context, name: string, platform: string | null) => Resolution | null;
type Config = { resolver: { resolveRequest?: Resolver | null } };

/** metro.config.js as it loads when the environment holds exactly `env`. */
function loadConfig(env: Partial<Record<(typeof KEYS)[number], string>>): Config {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try {
    let config: Config | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      config = require(path.join(root, 'metro.config.js')) as Config;
    });
    return config!;
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: saved[key] });
    }
  }
}

const context = (overrides: Partial<Context> = {}): Context => ({
  dev: true,
  originModulePath: path.join(root, 'src/features/journal/recorderDriver.ts'),
  resolveRequest: jest.fn<Resolution | null, [unknown, string, string | null]>(() => ({
    type: 'sourceFile',
    filePath: '/elsewhere.js',
  })),
  ...overrides,
});

describe('the test microphone in the Metro config', () => {
  it('is let in for a development run with ECHO_E2E=1, and only for expo-audio', () => {
    const config = loadConfig({ ECHO_E2E: '1', NODE_ENV: 'development' });
    const resolve = config.resolver.resolveRequest!;
    expect(resolve(context(), 'expo-audio', 'android')).toEqual({
      type: 'sourceFile',
      filePath: standIn,
    });
    // The stand-in itself reaches the real module, and everything else resolves as it always did.
    const inside = context({ originModulePath: standIn });
    resolve(inside, 'expo-audio', 'android');
    expect(inside.resolveRequest).toHaveBeenCalledTimes(1);
    const other = context();
    resolve(other, 'expo-file-system', 'android');
    expect(other.resolveRequest).toHaveBeenCalledTimes(1);
  });

  it('is not let in without ECHO_E2E=1, in any mode', () => {
    for (const NODE_ENV of ['development', 'production', 'test']) {
      expect(loadConfig({ NODE_ENV }).resolver.resolveRequest).toBeFalsy();
      expect(loadConfig({ NODE_ENV, ECHO_E2E: '0' }).resolver.resolveRequest).toBeFalsy();
    }
  });

  it('stops a production build that has ECHO_E2E=1 set, rather than ship a microphone that does not listen', () => {
    expect(() => loadConfig({ ECHO_E2E: '1', NODE_ENV: 'production' })).toThrow(/ECHO_E2E/);
  });

  it('stops an EAS build that has ECHO_E2E=1 set, whatever the profile', () => {
    expect(() => loadConfig({ ECHO_E2E: '1', EAS_BUILD: 'true', NODE_ENV: 'development' })).toThrow(
      /ECHO_E2E/,
    );
    expect(() => loadConfig({ ECHO_E2E: '1', EAS_BUILD: 'true' })).toThrow(/ECHO_E2E/);
  });

  it('still builds a release without ECHO_E2E, which is every real build', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production', EAS_BUILD: 'true' })).not.toThrow();
  });

  it('refuses a bundle Metro is asked to make in production mode, even from a development server', () => {
    const config = loadConfig({ ECHO_E2E: '1', NODE_ENV: 'development' });
    expect(() =>
      config.resolver.resolveRequest!(context({ dev: false }), 'expo-audio', 'android'),
    ).toThrow(/ECHO_E2E/);
  });

  // Metro resolves its empty-module placeholder with dev: false on every dev server, whatever the
  // bundle asked for. Only expo-audio is swapped, so only that request can be refused.
  it("does not mistake Metro's own dev: false resolutions for a release bundle", () => {
    const config = loadConfig({ ECHO_E2E: '1', NODE_ENV: 'development' });
    const placeholder = context({ dev: false });
    expect(() =>
      config.resolver.resolveRequest!(
        placeholder,
        '/project/node_modules/metro-runtime/empty.js',
        'android',
      ),
    ).not.toThrow();
    expect(placeholder.resolveRequest).toHaveBeenCalledTimes(1);
  });
});
