import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'file:///C:/Users/linru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const output=process.env.DIRECTORY_REPORT||'D:/blog-kb/reports/directory-workspaces-e2e-20260907.json';
const head=JSON.parse(await readFile(resolve(root,'release-head.json'),'utf8'));
const dataRoot=resolve(root,'releases',head.releaseId);
const html=(await readFile(resolve(root,'index.html'),'utf8')).replaceAll(`./releases/${head.releaseId}/`,'./');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'||path==='/index.html'){res.writeHead(200,{'Content-Type':types['.html']}).end(html);return;}
 const file=resolve(root,'.'+decodeURIComponent(path));
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try {let bytes;try{bytes=await readFile(file);}catch{bytes=await readFile(resolve(dataRoot,'.'+decodeURIComponent(path)));}
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(process.argv.includes('--serve') ? 4178 : 0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
if (process.argv.includes('--serve')) {
 console.log(`本地源码预览：${origin}`);
 await new Promise(()=>{});
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={status:'running',scenarios:[]};
let activePage;
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  activePage=page;
  const requests=[],errors=[];
  page.on('request',r=>{if(r.url().startsWith(origin))requests.push(new URL(r.url()).pathname);});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForTimeout(200);
  assert.ok(!requests.includes('/main.js')); assert.ok(!requests.includes('/data/catalog.json'));
  const personStart=requests.length;
  await page.locator('#mode-person').click();
  await page.locator('.person-directory-row').first().waitFor({timeout:30000});
  assert.ok(!requests.includes('/main.js'));assert.ok(!requests.includes('/data/catalog.json'));
  const personRequests=requests.slice(personStart).filter(p=>p.endsWith('.json'));
  assert.equal(personRequests.length,2);
  await page.locator('#person-directory-search').fill('成濑');
  await page.waitForFunction(()=>document.querySelector('#person-directory-count').textContent!=='0');
  await page.locator('#mode-company').click();await page.locator('.company-directory-card').first().waitFor({timeout:30000});
  assert.ok(!requests.includes('/main.js'));
  assert.ok(!requests.some(p=>/ratings|media-clearance|png-export|sticker-editor|ranking-view/.test(p)));
  const companies=await page.locator('#company-directory-total').innerText();
  await page.locator('.company-directory-card-open').first().click();await page.locator('.company-directory-work').first().waitFor();
  const sampleCompany={name:await page.locator('#company-detail-title').innerText(),meta:await page.locator('#company-detail-meta').innerText(),firstWork:await page.locator('.company-directory-work').first().innerText()};
  await page.locator('#mode-person').click();await page.locator('.person-directory-row').first().waitFor();
  assert.equal(requests.filter(p=>p.endsWith('directory-index.json')).length,1);
  await page.locator('#mode-selection').click();await page.locator('#catalog-grid .selection-card').first().waitFor({timeout:60000});
  assert.equal(requests.filter(p=>p==='/data/catalog.json').length,1,'full runtime reuses parsed company catalog');
  await page.locator('#mode-person').click();await page.locator('.person-directory-row').first().waitFor();
  assert.equal(requests.filter(p=>p.endsWith('directory-index.json')).length,1,'full runtime reuses person index');
  await page.locator('#mode-company').click();await page.locator('.company-directory-card').first().waitFor();
  assert.equal(await page.locator('#company-directory-total').innerText(),companies);
  await page.locator('.company-directory-card-open').first().click();await page.locator('.company-directory-work').first().waitFor();
  assert.deepEqual({name:await page.locator('#company-detail-title').innerText(),meta:await page.locator('#company-detail-meta').innerText(),firstWork:await page.locator('.company-directory-work').first().innerText()},sampleCompany);
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.scenarios.push({width,personRequests,companies,sharedFetch:true,companyParity:true,errors});
  await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();activePage=page;
  let attempts=0;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/performance-manifest.json*',async route=>{
    attempts++;
    if(attempts<=2)await route.fulfill({status:503,body:'temporarily unavailable'});
    else await route.continue();
  });
  await page.goto(origin+'/#persons',{waitUntil:'domcontentloaded'});
  await page.locator('#galpedia-load-status button').waitFor({state:'visible'});
  const retryAt=await page.evaluate(()=>import('./lib/person-workspace-data.js').then(m=>m.getPersonWorkspaceRuntime().loadDirectory()).catch(error=>error.retryAt));
  assert.equal(attempts,2);
  await page.locator('#galpedia-load-status button').click();assert.equal(attempts,2);
  await page.locator('#mode-company').click();await page.locator('.company-directory-card').first().waitFor();
  await page.waitForTimeout(Math.max(0,retryAt-Date.now())+50);
  await page.locator('#mode-person').click();await page.locator('.person-directory-row').first().waitFor();
  assert.equal(attempts,3);
  await page.locator('#person-page-next').click();assert.match(page.url(),/page=2/);
  await page.locator('.person-directory-row').first().click();
  await page.waitForFunction(()=>document.querySelector('#person-detail-dialog').open&&document.querySelector('#person-detail-dialog').getAttribute('aria-busy')==='false',{},{timeout:60000});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#person-detail-dialog').open);
  assert.deepEqual(errors,[]);report.scenarios.push({failureIsolation:true,retry:true,personDetailHandoff:true,errors});await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();activePage=page;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/performance-manifest.json*',async route=>{await new Promise(done=>setTimeout(done,500));await route.continue();});
  await page.goto(origin+'/#persons',{waitUntil:'domcontentloaded'});
  await page.locator('#mode-company').click();await page.locator('.company-directory-card').first().waitFor();
  await page.waitForTimeout(700);assert.equal(await page.locator('#person-view').isHidden(),true);
  assert.equal(await page.locator('#mode-company').getAttribute('aria-selected'),'true');
  await page.locator('#company-selection-mode-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#company-selection-mode-toggle').getAttribute('aria-pressed')==='true',{},{timeout:60000});
  await page.locator('#company-selection-mode-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#company-selection-mode-toggle').getAttribute('aria-pressed')==='false');
  assert.deepEqual(errors,[]);report.scenarios.push({lateResponseIsolated:true,selectionHandoff:true,singleEventOwner:true,errors});await context.close();
 }
 report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;
 if(activePage&&!activePage.isClosed()){
  report.diagnostic=await activePage.evaluate(()=>({hash:location.hash,body:document.body.innerText.slice(-1800),load:document.querySelector('#galpedia-load-status')?.outerHTML,sections:[...document.querySelectorAll('#workspace > section')].map(n=>({id:n.id,hidden:n.hidden})),cards:document.querySelectorAll('.selection-card').length}));
  await activePage.screenshot({path:output.replace('.json','-failure.png')});
 }
}
finally{await browser.close();await new Promise(done=>server.close(done));}
await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
