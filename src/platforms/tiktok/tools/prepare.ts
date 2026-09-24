import { openStore } from "../../../core/runtime.ts";
import { prepareAccount } from "../research/prepare.ts";
const store = openStore();
try {
  const account = store
    .listAccounts()
    .find((a) => a.profileId === process.argv[2]);
  if (!account) throw new Error("请先提取该 Profile");
  console.log(await prepareAccount(store, account.id, process.argv[3]));
} finally {
  store.close();
}
