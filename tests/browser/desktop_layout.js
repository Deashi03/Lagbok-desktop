// Desktop-only responsive layout regression tests. Shares the local server used by e2e.js.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const URL=process.env.LAGBOK_URL||'http://localhost:8765/';

(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1536,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const go=async hash=>{
    await page.goto(URL+'?notutorial#'+hash);
    await page.waitForSelector('#view .page, #view .wide-law',{timeout:30000});
    await page.waitForTimeout(500);
  };
  const snapshot=()=>page.evaluate(()=>{
    const box=x=>{const el=document.querySelector(x);if(!el)return null;
      const r=el.getBoundingClientRect(),css=getComputedStyle(el);
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
        display:css.display,columns:css.gridTemplateColumns,overflowY:css.overflowY};
    };
    return {viewport:innerWidth,htmlWidth:document.documentElement.scrollWidth,
      shell:box('.app-shell'),topbar:box('.topbar'),nav:box('.bottom-nav'),
      view:box('#view'),reader:box('.wide-law>.law-reader'),toc:box('.wide-toc'),
      side:box('.wide-side'),law:box('.wide-law')};
  });

  // Cross-reference rich layout including the contents and contextual information.
  await go('/law/1962%3A700/3/8');
  for(const width of [1100,1280,1399,1400,1536,1920,2560]){
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(400);
    const s=await snapshot();
    assert.ok(s.htmlWidth<=width+2,'no page-level horizontal scrolling at '+width+'px');
    assert.ok(Math.abs(s.shell.width-width)<3,'shell uses full width at '+width+'px');
    assert.ok(s.view.height>=840,'reading area uses nearly the entire height at '+width+'px');
    assert.ok(s.nav.bottom<=s.view.y+2,'navigation occupies topbar, not bottom: '+width);
    assert.ok(s.toc.width>=210&&s.reader.width>=465,'reader and contents remain readable at '+width);
    assert.ok(s.law.right<=width+2,'law grid fits within screen at '+width);
    if(width<1400)assert.equal(s.side.display,'none','avoid squeezed third column at '+width);
    else {
      assert.notEqual(s.side.display,'none','contextual sidebar accessible at '+width);
      assert.ok(s.side.width>=205,'sidebar not too narrow at '+width);
    }
  }

  // Source example: a newer short statute must not leave a forced empty right column.
  await page.setViewportSize({width:1536,height:900});
  await go('/law/2025%3A1062/0/4');
  const statute=await snapshot();
  assert.ok(statute.htmlWidth<=1538,'short law never forces horizontal scrolling');
  assert.ok(statute.reader.width>=560,'short law gets useful reading width');
  const sideEmpty=await page.evaluate(()=>{const aside=document.querySelector('.wide-side');return !!aside&&!aside.textContent.trim();});
  if(sideEmpty)assert.equal(statute.side.display,'none','empty context sidebar collapses');

  // Search: a sensible-sized search field, vertically arranged filters and full-width results area.
  await go('/catalog');
  await page.fill('#query','Skjutlagen');
  await page.waitForSelector('#text-results>.search-filters',{timeout:30000});
  const search=await page.evaluate(()=>{
    const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,y:r.y};};
    const filters=document.querySelector('#text-results>.search-filters');
    return {field:rect('#global-search'),filters:rect('#text-results>.search-filters'),
      info:rect('#text-results>.empty, #text-results>.card-list, #text-results>.small'),
      filterDirection:getComputedStyle(filters).flexDirection,
      resultColumns:getComputedStyle(document.querySelector('#text-results')).gridTemplateColumns,
      pageRight:rect('#view>.page').right};
  });
  assert.ok(search.field.width<=925,'do not stretch search field across entire monitor');
  assert.equal(search.filterDirection,'column','desktop search uses a vertical filter rail');
  assert.ok(search.info.left>search.filters.right,'search results use space beside filters');
  assert.ok(search.pageRight<=1538,'search page fits within viewport');
  assert.ok(search.resultColumns.split(' ').filter(Boolean).length>=2,'search uses a two-column layout');

  // Compact/resized windows keep the original stacked navigation, without desktop overflow.
  await page.setViewportSize({width:820,height:800});await page.waitForTimeout(500);
  const narrow=await snapshot();
  assert.ok(narrow.nav.y>=narrow.view.bottom-2,'small windows keep navigation at bottom');
  assert.ok(narrow.htmlWidth<=822,'compact view does not overflow');

  assert.deepEqual(errors,[],'no unhandled browser errors');
  console.log('Desktop layout: 7 reader widths, short statute, full-width search and compact window passed');
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
