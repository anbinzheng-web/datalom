import { openStore } from "@datalom/shared/storage/runtime";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../src/roxy.ts";
const store = openStore(),
  a = store.listAccounts().find((a) => a.profileId === process.argv[2]);
if (!a) throw new Error("Unknown profile");
const lease = store.lease(a.id, true);
if (!lease) throw new Error("Account busy");
try {
  const before = store.getSecret(a.id),
    c = new RoxyConnector(store.getSetting<RoxyConfig>("roxy")!),
    r = await c.extract(a.profileId);
  r.secret.research = before.research;
  if (
    JSON.stringify(r.secret.route?.account) ===
      JSON.stringify(before.route?.account) &&
    r.secret.route
  ) {
    r.secret.route.verifiedAt = before.route?.verifiedAt;
    r.secret.route.observedIp = before.route?.observedIp;
  }
  const changed = r.secret.cookies
    .filter(
      (c) =>
        !before.cookies.some(
          (old) =>
            old.name === c.name &&
            old.value === c.value &&
            old.domain === c.domain,
        ),
    )
    .map((c) => c.name);
  store.saveSecret(a.id, a.version, r.secret, lease);
  console.log({ updated: true, changedCookieNames: changed });
} finally {
  store.release(a.id, lease);
  store.close();
}
