import { openStore } from "../src/core/runtime.ts";
import { authToken } from "../apps/server/src/app.ts";
const s = openStore();
console.log(authToken(s));
s.close();
