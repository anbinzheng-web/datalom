import { openStore } from '@datalom/shared/storage/runtime';
import { prepareAccount } from '../src/prepare.ts';
const store = await openStore();
try {
  const account = (await store.listAccounts()).find((a) => a.profileId === process.argv[2]);
  if (!account) throw new Error('请先提取该 Profile');
  console.log(await prepareAccount(store, account.id, process.argv[3]));
} finally {
  await store.close();
}
