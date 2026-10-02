import { openStore } from "@datalom/shared/storage/runtime";
import { authToken } from "@datalom/server/app";
const s = openStore();
console.log(authToken(s));
s.close();
