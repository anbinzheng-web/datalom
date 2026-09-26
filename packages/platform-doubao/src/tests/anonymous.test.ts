import { describe, expect, it } from "vitest";
import {
  assertDoubaoAnonymousCookies,
  inspectDoubaoAnonymousCookies,
} from "../anonymous.ts";

describe("Doubao anonymous cookie boundary", () => {
  it("allows anonymous device and CSRF cookies", () => {
    expect(
      inspectDoubaoAnonymousCookies([
        { name: "ttwid", value: "anonymous-device" },
        { name: "s_v_web_id", value: "anonymous-web-id" },
        { name: "passport_csrf_token", value: "csrf" },
        { name: "flow_cur_user_sec_id", value: "" },
      ]),
    ).toMatchObject({ anonymous: true, accountCookies: [] });
  });

  it.each([
    "sid_guard",
    "sid_tt",
    "uid_tt",
    "uid_tt_ss",
    "sessionid",
    "sessionid_ss",
    "ssid_ucp_v1",
    "odin_tt",
    "bd_sso_hi3jfd",
    "flow_account_sync_event",
  ])("rejects account cookie %s", (name) => {
    expect(() =>
      assertDoubaoAnonymousCookies([{ name, value: "account-session" }]),
    ).toThrow(/仅允许游客态/);
  });

  it("rejects a non-empty current-user marker", () => {
    expect(
      inspectDoubaoAnonymousCookies([
        { name: "flow_cur_user_sec_id", value: "user-id" },
      ]),
    ).toMatchObject({
      anonymous: false,
      accountCookies: ["flow_cur_user_sec_id"],
    });
  });
});
