import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Static guards. Each of these rules is one a future edit could break without any test failing.
const OWNED = [
  'src/storage',
  'src/services',
  'src/features/journal',
  'src/state',
  'app/_layout.tsx',
];

function sources(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}

const production = OWNED.flatMap(sources).filter(
  (path) => /\.tsx?$/.test(path) && !path.includes('.test.') && !path.includes('/testing/'),
);

const read = (path: string) => readFileSync(path, 'utf8');

describe('privacy rules', () => {
  it('finds the files it is meant to check', () => {
    expect(production.length).toBeGreaterThan(30);
  });

  it.each(production)('%s never logs', (path) => {
    expect(read(path)).not.toMatch(/\bconsole\s*\./);
  });

  it.each(production)('%s makes no network call', (path) => {
    expect(read(path)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios|WebSocket/);
  });

  it.each(production)('%s never reports an error message', (path) => {
    // Native and JSON errors can quote what they failed on, which here is journal content.
    expect(read(path)).not.toMatch(/\b(error|err|e)\.message\b/);
  });

  it.each(production)('%s keeps web storage out', (path) => {
    expect(read(path)).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('stores no streak counter', () => {
    const schema = read('src/storage/migrations.ts');
    expect(schema).not.toMatch(/streak/i);
  });

  it('never ties the content key to biometrics', () => {
    const source = read('src/storage/nativePorts.ts');
    expect(source).not.toMatch(/requireAuthentication\s*:/);
  });
});
