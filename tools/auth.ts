import { openStore } from "@datalom/storage-node/runtime";
import { authToken } from "@datalom/server/app";
const s = openStore();
console.log(authToken(s));
s.close();
