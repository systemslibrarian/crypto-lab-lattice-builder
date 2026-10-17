import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

for (const width of [1366, 390]) {
  test(`flight medals, hints, replay and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/#vector-flight');
    const flight = page.locator('#vector-flight');
    const plusU = flight.getByRole('button', { name: 'Thrust + U', exact: true });
    const plusV = flight.getByRole('button', { name: 'Thrust + V', exact: true });
    await plusU.click();
    await plusU.click();
    await expect(flight.getByRole('status')).toContainText('Beacon 1 online');
    await flight.getByRole('button', { name: 'UNDO', exact: true }).click();
    await expect(flight.locator('.flight-hud')).toContainText('BEACONS 0 / 2');
    await plusU.focus();
    await page.keyboard.press('w');
    await plusV.click();
    await plusV.click();
    await expect(flight.getByRole('heading', { name: 'Gold flight!' })).toBeVisible();
    await expect(flight.locator('.flight-result')).toBeFocused();
    await expect(flight.locator('.round-lesson')).toContainText('integer combinations');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lb:flight:medals:v1')!).launch)).toBe(3);
    await flight.getByRole('button', { name: 'RETRY', exact: true }).click();
    await flight.getByRole('button', { name: 'HINT', exact: true }).click();
    await expect(flight.getByRole('status')).toContainText('Try + U');
    await plusU.click(); await plusU.click(); await plusV.click(); await plusV.click();
    await expect(flight.getByRole('heading', { name: 'Silver flight!' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lb:flight:medals:v1')!).launch)).toBe(3);
    await page.reload();
    await expect(flight.getByRole('button', { name: /01 First flight Gold/ })).toBeVisible();
    await flight.getByRole('button', { name: /03 Debris run/ }).click();
    await expect(flight.getByRole('button', { name: 'Thrust + U — blocked' })).toBeDisabled();
    await flight.getByRole('button', { name: /Why does this work/ }).click();
    await expect(flight.locator('.flight-explanation')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.route('**/flight-axe.js', route => route.fulfill({ contentType: 'application/javascript', body: readFileSync(require.resolve('axe-core/axe.js'), 'utf8') }));
    await page.addScriptTag({ url: '/flight-axe.js' });
    const violations = await page.evaluate(async () => (await (window as any).axe.run(document.querySelector('#vector-flight'), { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map((v: any) => ({ id:v.id, nodes:v.nodes.map((n:any)=>n.target) })));
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('practice hints and misses are free; campaign still charges', async ({ page }) => {
  await page.goto('/?mode=classic');
  await page.getByRole('button', { name:'PRACTICE', exact:true }).click();
  await page.getByRole('button', { name:/USE THE SECRET/ }).click();
  await expect(page.locator('.score-readout strong')).toHaveText('3600');
  await page.getByRole('slider', { name:/Twist —/ }).fill('8');
  await page.getByRole('slider', { name:/Slant —/ }).fill('62');
  await page.getByRole('button', { name:/Dot 1 of 8,/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.score-readout strong')).toHaveText('3600');
  await page.getByRole('button', { name:'CAMPAIGN', exact:true }).click();
  await page.getByRole('button', { name:/USE THE SECRET/ }).click();
  await expect(page.locator('.score-readout strong')).toHaveText('3380');
});

test('flight works with denied local storage', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await page.goto('/#vector-flight');
  const flight = page.locator('#vector-flight');
  for (const key of ['+ U', '+ U', '+ V', '+ V']) await flight.getByRole('button', { name:`Thrust ${key}`, exact:true }).click();
  await expect(flight.getByRole('heading', { name:'Gold flight!' })).toBeVisible();
  await expect(flight.locator('.flight-save-note')).toContainText('Storage is unavailable');
});


test('every flight reveals its lesson after the final beacon', async ({page}) => {
  const {FLIGHT_MISSIONS,flightRoute}=await import('../src/flight');
  await page.goto('/#vector-flight');
  const flight=page.locator('#vector-flight');
  for(let i=0;i<FLIGHT_MISSIONS.length;i++) {
    const mission=FLIGHT_MISSIONS[i];
    await flight.locator('.flight-missions button').nth(i).click();
    await expect(flight.locator('.round-lesson')).toHaveCount(0);
    let position:[number,number]=[0,0];
    for(const beacon of mission.beacons) {
      const route=flightRoute(mission,position,beacon)!;
      for(const point of route.slice(1)) {
        const delta=[point[0]-position[0],point[1]-position[1]];
        const label=delta[0]===1?'+ U':delta[0]===-1?'− U':delta[1]===1?'+ V':'− V';
        await flight.getByRole('button',{name:`Thrust ${label}`,exact:true}).click();
        position=point;
      }
    }
    await expect(flight.locator('.round-lesson')).toBeVisible();
    await expect(flight.locator('.round-lesson')).toContainText(mission.lesson);
  }
});
