import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../src/application.js';
import type { DatabaseDependency } from '../src/database.js';

const snapshotUrl = new URL('../openapi/openapi.json', import.meta.url);

const database: DatabaseDependency = {
  checkHealth: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

const app = await buildApp({ database });
await app.ready();
const generated = `${JSON.stringify(app.swagger(), null, 2)}\n`;
await app.close();

const mode = process.argv[2];
if (mode === '--write') {
  await mkdir(new URL('../openapi/', import.meta.url), { recursive: true });
  await writeFile(snapshotUrl, generated, 'utf8');
  console.log(`Wrote ${fileURLToPath(snapshotUrl)}`);
} else if (mode === '--check') {
  const committed = await readFile(snapshotUrl, 'utf8');
  if (committed !== generated) {
    throw new Error(
      'OpenAPI snapshot is stale. Run npm run openapi:generate and commit the result.',
    );
  }
  console.log('OpenAPI snapshot is current.');
} else {
  throw new Error('Expected --write or --check.');
}
