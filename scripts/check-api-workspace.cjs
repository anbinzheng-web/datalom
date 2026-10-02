const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let authenticated = false;
  let calls = [];
  let status = 200;
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { user: authenticated ? { id: 'test' } : null } }),
  );
  await page.route('**/api/console/session', (r) => r.fulfill({ json: { authenticated } }));
  await page.route('**/api/console/try', async (r) => {
    calls.push(r.request().postDataJSON());
    await r.fulfill({
      status: status === 401 ? 401 : 200,
      json: {
        status,
        body:
          status === 200
            ? { data: { test: true } }
            : { error: { code: 'TEST_ERROR', message: 'Test failure' } },
      },
    });
  });
  await page.goto('http://localhost:4320/docs/api');
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button', { name: '发送请求', exact: true }).count(), 0);
  assert.ok(
    await page
      .locator('.api-endpoint')
      .getByRole('link', { name: 'Sign in / Sign up' })
      .isVisible(),
  );
  await page.getByRole('button', { name: '错误结构', exact: true }).click();
  assert.ok(await page.getByRole('region', { name: '错误响应字段' }).isVisible());
  await page.getByRole('button', { name: '请求结果', exact: true }).click();
  assert.ok(await page.getByRole('heading', { name: '尚未发送请求' }).isVisible());
  await page.getByRole('button', { name: '成功结构', exact: true }).click();
  await page.getByRole('button', { name: '请求头', exact: true }).click();
  assert.ok(await page.getByText('Authorization', { exact: true }).isVisible());
  await page.getByRole('button', { name: '查询参数', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索接口' }).fill('no-match-xyz');
  assert.ok(await page.getByText('没有匹配的接口').isVisible());
  await page.getByRole('searchbox', { name: '搜索接口' }).fill('');
  authenticated = true;
  await page.reload();
  await page.getByRole('button', { name: '发送请求', exact: true }).waitFor();
  await page.getByRole('button', { name: '发送请求', exact: true }).click();
  assert.equal(calls.length, 0);
  assert.ok(await page.locator('.api-request').getByRole('alert').isVisible());
  await page.getByLabel(/username/).fill('test-user');
  await page.getByRole('button', { name: '发送请求', exact: true }).click();
  await page.getByLabel('JSON 响应').waitFor();
  assert.equal(calls[0].values.username, 'test-user');
  assert.equal(calls[0].id, 'tiktok.user.detail');
  await page.getByRole('button', { name: '成功结构', exact: true }).click();
  assert.ok(await page.getByRole('region', { name: '成功响应字段' }).isVisible());
  await page.getByRole('button', { name: '请求结果', exact: true }).click();
  assert.ok((await page.getByLabel('JSON 响应').innerText()).includes('test'));
  await page.goto('http://localhost:4320/docs/api?op=doubao.chat.completion');
  await page.getByRole('button', { name: '发送请求', exact: true }).waitFor();
  await page.getByLabel(/prompt/).fill('Test prompt');
  await page.getByRole('button', { name: '发送请求', exact: true }).click();
  await page.getByLabel('JSON 响应').waitFor();
  assert.equal(calls[1].id, 'doubao.chat.completion');
  assert.equal(calls[1].values.prompt, 'Test prompt');
  status = 401;
  await page.getByRole('button', { name: '发送请求', exact: true }).click();
  await page
    .locator('.api-endpoint')
    .getByRole('link', { name: 'Sign in / Sign up' })
    .waitFor();
  for (const width of [1920, 1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://localhost:4320/docs/api');
    await page.waitForLoadState('networkidle');
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'overflow ' + width,
    );
    if (width <= 760) {
      const toggle = page.getByRole('button', { name: '接口目录', exact: true });
      await toggle.click();
      assert.ok(await page.getByRole('searchbox', { name: '搜索接口' }).isVisible());
      await page.locator('.api-op').filter({ hasText: '用户作品' }).click();
      await page.waitForURL(/op=/);
      assert.equal(
        await page
          .getByRole('button', { name: '接口目录', exact: true })
          .getAttribute('aria-expanded'),
        'false',
      );
    }
    console.log('PASS workspace', width);
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS search, auth, validation, GET/POST payloads, schema/result, 401 and mobile catalog',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
