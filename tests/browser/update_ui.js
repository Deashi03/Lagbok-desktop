// Runtime update UI tests with simulated Tauri; does not install or contact GitHub.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const URL=process.env.LAGBOK_URL||'http://localhost:8765/';
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1536,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
   window.__updaterCalls=[];
   window.__updaterMode='available';
   window.__TAURI__={
     core:{invoke:async(name,args)=>{
       window.__updaterCalls.push({name,args});
       if(name==='check_update'){
         if(window.__updaterMode==='error')throw Error('simulated network error');
         return window.__updaterMode==='available'?'1.1.3':null;
       }
       if(name==='get_desktop_settings')return {};
       return null;
     }},
     event:{listen:async()=>()=>{}}
   };
 });
 await page.goto(URL+'?notutorial#/catalog');
 await page.waitForFunction(()=>window.__updaterCalls.some(x=>x.name==='check_update'),{timeout:30000});
 await page.locator('#update-banner').waitFor();
 assert.equal(await page.locator('#top-version').evaluate(el=>el.tagName),'BUTTON','version should be actionable');
 assert.equal(await page.locator('.desktop-update-notice').count(),1);
 assert.ok(await page.getByRole('button',{name:'Installera och starta om'}).isVisible());
 const before=await page.evaluate(()=>window.__updaterCalls.filter(x=>x.name==='check_update').length);
 await page.click('#top-version');
 await page.waitForFunction(count=>window.__updaterCalls.filter(x=>x.name==='check_update').length>count,before);
 assert.equal(await page.locator('#update-banner').count(),1,'only one announcement, not duplicates');
 await page.getByRole('button',{name:'Installera och starta om'}).click();
 await page.waitForFunction(()=>window.__updaterCalls.some(x=>x.name==='install_update'));
 assert.match(await page.locator('.desktop-update-feedback').textContent(),/Installationen är startad/);
 assert.ok(await page.locator('#update-banner a[href*="releases/latest"]').count(),'manual fallback always available');
 // Manual verification detects errors, showing a retry state without a fake 'latest' message.
 await page.evaluate(()=>{window.__updaterMode='error';document.querySelector('#update-banner').remove();});
 await page.click('#top-version');
 await page.waitForFunction(()=>document.querySelector('#top-version').classList.contains('update-error'));
 assert.match(await page.locator('#top-version').getAttribute('title'),/misslyckades/i);
 // Check the no-update path.
 await page.evaluate(()=>window.__updaterMode='none');
 await page.click('#top-version');
 await page.waitForFunction(()=>!document.querySelector('#top-version').classList.contains('update-error'));
 assert.ok(!await page.locator('#update-banner').count());
 assert.deepEqual(errors,[]);
 console.log('Desktop updater: startup, clickable version, install, manual fallback, failure and no-update passed');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
