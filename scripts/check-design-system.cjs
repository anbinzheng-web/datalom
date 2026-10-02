const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      '/',
      '/pricing',
      '/datasets',
      '/platforms',
      '/docs/api',
      '/design-system',
    ]) {
      await page.goto((process.env.WEB_PREVIEW_URL || 'http://localhost:4320') + route);
      await page.waitForLoadState('networkidle');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        route + ' overflow at ' + width,
      );
      if (route === '/') {
        const heights = await page
          .locator('main > section:first-child a')
          .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
        assert.ok(heights.length >= 2);
        assert.ok(heights.every((height) => height >= 40));
        const stats = page.locator('#datasets > div > .grid').first();
        const columns = await stats.evaluate((node) =>
          getComputedStyle(node).gridTemplateColumns.split(' '),
        );
        assert.equal(columns.length, width > 640 ? 4 : 2);
        assert.ok(
          columns.every((column) => Math.abs(parseFloat(column) - parseFloat(columns[0])) < 1),
        );
        const trial = page
          .locator('main > section:first-child')
          .getByRole('link', { name: 'Explore datasets', exact: true });
        const trialStyle = await trial.evaluate((node) => {
          const style = getComputedStyle(node);
          return { background: style.backgroundColor, position: style.position };
        });
        assert.notEqual(trialStyle.position, 'absolute');
        assert.notEqual(trialStyle.background, 'rgba(0, 0, 0, 0)');
        assert.equal(await trial.getAttribute('href'), '/datasets');
        await page.getByRole('button', { name: '02 · Datasets', exact: true }).click();
        await page.getByRole('button', { name: 'Instagram', exact: true }).click();
        assert.ok(
          await page.getByRole('heading', { name: 'Instagram · Video records' }).isVisible(),
        );
        await page.getByRole('button', { name: 'JSON', exact: true }).click();
        assert.equal(
          JSON.parse(await page.locator('#hero-datasets pre').innerText()).platform,
          'instagram',
        );
        await page.getByRole('button', { name: 'Parquet', exact: true }).click();
        assert.ok(
          await page
            .getByRole('cell', { name: 'Objects with a second life', exact: true })
            .isVisible(),
        );
        const price = page
          .getByRole('heading', { name: 'Start small. Learn deeply.' })
          .locator('..')
          .locator('..');
        assert.equal(await price.evaluate((node) => getComputedStyle(node).display), 'grid');
        assert.equal(
          await price.evaluate((node) => getComputedStyle(node).backgroundColor),
          'rgb(36, 39, 51)',
        );
      }
      if (route === '/design-system') {
        const trigger = page.getByRole('button', { name: 'Open dialog', exact: true });
        await trigger.click();
        assert.equal(await page.locator('dialog').evaluate((n) => n.open), true);
        assert.equal(
          await page.locator('dialog').evaluate((n) => getComputedStyle(n).borderTopLeftRadius),
          '12px',
        );
        assert.equal(
          await page.getByLabel('Export name').evaluate((n) => document.activeElement === n),
          true,
        );
        for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').evaluate((n) => n.open), false);
        assert.equal(await trigger.evaluate((n) => document.activeElement === n), true);
        await page.getByLabel('Email', { exact: true }).fill('tester@example.com');
        await page.getByRole('button', { name: 'Save example' }).click();
        assert.ok(await page.getByText('Example saved locally. No data was sent.').isVisible());
        await page.getByRole('button', { name: 'Dismiss message' }).click();
        assert.equal(await page.getByText('Example saved locally. No data was sent.').count(), 0);
        await page.locator('summary').filter({ hasText: 'Are these shared components?' }).click();
        await page.locator('summary').filter({ hasText: 'Can multiple items stay open?' }).click();
        assert.equal(await page.locator('.ui-accordion details[open]').count(), 1);
        await page.screenshot({ path: '/tmp/datalom-ui-' + width + '.png' });
      }
      console.log('PASS', width, route);
    }
  }
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
