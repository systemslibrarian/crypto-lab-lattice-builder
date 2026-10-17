import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chart, initial, route, LABELS, STORE, type Action } from '../src/beacon';
const require = createRequire(import.meta.url);
async function command(page: Page, action: Action) {
  await page.getByRole('button', { name: action === 'trim' || action === 'extend' ? LABELS[action] : `Jump ${LABELS[action]}`, exact: true }).click();
}
async function solve(page: Page, index = 0) {
  for (const action of route(chart(index), initial(chart(index)))!) await command(page, action);
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-phase', 'done');
}
async function axe(page: Page) {
  await page.route('**/beacon-axe.js', r => r.fulfill({ contentType: 'application/javascript', body: readFileSync(require.resolve('axe-core/axe.js'), 'utf8') }));
  await page.addScriptTag({ url: '/beacon-axe.js' });
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map((v: any) => ({ id:v.id, targets:v.nodes.map((n:any)=>n.target) })));
  expect(violations).toEqual([]);
}
for (const width of [320,390,768,1366]) test(`Beacon Run responsive play and result at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Two arrows. Your way out.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Where this leads' }).getByRole('link', { name: /Lattice Gentle/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Where this leads' }).getByRole('link', { name: /Basis Match/ })).toHaveAttribute('href','?mode=classic#basis-match');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /All games/ })).toHaveAttribute('href','https://crypto-lab.systemslibrarian.dev/games/');
  mkdirSync('test-results/beacon-shots', { recursive: true });
  await page.screenshot({ path: `test-results/beacon-shots/ready-${width}.png`, fullPage:true });
  await page.getByRole('button', { name: 'Play Beacon Run' }).click();
  await expect(page.locator('#beacon-run')).toBeFocused();
  await page.screenshot({ path: `test-results/beacon-shots/play-${width}.png` });
  const dots = await page.locator('[data-point]').evaluateAll(nodes => nodes.map(n => n.outerHTML));
  await command(page, 'trim');
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-shear','0');
  expect(await page.locator('[data-point]').evaluateAll(nodes => nodes.map(n => n.outerHTML))).toEqual(dots);
  await expect(page.getByRole('status')).toContainText('lattice did not');
  await page.getByRole('button', { name:'Undo', exact:true }).click();
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-shear','1');
  await command(page, 'b+');
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-collected','1');
  await page.getByRole('button', { name:'Undo', exact:true }).click();
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-collected','0');
  await page.getByRole('button', { name:'Hint', exact:true }).click();
  await expect(page.getByRole('status')).toContainText('Hints are free');
  await solve(page);
  await expect(page.getByRole('note', { name:'What you just learned' })).toContainText('whole basis vectors');
  await expect(page.locator('.br-result')).toBeFocused();
  await expect(page.locator('.br-result')).toContainText('SHORTEST ROUTE FOUND');
  await page.screenshot({ path:`test-results/beacon-shots/result-${width}.png`, fullPage:true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await axe(page);
  await page.getByRole('button', { name:'Undo', exact:true }).click();
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-phase','playing');
  await page.getByRole('button', { name:'Retry', exact:true }).click();
  expect(await page.locator('.br-ship').evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
  for (const button of await page.locator('.br-thrusts button,.br-tools button,.br-refit-buttons button').all()) {
    const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test('all charts finish with an action-specific lesson, save bests, and keep old deep links', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 6; i++) {
    await page.getByLabel('Choose a chart').selectOption(String(i));
    await solve(page, i);
    await expect(page.getByRole('note', { name:'What you just learned' })).toContainText('not how to break encryption');
    if (i === 1) await expect(page.getByRole('note', { name:'What you just learned' })).toContainText('Refitting B');
  }
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORE);
  expect(saved.best).toHaveLength(6); expect(saved.best.every((v:number)=>v>0)).toBe(true);
  await page.reload();
  await expect(page.locator('.br-under')).toContainText(`Best on this chart: ${saved.best[0]}`);
  await page.getByRole('link', { name:'Original games & deeper maths →' }).click();
  await expect(page.locator('#vector-flight')).toBeVisible();
  await page.getByRole('link', { name:'BEACON RUN →', exact:true }).click();
  await expect(page.locator('#beacon-run')).toBeVisible();
});

test('keyboard, blocked actions, denied storage, sound, and clear remain usable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked'); }; Storage.prototype.setItem = () => { throw Error('blocked'); }; });
  await page.goto('/');
  await page.getByRole('button', { name:'Play Beacon Run' }).click();
  await page.keyboard.press('a'); await page.keyboard.press('a');
  await expect(page.getByRole('status')).toContainText('Nothing lost');
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-position','-6,0');
  await page.keyboard.press('q');
  await expect(page.locator('#beacon-run')).toHaveAttribute('data-shear','0');
  await page.getByRole('button', { name:'Retry', exact:true }).click();
  await page.getByRole('button', { name:'Sound off', exact:true }).click();
  await expect(page.getByRole('button', { name:'Sound on', exact:true })).toHaveAttribute('aria-pressed','true');
  await solve(page);
  await expect(page.locator('.br-under')).toContainText('Storage is unavailable');
  await page.getByRole('button', { name:'Clear saved routes & sound' }).click();
  await expect(page.getByRole('button', { name:'Sound off', exact:true })).toHaveAttribute('aria-pressed','false');
});
