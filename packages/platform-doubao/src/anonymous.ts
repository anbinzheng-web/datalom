import { DatalomError } from "@datalom/runtime-node/contracts";

export interface DoubaoCookieIdentity {
  name: string;
  value?: string;
}

const accountCookieNames = new Set([
  "bd_sso_hi3jfd",
  "flow_account_sync_event",
  "flow_multi_user_sec_info",
  "is_staff_user",
  "odin_tt",
  "passport_auth_status",
  "session_tlb_tag",
]);

const accountCookiePatterns = [
  /^sid(?:_|$)/,
  /^ssid(?:_|$)/,
  /^uid_tt(?:_|$)/,
  /^sessionid(?:_|$)/,
];

export function doubaoAccountCookieNames(cookies: DoubaoCookieIdentity[]) {
  return [
    ...new Set(
      cookies.flatMap((cookie) => {
        const name = cookie.name.toLowerCase();
        const accountCookie =
          accountCookieNames.has(name) ||
          accountCookiePatterns.some((pattern) => pattern.test(name)) ||
          (name === "flow_cur_user_sec_id" && !!cookie.value);
        return accountCookie ? [cookie.name] : [];
      }),
    ),
  ].sort();
}

export function inspectDoubaoAnonymousCookies(cookies: DoubaoCookieIdentity[]) {
  const accountCookies = doubaoAccountCookieNames(cookies);
  return {
    anonymous: accountCookies.length === 0,
    accountCookies,
    cookieNames: [...new Set(cookies.map((cookie) => cookie.name))].sort(),
  };
}

export function assertDoubaoAnonymousCookies(cookies: DoubaoCookieIdentity[]) {
  const result = inspectDoubaoAnonymousCookies(cookies);
  if (!result.anonymous)
    throw new DatalomError(
      "LOGIN_REQUIRED",
      `豆包研究仅允许游客态；检测到账号 Cookie：${result.accountCookies.join(", ")}`,
    );
  return result;
}
