import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import manifest from '../../../../assets/breathe/voice/manifest.json';
import type { Practice, Step } from '../types';

import { ARRIVE, PRACTICES } from './practices';
import { VOICE_LINES } from './voiceLines';

// The voice of Breathe is made by scripts/generate-breath-voice.mjs and bundled. These checks keep
// the audio true to the words: a line whose text changes without its audio being made again fails
// here, as does a file that is missing, left over, too loud or too quiet.

const VOICE_DIR = path.join(__dirname, '../../../../assets/breathe/voice');
const LINES: Record<
  string,
  { text: string; file: string; seconds: number; lufs: number; peakDbfs: number; bytes: number }
> = manifest.lines;

const spoken = [...PRACTICES, ARRIVE].flatMap((practice: Practice) =>
  practice.steps.filter((step): step is Extract<Step, { kind: 'voice' }> => step.kind === 'voice'),
);
const ids = [...new Set(spoken.map((step) => step.line))].sort();

describe('the voice lines', () => {
  it('has an audio file for every line, and no file for a line that is gone', () => {
    expect(Object.keys(VOICE_LINES).sort()).toEqual(ids);
    expect(Object.keys(LINES).sort()).toEqual(ids);
    for (const id of ids) expect(VOICE_LINES[id]).toBeDefined();
  });

  it.each(spoken.map((step): [string, string] => [step.line, step.text]))(
    '%s was made from its current words',
    (id, text) => {
      expect(LINES[id]?.text).toBe(text);
    },
  );

  it('keeps every file on disk as the manifest describes it, and nothing else', () => {
    const files = readdirSync(VOICE_DIR).filter((file) => file.endsWith('.m4a'));
    expect(files.sort()).toEqual(
      Object.values(LINES)
        .map((line) => line.file)
        .sort(),
    );
    for (const line of Object.values(LINES)) {
      const file = path.join(VOICE_DIR, line.file);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBe(line.bytes);
    }
  });

  it('names files so that Android resource names stay distinct', () => {
    const names = Object.values(LINES).map((line) => line.file);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]+\.m4a$/);
    expect(new Set(names.map((name) => name.replace(/[^a-z0-9]/g, ''))).size).toBe(names.length);
  });

  it('brings every line to one loudness, with peaks at -3 dBFS or lower', () => {
    expect(manifest.settings.targetLufs).toBe(-20);
    expect(manifest.settings.ceilingDbfs).toBe(-3);
    for (const line of Object.values(LINES)) {
      expect(Math.abs(line.lufs - manifest.settings.targetLufs)).toBeLessThanOrEqual(0.5);
      expect(line.peakDbfs).toBeLessThanOrEqual(manifest.settings.ceilingDbfs);
    }
  });

  it('records the model and voice the lines were made with', () => {
    expect(manifest.settings.speechModel).toMatch(/tts/);
    expect(manifest.settings.voice.length).toBeGreaterThan(0);
    expect(manifest.settings.instructions).toMatch(/slow/i);
  });

  it('keeps the bundle small', () => {
    const total = Object.values(LINES).reduce((sum, line) => sum + line.bytes, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
});
