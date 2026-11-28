import { test, expect } from '@playwright/test';
import { auditControlNames, formatControlNameFailures } from './control-names';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
for (const width of [1366, 390]) {
  test(`gameplay and WCAG controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/?mode=classic');
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
    await expect(page.getByRole('note', { name:'What you just learned' })).toContainText('Whole-number combinations');
    await expect(page.getByRole('note', { name:'What you just learned' })).toContainText('not a general shortest-vector solver');
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
    // axe's `label` rule accepts a bare `placeholder` as an accessible name, so a
    // deleted label can leave this gate green. See `control-names.ts`.
    expect(formatControlNameFailures(await auditControlNames(page)),
      `form controls named only by placeholder/title at ${width}px`).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('expert examples and neighbour counts agree with the displayed coordinates and dimensions', async ({ page }) => {
  await page.goto('./?mode=classic');
  const expert = page.locator('#expert');
  await expert.getByRole('button', { name: /decode 400 off-lattice points/i }).click();
  await expect(expert.getByRole('heading', { name: 'First four trials' })).toBeVisible();
  const rows = expert.locator('.decode-row');
  await expect(rows).toHaveCount(4);
  let publicMatches = 0;
  for (const row of await rows.all()) {
    const target = (await row.locator('em').innerText()).match(/from dot (\([^)]*\))/)![1];
    for (const guess of await row.locator('b').all()) {
      const value = await guess.innerText();
      const matched = value.includes(target);
      await expect(guess).toHaveClass(matched ? 'ok' : 'bad');
      expect(value.endsWith(matched ? 'match' : 'miss')).toBe(true);
      if (value.startsWith('public') && matched) publicMatches++;
    }
  }
  expect(publicMatches).toBe(1);
  await expect(expert).toContainText('133 of 400 trials and missed it in 267');
  await expect(expert).toContainText('squared distance 296');
  await expect(expert).toContainText('squared distance 292');
  for (const row of await expert.locator('.ladder-row.static').all()) {
    const cells = row.locator(':scope > span');
    const d = Number((await cells.first().innerText()).match(/d = (\d+)/)![1]);
    const exact = 3n ** BigInt(d) - 1n;
    if (exact <= BigInt(Number.MAX_SAFE_INTEGER)) {
      await expect(cells.nth(1)).toHaveText(exact.toLocaleString('en-US'));
    } else {
      const [mantissa, exponent] = Number(exact).toExponential(2).split('e+');
      await expect(cells.nth(1)).toHaveText(`3^${d} − 1 (≈ ${mantissa} × 10^${exponent})`);
    }
  }
});


test('the private-key fields match each parameter set and a failed rerun retires the exchange', async ({ page }) => {
  await page.goto('./?mode=classic#advanced');
  const layout = page.getByTestId('dk-layout');
  const exchange = page.getByRole('button', { name: /run the exchange|run it again/i });
  for (const [name, vector, publicKey, total] of [
    ['ML-KEM-512', 768, 800, 1632],
    ['ML-KEM-768', 1152, 1184, 2400],
    ['ML-KEM-1024', 1536, 1568, 3168],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(layout).toContainText(`encoded secret vector (${vector} bytes)`);
    await expect(layout).toContainText(`encapsulation key (${publicKey} bytes)`);
    await expect(page.locator('.wire-group.is-private')).toContainText(`${total}-byte decapsulation key`);
    await exchange.click();
    await expect(page.locator('.wire-group.is-private')).toContainText('Both parties derived the same 32-byte shared secret');
  }
  await page.evaluate(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value() { throw new Error('Random source unavailable'); } });
  });
  await exchange.click();
  await expect(page.getByText('This exchange could not run:', {exact: false})).toBeVisible();
  await expect(page.locator('.wire-group.is-private')).not.toContainText('Both parties derived');
  await expect(page.getByRole('button', { name: 'FLIP ONE BIT OF THE CIPHERTEXT' })).toBeDisabled();
});

test('scaling rows show coefficient support and the ML-KEM category', async ({ page }) => {
  await page.goto('./?mode=classic#advanced');
  const table = page.locator('#advanced .ladder');
  for (const [sample, count] of [['n=16 k=2', '5^32'], ['n=256 k=2', '7^512']]) {
    await table.getByRole('button', { name: new RegExp(sample) }).click();
    await expect(page.locator('.rung-payout')).toContainText(count);
  }
  await expect(page.locator('.rung-payout')).toContainText('512 positions');
  await expect(page.locator('#advanced')).toContainText('nonuniform distribution');
  await expect(table).not.toContainText('TIME TO TRY');
});
