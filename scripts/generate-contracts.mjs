import { testStore } from '@datalom/shared/storage/testing';
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../apps/server/src/app.ts';
import { publicSpecification } from '../apps/server/src/openapi/public.ts';
import { schemas } from '../apps/server/src/openapi/schemas.ts';
import { Store } from '@datalom/shared/storage/store';
import { Vault } from '@datalom/shared/storage/crypto';

// Generate from registered Fastify routes and the server's public endpoint registries.
// A disposable store prevents documentation generation from touching user data.
const dir = await mkdtemp(join(tmpdir(), 'datalom-openapi-'));
const isolated = await testStore(dir);
const store = isolated.store;
let app;
let spec;
try {
  app = await buildApp(store);
  await app.ready();
  const local = app.swagger();
  const publicApi = publicSpecification();
  spec = {
    ...local,
    info: { title: 'Datalom API', version: '0.1.0' },
    paths: { ...local.paths, ...publicApi.paths },
    components: {
      ...local.components,
      securitySchemes: {
        ...local.components?.securitySchemes,
        ...publicApi.components.securitySchemes,
      },
      schemas: { ...local.components?.schemas, ...schemas },
    },
  };
} finally {
  await app?.close();
  await isolated.cleanup();
  await rm(dir, { recursive: true, force: true });
}
const generated = astToString(await openapiTS(spec));
const outputs = new Map([
  ['../packages/shared/openapi.json', JSON.stringify(spec, null, 2) + '\n'],
  ['../packages/shared/src/api/generated.ts', generated],
  [
    '../packages/shared/src/api/schema.ts',
    '// Generated from server routes and endpoint registries; do not edit.\nexport const apiContract = ' +
      JSON.stringify(spec, null, 2) +
      ' as const;\n',
  ],
]);
for (const [path, content] of outputs) {
  const target = new URL(path, import.meta.url);
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8').catch(() => '')) !== content)
      throw new Error('Stale generated contract: ' + path);
  } else await writeFile(target, content);
}
