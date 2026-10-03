import { userInfo } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Database } from './database.ts';
import { Store } from './store.ts';
import { Vault } from './crypto.ts';

/** Explicitly isolated schema; never clears an existing application schema. */
export async function testStore(dir: string, key = randomBytes(32)) {
  const url = new URL(
    process.env.DATALOM_TEST_DATABASE_URL ??
      `postgresql://${encodeURIComponent(userInfo().username)}@localhost:5432/datalom_test`,
  );
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Database(url.toString());
  await admin.execute(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('schema', schema);
  const db = new Database(url.toString());
  const source = new URL('../../prisma/schema.prisma', import.meta.url);
  const schemaPath = fileURLToPath(
    existsSync(source) ? source : new URL('../../../prisma/schema.prisma', import.meta.url),
  );
  try {
    await promisify(execFile)(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('prisma/build/index.js'),
        'db',
        'push',
        '--schema',
        schemaPath,
        '--url',
        url.toString(),
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const store = new Store(dir, new Vault(key), db);
    await store.initialize();
    return {
      store,
      url: url.toString(),
      async cleanup() {
        await store.close();
        await admin.execute(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.close();
      },
    };
  } catch (error) {
    await db.close();
    await admin.execute(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.close();
    throw error;
  }
}
