const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const cache = new Map();
let nextId = 0;
let duringEncryption = null;
class SyntheticRecorder {
  uri = 'synthetic-audio-input';
  currentTime = 5;
  async prepareToRecordAsync() {}
  addListener() { return { remove() {} }; }
  record() {}
  async stop() {}
  getStatus() { return { durationMillis: 5000 }; }
}

function load(relative) {
  const file = path.resolve(relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requireLocal = (name) => {
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === 'expo-crypto') return { randomUUID: () => `synthetic-${++nextId}` };
    if (name === 'expo-audio') return {
      AudioModule: { AudioRecorder: SyntheticRecorder },
      RecordingPresets: { HIGH_QUALITY: { ios: {}, android: {}, web: {} } },
      setAudioModeAsync: async () => {},
    };
    if (name === './database') return { isDatabaseSupported: () => false };
    if (name === '@/storage/encryption') return { isEncryptionAvailable: async () => true };
    if (name === '@/storage/audioStore') return {
      audioFileExists: () => true,
      deleteFileIfPresent() {},
      encryptAudioFile: async (_source, id) => {
        if (duringEncryption) duringEncryption();
        return { path: `${id}.enc` };
      },
    };
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
    return require(name);
  };
  new Function('require', 'module', 'exports', source)(requireLocal, module, module.exports);
  return module.exports;
}

(async () => {
  const workspace = load('src/storage/workspace.ts');
  const ledger = load('src/storage/recordingSessionStore.ts');
  const { voiceCapture } = load('src/services/voice.ts');

  workspace.setWorkspaceScope('account');
  await voiceCapture.start({ promptId: 'synthetic', promptText: 'Synthetic prompt' });
  workspace.setWorkspaceScope('guest');
  assert.equal(await voiceCapture.stop(), null, 'Account audio must not return to a guest');
  assert.deepEqual(await ledger.listRecoverableRecordingSessions(), []);
  assert.equal(await voiceCapture.recoverInterrupted(), null);
  const accountPending = await ledger.listRecoverableRecordingSessions('account');
  assert.equal(accountPending.length, 1);
  assert.equal(accountPending[0].status, 'pending-encryption');
  await ledger.updateRecordingSession(accountPending[0].id, { status: 'discarded' });
  assert.equal((await ledger.listRecoverableRecordingSessions('account')).length, 1, 'Guest updates cannot change account recordings');
  workspace.setWorkspaceScope('account');
  const accountRecovery = await voiceCapture.recoverInterrupted();
  assert.equal(accountRecovery.workspace, 'account');
  assert.equal(accountRecovery.localPath, `${accountPending[0].id}.enc`);

  workspace.setWorkspaceScope('guest');
  await voiceCapture.start({ promptId: 'synthetic', promptText: 'Synthetic prompt' });
  duringEncryption = () => workspace.setWorkspaceScope('account');
  assert.equal(await voiceCapture.stop(), null, 'A workspace switch while encrypting cannot return foreign audio');
  duringEncryption = null;
  assert.equal(await voiceCapture.recoverInterrupted(), null);
  workspace.setWorkspaceScope('guest');
  assert.equal((await voiceCapture.recoverInterrupted()).workspace, 'guest');
  assert.equal((await ledger.listRecoverableRecordingSessions('account')).length, 0);
  console.log('PASS recording ledger isolation; cross-workspace stop; original-workspace recovery; scope change during encryption');
})().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
