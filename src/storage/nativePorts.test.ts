// The Expo adapters cannot run real native code under Jest. These pin how they call it, because the
// mistakes that matter here (a string AAD read as base64, the wrong accessibility) are silent.
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { expoAes, expoSecrets } from './nativePorts';
import type { AesKey } from './ports';

jest.mock('expo-crypto', () => ({
  AESKeySize: { AES256: 256 },
  AESEncryptionKey: {
    generate: jest.fn(async () => ({ encoded: async () => 'encoded-key' })),
    import: jest.fn(async () => ({ imported: true })),
  },
  AESSealedData: { fromCombined: jest.fn(() => ({ parsed: true })) },
  aesEncryptAsync: jest.fn(async () => ({ combined: async () => new Uint8Array([9]) })),
  aesDecryptAsync: jest.fn(async () => new Uint8Array([1])),
  randomUUID: jest.fn(() => 'uuid'),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const key = {} as AesKey;
const plaintext = new Uint8Array([1, 2, 3]);
const aad = new Uint8Array([4, 5, 6]);

describe('expoAes', () => {
  it('generates a 256-bit key', async () => {
    await expoAes.generateKey();
    expect(ExpoCrypto.AESEncryptionKey.generate).toHaveBeenCalledWith(256);
  });

  it('passes AAD as bytes, because strings are read as base64', async () => {
    await expoAes.encrypt(key, plaintext, aad);
    const options = jest.mocked(ExpoCrypto.aesEncryptAsync).mock.calls[0]?.[2];
    expect(options?.additionalData).toBeInstanceOf(Uint8Array);
    expect(options?.additionalData).toEqual(aad);
  });

  it('asks the native layer for a fresh 96-bit nonce and a 128-bit tag', async () => {
    await expoAes.encrypt(key, plaintext, aad);
    const options = jest.mocked(ExpoCrypto.aesEncryptAsync).mock.lastCall?.[2];
    expect(options?.nonce).toEqual({ length: 12 });
    expect(options?.tagLength).toBe(16);
  });

  it('decrypts with the same AAD, returning bytes', async () => {
    await expoAes.decrypt(key, new Uint8Array(40), aad);
    const options = jest.mocked(ExpoCrypto.aesDecryptAsync).mock.lastCall?.[2];
    expect(options).toEqual({ additionalData: aad, output: 'bytes' });
    expect(ExpoCrypto.AESSealedData.fromCombined).toHaveBeenCalledWith(expect.any(Uint8Array), {
      ivLength: 12,
      tagLength: 16,
    });
  });
});

describe('expoSecrets', () => {
  it('keeps the key on this device and never ties it to biometrics', async () => {
    await expoSecrets.set('name', 'value');
    const options = jest.mocked(SecureStore.setItemAsync).mock.calls[0]?.[2];
    expect(options?.keychainAccessible).toBe('device-only');
    // requireAuthentication would let a change of fingerprint destroy every entry.
    expect(options?.requireAuthentication).toBeUndefined();
  });

  it('reads with the same options it wrote with', async () => {
    await expoSecrets.set('name', 'value');
    await expoSecrets.get('name');
    const written = jest.mocked(SecureStore.setItemAsync).mock.lastCall?.[2];
    expect(jest.mocked(SecureStore.getItemAsync).mock.lastCall?.[1]).toEqual(written);
  });
});
