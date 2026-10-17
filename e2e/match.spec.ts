import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeMatchRounds, sameLattice } from '../src/match';
const require = createRequire(import.meta.url);
const rounds = makeMatchRounds(42);
const winner = (index: number) => rounds[index].options.findIndex(o=>sameLattice(rounds[index].reference,o));
const label = (index:number) => `CHOOSE MAP ${'ABC'[index]}`;

for(const width of [1366,390]) test(`Basis Match expedition, replay, sharing and accessibility at ${width}px`, async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?basis=42#basis-match');
  const game=page.locator('#basis-match');
  await expect(game.getByRole('heading',{name:'Basis Match',exact:true})).toBeVisible();
  const wrong=(winner(0)+1)%3;
  await game.getByRole('button',{name:label(wrong),exact:true}).click();
  await expect(game.locator('.match-status')).toContainText('is an impostor');
  await expect(game.getByRole('button',{name:label(wrong),exact:true})).toBeDisabled();
  for(let i=0;i<6;i++) {
    if(i===1) await game.getByRole('button',{name:'REVEAL LENS · SHOW THE DOTS',exact:true}).click();
    const pick=game.getByRole('button',{name:label(winner(i)),exact:true});
    await pick.focus(); await page.keyboard.press('Enter');
    await expect(game.locator('.match-status')).toContainText('is a match');
    const next=game.getByRole('button',{name:i===5?'FINISH EXPEDITION':'NEXT ROUND →',exact:true});
    await expect(next).toBeFocused(); await next.click();
  }
  await expect(game.locator('.match-finish')).toContainText('15 / 18 STARS');
  expect(await page.evaluate(()=>localStorage.getItem('lb:match:best:v1'))).toBe('15');
  await game.getByRole('button',{name:'SHARE CHALLENGE',exact:true}).click();
  await expect(game.getByRole('textbox',{name:'Challenge text'})).toHaveValue(/basis=42#basis-match/);
  await game.getByRole('button',{name:'REMIX THE MAPS',exact:true}).click();
  await expect(game.locator('.match-finish')).toHaveCount(0);
  await game.getByRole('button',{name:'SHARE CHALLENGE',exact:true}).click();
  await expect(game.getByRole('textbox',{name:'Challenge text'})).toHaveValue(/basis=43#basis-match/);
  await page.reload();
  await expect(game.locator('.flight-medal-total')).toHaveText('BEST 15 / 18 STARS');
  await game.locator('summary').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.route('**/match-axe.js',route=>route.fulfill({contentType:'application/javascript',body:readFileSync(require.resolve('axe-core/axe.js'),'utf8')}));
  await page.addScriptTag({url:'/match-axe.js'});
  const violations=await page.evaluate(async()=> (await (window as any).axe.run(document.querySelector('#basis-match'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map((v:any)=>({id:v.id,targets:v.nodes.map((n:any)=>n.target)})));
  expect(violations).toEqual([]); expect(errors).toEqual([]);
});

test('Basis Match completes with blocked storage and a refused clipboard', async({page})=>{
  await page.addInitScript(()=>{
    Storage.prototype.getItem=()=>{throw new Error('blocked');};
    Storage.prototype.setItem=()=>{throw new Error('blocked');};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('blocked'))}});
  });
  await page.goto('/?basis=42#basis-match');
  const game=page.locator('#basis-match');
  for(let i=0;i<6;i++) {
    await game.getByRole('button',{name:label(winner(i)),exact:true}).click();
    await game.getByRole('button',{name:i===5?'FINISH EXPEDITION':'NEXT ROUND →',exact:true}).click();
  }
  await expect(game.locator('.match-finish')).toContainText('18 / 18 STARS');
  await expect(game.locator('.flight-save-note')).toContainText('Storage is unavailable');
  await game.getByRole('button',{name:'SHARE CHALLENGE',exact:true}).click();
  await expect(game.locator('.match-share')).toContainText('Select the text below');
});
