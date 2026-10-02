import { cookieJar } from "./cookies.ts";
import { openAccountRoute } from "./proxy-check.ts";
import { HttpTransport } from "./transport.ts";
import {
  DatalomError,
  type SessionSecret,
} from "@datalom/shared/runtime/contracts";
import type { Trace } from "@datalom/shared/runtime/diagnostics";

export async function openTransport(
  session: SessionSecret,
  _dir?: string,
  trace?: Trace,
) {
  if (!session.route?.verifiedAt)
    throw new DatalomError(
      "PROXY_UNAVAILABLE",
      "请先验证账号代理线路与 Profile 出口一致性",
    );
  const jar = cookieJar(session);
  const route = await openAccountRoute(session);
  return {
    transport: new HttpTransport(
      route.url,
      jar,
      {
        "user-agent": session.observed.userAgent,
        "accept-language": session.observed.language,
      },
      undefined,
      trace,
    ),
    save: () => {
      session.cookieJar = jar.serializeSync()
        ? JSON.stringify(jar.serializeSync())
        : undefined;
    },
    close: route.stop,
  };
}
