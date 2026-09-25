import {test,expect} from '@playwright/test';
import {identityOrigin as origin} from '../../scripts/demo-addresses.js';
const front=origin+'/identity/';
const card=(page,id)=>page.locator('#place-'+id);

test('FRRN place choices preview privately and apply only to the selected recipient',async({page})=>{
 const requests=[];page.on('request',r=>{if(r.method()!=='GET'||new URL(r.url()).origin!==origin)requests.push(r.url());});
 await page.goto(front);await expect(page.locator('header')).toContainText('frrn');
 await expect(page.locator('header')).not.toContainText('Unanym');
 await expect(card(page,'runners').locator('.receipt-name')).toHaveText('Rob');
 await expect(card(page,'choir').locator('.receipt-name')).toHaveText('Robin');
 await page.getByLabel('Name here').fill('River');await page.getByRole('checkbox').check();
 await expect(card(page,'repair').locator('.receipt-label')).toHaveText('Preview');
 await expect(card(page,'repair').locator('.receipt-memberships')).toHaveText('Repair Café member');
 await expect(page.getByRole('button',{name:'Disconnect',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Share with Repair Café',exact:false}).click();
 await expect(card(page,'repair').locator('.receipt-label')).toHaveText('Shared');
 await page.getByRole('checkbox').uncheck();
 await expect(page.locator('#history-detail')).toHaveText('River · Repair Café member');
 await page.getByRole('button',{name:'Northside Runners',exact:true}).click();
 await expect(card(page,'runners').locator('#sharing-form')).toBeVisible();await expect(page.getByLabel('Name here')).toHaveValue('Rob');
 await expect(card(page,'repair').locator('.receipt-label')).toHaveText('Shared');
 await expect(card(page,'repair').locator('.receipt-memberships')).toHaveText('Repair Café member');
 await page.getByRole('button',{name:'Repair Café',exact:true}).click();await expect(page.getByLabel('Name here')).toHaveValue('River');await expect(page.getByRole('checkbox')).not.toBeChecked();
 await page.getByRole('button',{name:'Share changes',exact:false}).click();
 await expect(card(page,'repair').locator('.receipt-memberships')).toBeEmpty();
 await expect(card(page,'runners').locator('.receipt-memberships')).toHaveText('Northside member');
 expect(requests).toEqual([]);expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
});

test('disconnect preserves previous disclosure and cannot apply an unshared draft',async({page})=>{
 await page.goto(front);await page.getByRole('button',{name:'Northside Runners',exact:true}).click();
 await page.getByLabel('Name here').fill('Unshared name');await page.getByRole('checkbox').uncheck();
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 await expect(page.locator('#history-detail')).toBeVisible();await expect(page.locator('#history-detail')).toHaveText('Rob · Northside member');
 await expect(page.locator('#sharing-history')).toContainText('Previous copies may remain');
 await expect(page.getByRole('button',{name:'Reconnect',exact:false})).toBeFocused();
 await page.getByRole('button',{name:'Riverside Choir',exact:true}).click();
 await expect(card(page,'runners').locator('.receipt-label')).toHaveText('Previously shared');
 await expect(card(page,'runners').locator('.receipt-name')).toHaveText('Rob');
 await page.getByRole('button',{name:'Reset example',exact:true}).click();
 await expect(page.getByLabel('Name here')).toHaveValue('Robin Maas');await expect(page.getByRole('checkbox')).not.toBeChecked();
 await expect(card(page,'repair').locator('.receipt-label')).toHaveText('Preview');
});

test('phone and keyboard keep controls in their recipient boundary without motion',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(front);
 await page.getByRole('button',{name:'Riverside Choir',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(card(page,'choir').locator('#sharing-form')).toBeVisible();
 await page.getByRole('button',{name:'Riverside Choir',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.locator('#sharing-form')).toBeHidden();await expect(page.getByRole('button',{name:'Riverside Choir',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.keyboard.press('Enter');await expect(card(page,'choir').locator('#sharing-form')).toBeVisible();
 await expect(card(page,'repair').locator('.place-body')).toBeHidden();
 await page.getByLabel('Name here').focus();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('R.');await page.keyboard.press('Tab');await page.keyboard.press('Space');
 await expect(page.getByRole('checkbox')).toBeChecked();await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 await expect(card(page,'choir').locator('.receipt-label')).toHaveText('Shared');
 expect(await card(page,'choir').locator('.receipt-person').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Touch targets and visibility also work at a typical phone width.
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Repair Café',exact:true}).click();
 await expect(card(page,'repair').locator('#sharing-form')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('front page without scripts retains the places and actual sign-in link',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:375,height:812}});const page=await context.newPage();
 try{await page.goto(front);await expect(page.locator('.place-body')).toHaveCount(3);for(const body of await page.locator('.place-body').all())await expect(body).toBeVisible();
  await expect(page.locator('#sharing-form')).toBeHidden();await expect(page.locator('noscript p')).toBeVisible();await expect(page.locator('noscript p')).toContainText('Each place receives its own identifier');await expect(page.getByRole('link',{name:'Sign in',exact:true}).first()).toHaveAttribute('href',/next=/);
 }finally{await context.close();}
});

test('the footer opens Unanym integration docs, while sign-in stays FRRN',async({page})=>{
 await page.goto(front);await page.getByRole('link',{name:'Identity by Unanym',exact:false}).click();
 await expect(page).toHaveTitle('Unanym · Website integration');await expect(page.getByRole('heading',{name:'Identity for community websites.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Connect WordPress'})).toBeVisible();
 await page.getByRole('link',{name:'Hosting guide',exact:true}).click();await expect(page.locator('body')).toContainText('Standalone operator pilot');
 await page.goto(front);await page.getByRole('link',{name:'Sign in',exact:true}).click();await expect(page).toHaveTitle('Local demo sign-in · FRRN');
 await expect(page.getByRole('button',{name:'Continue as Robin'})).toBeVisible();
});
