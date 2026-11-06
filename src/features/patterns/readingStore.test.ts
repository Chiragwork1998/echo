import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import { clearReading, loadReading, saveReading, type SavedReading } from './readingStore';

const QUOTE = 'a made-up line the database must never show';
const reading: SavedReading = {
  readAt: 1_700_000_000_000,
  entriesRead: 6,
  cards: [
    {
      name: 'Quiet scoring',
      noticed: 'It seems you keep score.',
      evidence: [
        { quote: QUOTE, date: '2026-10-24' },
        { quote: 'and another made-up line', date: '2026-11-04' },
      ],
      lens: { text: 'One way to see it.', source: 'Dan Siegel · naming a feeling to settle it' },
      practice: 'Write one line.',
      question: 'What is enough?',
    },
  ],
};

let rt: TestRuntime;
beforeEach(async () => {
  rt = await createTestRuntime();
  installRuntime(rt);
});
afterEach(() => installRuntime(null));

describe('readingStore', () => {
  it('keeps nothing until a reading is saved', async () => {
    expect(await loadReading()).toEqual({ ok: true, value: null });
  });

  it('keeps a reading sealed on the phone, never as readable text', async () => {
    expect(await saveReading(reading)).toEqual({ ok: true, value: null });
    expect(await loadReading()).toEqual({ ok: true, value: reading });
    expect(everyStoredByte(rt.root).includes(QUOTE)).toBe(false);
    expect(everyStoredByte(rt.root).includes('Quiet scoring')).toBe(false);
  });

  it('survives the app being closed and opened again', async () => {
    await saveReading(reading);
    const again = await rt.reopen();
    installRuntime(again);
    expect(await loadReading()).toEqual({ ok: true, value: reading });
  });

  it('replaces the earlier reading, and can delete it', async () => {
    await saveReading(reading);
    await saveReading({ ...reading, entriesRead: 9 });
    expect(await loadReading()).toMatchObject({ ok: true, value: { entriesRead: 9 } });
    await clearReading();
    expect(await loadReading()).toEqual({ ok: true, value: null });
  });

  it('goes with the key when everything on the phone is deleted', async () => {
    await saveReading(reading);
    await rt.vault.destroyKey();
    const row = await rt.db.first('SELECT key FROM sealed_kv WHERE key = ?', ['patterns']);
    expect(row).toBeNull();
  });

  it('says it could not, rather than throwing, when storage is not open', async () => {
    installRuntime(null);
    expect(await loadReading()).toEqual({ ok: false });
    expect(await saveReading(reading)).toEqual({ ok: false });
  });
});
