import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildApp, authToken } from "../apps/server/src/app.ts";
import { fixture } from "../tests/helpers.ts";
const f = fixture(),
  app = await buildApp(f.store);
const failedTask = f.store.enqueue({
  accountId: f.account.id,
  operation: "video.detail",
  video: "7685551053554617613",
});
const claimed = f.store.claim()!;
f.store.diagnostics.event(
  {
    taskId: failedTask.id,
    accountId: f.account.id,
    requestId: failedTask.requestId,
  },
  "business-parse",
  "failed",
  { fixture: true },
  "SCHEMA_CHANGED",
);
f.store.diagnostics.issue(failedTask, "SCHEMA_CHANGED");
f.store.finish(failedTask.id, claimed.lease, "failed", {
  code: "SCHEMA_CHANGED",
  message: "Offline fixture response changed",
});
f.store.release(f.account.id, claimed.lease);
const address = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("artifacts", { recursive: true });
try {
  await page.goto(address);
  await page.getByLabel("本机访问令牌").fill(authToken(f.store));
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("heading", { name: "工作台概览" }).waitFor();
  await page.screenshot({ path: "artifacts/ui-wide.png", fullPage: true });
  await page.getByRole("button", { name: /账号与会话/ }).click();
  await page.getByLabel("搜索账号").fill("no-match");
  await page.getByText("没有匹配的账号").waitFor();
  await page.getByLabel("搜索账号").fill("");
  await page.getByRole("button", { name: "详情与线路" }).click();
  await page.getByRole("dialog").waitFor();
  const focusable = page
    .getByRole("dialog")
    .locator("button:not(:disabled),input,select,textarea,a[href]");
  await focusable.first().focus();
  await page.keyboard.press("Shift+Tab");
  assert(
    await focusable.last().evaluate((el) => el === document.activeElement),
  );
  await page.keyboard.press("Tab");
  assert(
    await focusable.first().evaluate((el) => el === document.activeElement),
  );
  await page.getByLabel("账号别名").fill("Edited fixture");
  await page.getByRole("button", { name: "保存信息" }).click();
  await page.getByRole("button", { name: "禁用账号", exact: true }).click();
  await page.getByRole("button", { name: "启用账号", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert(
    await page
      .getByRole("button", { name: "详情与线路" })
      .evaluate((el) => el === document.activeElement),
  );
  await page.reload();
  await page.getByRole("button", { name: /账号与会话/ }).click();
  await page.getByText("Edited fixture", { exact: true }).waitFor();
  await page.getByRole("button", { name: "详情与线路" }).click();
  assert.equal(
    await page.getByLabel("账号别名").inputValue(),
    "Edited fixture",
  );
  await page.getByRole("button", { name: "启用账号", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /请求与任务/ }).click();
  await page.getByRole("button", { name: "结果与排查" }).click();
  await page.getByText("执行时间线", { exact: false }).waitFor();
  await page
    .getByLabel("排查状态", { exact: true })
    .selectOption("investigating");
  await page
    .getByLabel("当前为什么失败及判断依据")
    .fill("Fixture: missing itemInfo; compare saved response");
  await page
    .getByLabel("下一步实验与阻塞条件")
    .fill("Replay fixture after parser regression");
  await page.getByRole("button", { name: "保存排查结论" }).click();
  await page.getByText("排查结论已保存，历史记录已保留").waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出排查报告" }).click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().startsWith("spider-diagnostics-"));
  await page.screenshot({
    path: "artifacts/ui-diagnostics.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )),
  );
  await page.screenshot({
    path: "artifacts/ui-diagnostics-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "结果与排查" }).click();
  assert.equal(
    await page.getByLabel("排查状态", { exact: true }).inputValue(),
    "investigating",
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("执行账号").selectOption("");
  await page.getByRole("button", { name: /连接设置/ }).click();
  await page.getByLabel("RoxyBrowser API 地址").fill("http://127.0.0.1:50012");
  await page.getByLabel("工作区 ID").fill("test");
  await page.getByRole("button", { name: "保存连接设置" }).click();
  await page.getByText(/连接设置已保存/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /工作台概览/ }).click();
  await page.screenshot({ path: "artifacts/ui-mobile.png", fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Mobile page overflows horizontally");
  if (errors.length) throw new Error(errors.join("\n"));
  const result = {
    passed: true,
    environment: "isolated fixture database; real Chromium UI",
    checks: [
      "login",
      "wide overview",
      "account search",
      "edit persistence",
      "disable",
      "Escape",
      "focus trap and restoration",
      "settings save",
      "diagnosis persistence and report download",
      "390px viewport",
    ],
    consoleErrors: errors,
  };
  writeFileSync("artifacts/ui-smoke.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: "artifacts/ui-failure.png", fullPage: true });
  writeFileSync("artifacts/ui-failure.html", await page.content());
  throw error;
} finally {
  await browser.close();
  await app.close();
  f.cleanup();
}
