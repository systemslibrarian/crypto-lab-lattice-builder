import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
for (const width of [1366, 390]) {
  test(`gameplay and WCAG controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Eight dots. Take the nearest.' })).toBeVisible();
    await page.getByRole('button', { name: 'DAILY', exact: true }).click();
    await expect(page.getByRole('button', { name: 'DAILY', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'CAMPAIGN', exact: true }).click();
    await page.getByRole('slider', { name: 'Twist — turn the whole field' }).fill('8');
    await page.getByRole('slider', { name: 'Slant — straighten the lean of the field' }).fill('62');
    const dots = page.getByRole('button', { name: /Dot \d of 8,/ });
    await expect(dots).toHaveCount(8);
    const choices = await dots.evaluateAll(nodes => nodes.map(node => {
      const name = node.getAttribute('aria-label')!;
      return { name, distance: Number(name.match(/, ([\d.]+) from home/)![1]) };
    }));
    choices.sort((a, b) => a.distance - b.distance);
    const nearest = page.getByRole('button', { name: choices[0].name, exact: true });
    await nearest.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('NEAREST DOT FOUND', { exact: true })).toBeVisible();
    await page.locator('#advanced').scrollIntoViewIfNeeded();
    await page.locator('#expert').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    // Load test instrumentation as a same-origin script; keep the real CSP intact.
    await page.route('**/fleet-verification-axe.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: readFileSync(require.resolve('axe-core/axe.js'), 'utf8'),
    }));
    await page.addScriptTag({ url: '/fleet-verification-axe.js' });
    const violations = await page.evaluate(async () => {
      const result = await (window as any).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return result.violations.map((v: any) => ({ id: v.id, targets: v.nodes.map((n: any) => n.target) }));
    });
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
