// The seams between ECHO's data logic and the device. Jest supplies real implementations of these
// (node:crypto, node:sqlite, node:fs), so tests exercise the actual cryptography, SQL, and files.

export type SqlValue = string | number | null | Uint8Array;

export interface SqlDb {
  exec(source: string): Promise<void>;
  run(source: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(source: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(source: string, params?: SqlValue[]): Promise<T | null>;
  /** Commits if the task resolves, rolls back if it rejects. */
  transaction(task: () => Promise<void>): Promise<void>;
}

/** Runs one task at a time, in the order they arrived. A failed task does not stop the next. */
export type WriteQueue = <T>(task: () => Promise<T>) => Promise<T>;

/** An imported key. Opaque so that key bytes cannot wander through the code. */
export type AesKey = { readonly __aesKey: unique symbol };

export interface AesPort {
  /** A fresh random 256-bit key, base64 encoded for the secret store. */
  generateKey(): Promise<string>;
  importKey(encoded: string): Promise<AesKey>;
  /** AES-256-GCM with a fresh random 96-bit nonce. Returns nonce + ciphertext + 128-bit tag. */
  encrypt(key: AesKey, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  /** Rejects if the tag does not verify. */
  decrypt(key: AesKey, sealed: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}

export interface SecretStore {
  /** null means no item exists. A rejection means the store could not answer, which is different. */
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export type FileInfo = { uri: string; name: string; size: number };

export interface FileWriter {
  write(bytes: Uint8Array): Promise<void>;
  close(): void;
}

export interface FilePort {
  read(uri: string): Promise<Uint8Array>;
  /** Writes beside the target then renames, so a crash never leaves a half-written file there. */
  writeAtomic(uri: string, bytes: Uint8Array): Promise<void>;
  /** No error if the file is already gone. */
  remove(uri: string): void;
  /** Files only. Empty if the directory does not exist. */
  list(directory: string): FileInfo[];
  removeDirectory(directory: string): void;
  ensureDirectory(directory: string): void;
  openWriter(uri: string): FileWriter;
}

export type StoragePaths = {
  /** Ciphertext only. Durable, so it is safe from OS cache eviction. */
  audioDir: string;
  /** Where expo-audio writes plaintext while recording. See features/journal/recorderDriver.ts. */
  recordingDirs: string[];
  /** Short-lived decrypted copies for playback and export. Cleared on every launch. */
  tempDir: string;
};

export function childUri(directory: string, name: string): string {
  return `${directory.endsWith('/') ? directory : `${directory}/`}${name}`;
}
