import { voiceEndpoint } from './transcription';
import { resolveVoiceApi, voiceOrigin } from './voiceApi';

jest.mock('@/features/journal/api', () => ({ openEntryAudio: jest.fn() }));

describe('resolveVoiceApi', () => {
  it('needs both settings', () => {
    expect(resolveVoiceApi(undefined, 'token')).toBeNull();
    expect(resolveVoiceApi('https://voice.example.com', undefined)).toBeNull();
    expect(resolveVoiceApi('', '')).toBeNull();
  });

  it('accepts https and drops a trailing slash', () => {
    expect(resolveVoiceApi('https://voice.example.com/', 'token', false)).toEqual({
      url: 'https://voice.example.com',
      token: 'token',
    });
  });

  it('refuses anything that is not https', () => {
    expect(resolveVoiceApi('http://voice.example.com', 'token', false)).toBeNull();
    expect(resolveVoiceApi('http://voice.example.com', 'token', true)).toBeNull();
    expect(resolveVoiceApi('ftp://voice.example.com', 'token', true)).toBeNull();
    expect(resolveVoiceApi('not a url', 'token', true)).toBeNull();
  });

  it('allows this Mac’s own loopback address, in development only', () => {
    expect(resolveVoiceApi('http://127.0.0.1:8799', 'token', true)?.url).toBe(
      'http://127.0.0.1:8799',
    );
    expect(resolveVoiceApi('http://localhost:8799', 'token', true)?.url).toBe(
      'http://localhost:8799',
    );
    expect(resolveVoiceApi('http://127.0.0.1:8799', 'token', false)).toBeNull();
    expect(resolveVoiceApi('http://192.168.1.20:8799', 'token', true)).toBeNull();
  });
});

describe('one rule for where anything may be sent', () => {
  const inputs = [
    'https://voice.example.com',
    'https://voice.example.com/',
    'HTTPS://Voice.Example.com:8443',
    'http://voice.example.com',
    'http://127.0.0.1:8799',
    'http://localhost',
    'http://127.0.0.1.example.com',
    'http://localhost@example.com',
    'https://user:pass@voice.example.com',
    'https://voice.example.com/prefix',
    'https://voice.example.com?x=1',
    'http://[::1]:8799',
    'ftp://voice.example.com',
    'voice.example.com',
    '',
    undefined,
  ];

  it.each([false, true])(
    'is the same for transcription, refining, live words and patterns (development: %s)',
    (development) => {
      for (const raw of inputs) {
        const origin = voiceOrigin(raw, development);
        // The origin is the whole of the rule. The paths are only ever added to it.
        expect(voiceEndpoint(raw, '/api/transcribe', development)).toBe(
          origin && `${origin}/api/transcribe`,
        );
        expect(resolveVoiceApi(raw, 'token', development)).toEqual(
          origin ? { url: origin, token: 'token' } : null,
        );
      }
    },
  );

  it('lets plain http through for this Mac’s own address in a development build, and never in a release', () => {
    expect(voiceOrigin('http://127.0.0.1:8799', true)).toBe('http://127.0.0.1:8799');
    expect(voiceOrigin('http://localhost:8799', true)).toBe('http://localhost:8799');
    expect(voiceOrigin('http://127.0.0.1:8799', false)).toBeNull();
    expect(voiceOrigin('http://localhost:8799', false)).toBeNull();
    expect(voiceOrigin('https://voice.example.com', false)).toBe('https://voice.example.com');
  });

  it('takes an origin and nothing more: no user, no path, no query', () => {
    for (const refused of [
      'https://user:pass@voice.example.com',
      'https://voice.example.com/prefix',
      'https://voice.example.com?x=1',
      'http://127.0.0.1.example.com',
      'http://localhost@example.com',
    ]) {
      expect(voiceOrigin(refused, true)).toBeNull();
      expect(resolveVoiceApi(refused, 'token', true)).toBeNull();
    }
  });
});
