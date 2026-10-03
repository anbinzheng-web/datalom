import { artifactPath } from '@datalom/shared/runtime/paths';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildApp } from '@datalom/server/app';
import { fixture } from './checks/helpers.ts';
const f = await fixture(),
  app = await buildApp(f.store);
const address = await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync(artifactPath(), { recursive: true });
try {
  await page.goto(address);
  await page.getByLabel('邮箱').fill('admin@datalom.com');
  await page.getByLabel('密码').fill('12345678');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await page.getByRole('heading', { name: '工作台概览' }).waitFor();
  await page.screenshot({ path: artifactPath('ui-wide.png'), fullPage: true });
  await page.getByRole('button', { name: /会话池/ }).click();
  await page.getByLabel('搜索账号').fill('no-match');
  await page.getByText('没有匹配的账号').waitFor();
  await page.getByLabel('搜索账号').fill('');
  await page.getByRole('button', { name: '详情与线路' }).click();
  await page.getByRole('dialog').waitFor();
  const focusable = page
    .getByRole('dialog')
    .locator('button:not(:disabled),input,select,textarea,a[href]');
  await focusable.first().focus();
  await page.keyboard.press('Shift+Tab');
  assert(await focusable.last().evaluate((el) => el === document.activeElement));
  await page.keyboard.press('Tab');
  assert(await focusable.first().evaluate((el) => el === document.activeElement));
  await page.getByRole('button', { name: '禁用账号', exact: true }).click();
  await page.getByRole('button', { name: '启用账号', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert(
    await page
      .getByRole('button', { name: '详情与线路' })
      .evaluate((el) => el === document.activeElement),
  );
  await page.reload();
  await page.getByRole('button', { name: /会话池/ }).click();
  await page.getByRole('button', { name: '详情与线路' }).click();
  await page.getByRole('button', { name: '启用账号', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /工作台概览/ }).click();
  await page.screenshot({ path: artifactPath('ui-mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Mobile page overflows horizontally');
  if (errors.length) throw new Error(errors.join('\n'));
  const result = {
    passed: true,
    environment: 'isolated fixture database; real Chromium UI',
    checks: [
      'login',
      'wide overview',
      'account search',
      'disable',
      'Escape',
      'focus trap and restoration',
      '390px viewport',
    ],
    consoleErrors: errors,
  };
  writeFileSync(artifactPath('ui-smoke.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: artifactPath('ui-failure.png'), fullPage: true });
  writeFileSync(artifactPath('ui-failure.html'), await page.content());
  throw error;
} finally {
  await browser.close();
  await app.close();
  await f.cleanup();
}
