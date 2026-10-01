import {test,expect} from '@playwright/test';
import {identityOrigin} from '../../scripts/demo-addresses.js';
const url=identityOrigin+'/identity/learn';

test('learning explains account and sharing without simulated choices or persistence',async({page,context})=>{
 await page.goto(url);
 await expect(page.locator('main')).not.toContainText(/practice|pretend|hypothetical|alpha/i);
 await expect(page.getByRole('link',{name:'Your FRRN account',exact:true})).toHaveAttribute('href','/identity/sites');
 await expect(page.locator('form,input,select,#practice-app')).toHaveCount(0);
 expect(await context.cookies()).toEqual([]);
 expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
});

test('small screens and reduced motion retain keyboard-operable illustrations and account entry',async({page})=>{
 await page.setViewportSize({width:320,height:812});
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);
 await expect(page.locator('#watch-story')).toBeHidden();
 await page.getByRole('button',{name:'Next illustration'}).focus();await page.keyboard.press('Enter');
 await expect(page.locator('#story-caption')).toContainText('1 of 3');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('link',{name:'Your FRRN account',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Continue as Robin'})).toBeVisible();
});

test('optional animation can be paused; the explanation and account link work without scripts',async({page,browser})=>{
 await page.goto(url);await page.clock.install();
 await page.getByRole('button',{name:'Watch the steps',exact:true}).click();
 await page.clock.fastForward(5500);await expect(page.locator('#story-caption')).toContainText('2 of 3');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.clock.fastForward(12000);await expect(page.locator('#story-caption')).toContainText('2 of 3');
 const context=await browser.newContext({javaScriptEnabled:false});const noScript=await context.newPage();
 await noScript.goto(url);await expect(noScript.locator('.learn-cards article')).toHaveCount(3);
 await expect(noScript.locator('#animation-controls')).toBeHidden();
 await expect(noScript.getByRole('link',{name:'Your FRRN account',exact:true})).toBeVisible();
 await context.close();
});
