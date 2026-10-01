import {test,expect} from '@playwright/test';
import {identityOrigin} from '../../scripts/demo-addresses.js';
const url=identityOrigin+'/identity/learn';

test('one explanation leads to the account and keeps reading separate from sharing',async({page,context})=>{
 await page.goto(url);
 await expect(page.getByRole('heading',{level:1})).toHaveText('How FRRN works');
 await expect(page.getByRole('link',{name:'Your FRRN account',exact:true})).toHaveAttribute('href','/identity/sites');
 await expect(page.locator('form,input,select,button')).toHaveCount(0);
 await expect(page.locator('.learn-questions details[open]')).toHaveCount(0);
 expect(await context.cookies()).toEqual([]);
 expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
});

test('phone readers can open questions and reach their account with a keyboard',async({page})=>{
 await page.setViewportSize({width:320,height:812});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);
 await page.locator('#memberships>summary').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#memberships')).toHaveAttribute('open','');
 await expect(page.locator('#memberships')).toContainText('An authorised organiser approves it');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('link',{name:'Your FRRN account',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Continue as Robin'})).toBeVisible();
});

test('privacy and illustrations work without scripts or a second member-guide page',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
 await page.goto(url);await expect(page.locator('.learn-cards article')).toHaveCount(3);
 await page.locator('#privacy-details>summary').click();
 await expect(page.locator('#privacy-details')).toContainText('operator holds the records and signing keys');
 await expect(page.getByRole('link',{name:'Your FRRN account',exact:true})).toBeVisible();
 await context.close();
});
