import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
import {identityOrigin,siteOrigin} from '../../scripts/demo-addresses.js';

test('packaged starter works in a folder linked from plain HTML and withdrawal leaves public pages public',async({page,context,request})=>{
  const files=unzipSync(readFileSync('dist/starter.zip'));
  for(const name of ['index.html','app.js','style.css']){
    const response=await request.get(siteOrigin+'/community-login/'+(name==='index.html'?'':name));
    expect(response.ok()).toBe(true);
    expect(await response.body()).toEqual(Buffer.from(files[name]));
  }
  await page.goto(siteOrigin+'/old-site.html');
  await page.getByRole('link',{name:'Connect your community identity'}).click();
  await page.getByRole('button',{name:'Continue with FRRN'}).click();
  await page.getByRole('button',{name:'Continue as Robin'}).click();
  await page.getByLabel('Your name on this website').fill('HTML member');
  const memberships=page.getByRole('checkbox');
  for(let i=0;i<await memberships.count();i++)await memberships.nth(i).uncheck();
  await page.getByRole('checkbox',{name:'Lakeside community'}).check();
  await page.getByRole('button',{name:'Allow and continue'}).click();
  await expect(page).toHaveURL(siteOrigin+'/community-login/');
  await expect(page.locator('#signed-in')).toBeVisible();
  const disclosed=JSON.parse(await page.locator('#received').textContent());
  expect(disclosed.name).toBe('HTML member');
  expect(disclosed.memberships).toHaveLength(1);
  expect(disclosed.memberships[0].name).toBe('Lakeside community');
  expect(disclosed.memberships[0].training_verified).toBe(false);
  expect(disclosed).not.toHaveProperty('email');
  await page.reload();
  await expect(page.locator('#signed-in')).toBeVisible();
  const manage=await context.newPage();await manage.goto(identityOrigin+'/identity/sites');
  await manage.locator('.connection').filter({has:manage.getByRole('heading',{name:'Lakeside website',exact:true})}).getByRole('button',{name:'Disconnect'}).click();
  await page.getByRole('button',{name:'Check access now'}).click();
  await expect(page.locator('#signed-out')).toBeVisible();
  const publicPage=await request.get(siteOrigin+'/old-site.html');
  expect(publicPage.status()).toBe(200);
  expect(await publicPage.text()).toContain('Our public notices remain available without signing in.');
});
