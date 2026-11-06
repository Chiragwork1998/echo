import { resolveVoiceApi } from './voiceApi';

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
