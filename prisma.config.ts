import { userInfo } from 'node:os';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'packages/shared/prisma/schema.prisma',
  datasource: {
    url:
      process.env.DATABASE_URL ??
      `postgresql://${encodeURIComponent(userInfo().username)}@localhost:5432/datalom`,
  },
});
