# @datalom/contracts-ts

Edit `contracts/openapi/datalom.json`, then run `pnpm contracts:generate`. CI verifies generated types and schemas have not drifted. This contract covers the task API; local management and browser research endpoints remain documented by the server.

```ts
import { createDatalomClient } from '@datalom/contracts-ts';
const client = createDatalomClient({ baseUrl: 'http://127.0.0.1:4317', headers: { Authorization: `Bearer ${token}` } });
const { data, error } = await client.GET('/api/tasks');
```

IDs and cursors are opaque strings, timestamps are Unix milliseconds. The package has no Node, storage or browser dependencies.
