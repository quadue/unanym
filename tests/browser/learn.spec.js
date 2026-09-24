import {test,expect} from '@playwright/test';
import {identityOrigin} from '../../scripts/demo-addresses.js';
const url=identityOrigin+'/identity/learn';

test('practice choices stay local, can be declined, reviewed and reset',async({page,context})=>{
 await page.goto(url);
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.getByRole('button',{name:'Continue with FRRN',exact:true}).click();
 await expect(page.getByRole('checkbox')).not.toBeChecked();
 await page.getByRole('button',{name:'Not now',exact:true}).click();
 await expect(page.locator('[data-step="start"]')).toBeVisible();
 await page.getByRole('button',{name:'Continue with FRRN',exact:true}).click();
 await page.getByLabel('Your name on this website').selectOption('River');
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Allow and continue',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Welcome, River.'})).toBeFocused();
 await expect(page.locator('[data-step="connected"]')).toContainText('Membership: Meadow circle');
 await page.getByRole('button',{name:'Manage what I share'}).click();
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Practice connection ended'})).toBeFocused();
 await expect(page.locator('[data-step="done"]')).toContainText('Information already shared may remain');
 await page.getByRole('button',{name:'Practise again'}).click();
 await page.getByRole('button',{name:'Continue with FRRN',exact:true}).click();
 await expect(page.getByLabel('Your name on this website')).toHaveValue('Robin');
 await expect(page.getByRole('checkbox')).not.toBeChecked();
 await page.getByRole('button',{name:'Allow and continue',exact:true}).click();
 await expect(page.locator('[data-step="connected"]')).toContainText('No community memberships');
 expect(requests).toEqual([]);
 expect(await context.cookies()).toEqual([]);
 expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
});

test('small screens and reduced motion retain a keyboard-operable practice',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);
 await expect(page.locator('#watch-story')).toBeHidden();
 await page.getByRole('button',{name:'Next illustration'}).click();
 await expect(page.locator('#story-caption')).toContainText('1 of 3');
 await page.getByRole('button',{name:'Continue with FRRN',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'What may Garden community see?'})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.keyboard.press('Tab');await expect(page.getByLabel('Your name on this website')).toBeFocused();
 await page.keyboard.press('Tab');await expect(page.getByRole('checkbox')).toBeFocused();
 await page.keyboard.press('Space');await expect(page.getByRole('checkbox')).toBeChecked();
});

test('optional animation can be paused; the explanation also works without scripts',async({page,browser})=>{
 await page.goto(url);await page.clock.install();
 await page.getByRole('button',{name:'Watch the steps',exact:true}).click();
 await page.clock.fastForward(5500);await expect(page.locator('#story-caption')).toContainText('2 of 3');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.clock.fastForward(12000);await expect(page.locator('#story-caption')).toContainText('2 of 3');
 const context=await browser.newContext({javaScriptEnabled:false});const noScript=await context.newPage();
 await noScript.goto(url);await expect(noScript.locator('.learn-cards article')).toHaveCount(3);
 await expect(noScript.locator('noscript p')).toContainText('three illustrations');
 await expect(noScript.locator('#practice-app')).toBeHidden();
 await context.close();
});
