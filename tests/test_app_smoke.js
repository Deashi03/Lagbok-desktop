// Simulerar huvudsakliga användarflöden utan browserberoenden.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const search=require('../assets/search-core.js');
const legalLinks=require('../assets/legal-links.js');
const tocModel=require('../assets/toc-model.js');
const lawModel=require('../assets/law-model.js');
const catalog=require('../data/catalog.json');
const app=fs.readFileSync(require('node:path').join(__dirname,'../assets/app.js'),'utf8');
const laws={
 '1962:700':{chapters:[
   {number:'1',title:'Om brott',items:[{type:'para',number:'1',text:'Första paragrafen.'}]},
   {number:'24',title:'Om allmänna grunder för ansvarsfrihet',items:[{type:'para',number:'1',text:'Tjugofjärde kapitlet. Se 2 §.',amendedBy:'1994:458'},
     {type:'para',number:'2',text:'Det andra lagrummet.',versions:[{text:'Det andra lagrummet.',expires:{date:null,label:'den dag som regeringen bestämmer'}},{text:'Framtida lydelse.',inForce:{date:'2099-01-01'}}]},
     {type:'para',number:'3',text:'Har upphävts genom lag (2000:1).',repealed:true},{type:'para',number:'4',text:'Nöd.'}]},
   {number:'25',title:'Om böter m.m.',items:[{type:'para',number:'1',text:'Böter.'}]}
 ]},
 '1947:948':{chapters:[{number:'0',title:'',items:[{type:'para',number:'12',text:'Tolfte paragrafen.'}]}]}
};
const listeners={};
const node=id=>({
 id,hidden:false,innerHTML:'',value:'',scrollTop:0,textContent:'',dataset:{},querySelector(){return null},
 style:{setProperty(){}},classList:{toggle(){}},
 addEventListener(name,fn){(listeners[id+'.'+name]??=[]).push(fn)},
 setAttribute(){},getAttribute(){return ''},blur(){},focus(){},scrollIntoView(){}
});
const el=Object.fromEntries([
 'view','sheet','scrim','top-title','back','toc-button','find-button','pen-button','in-law-search','menu-button','toast',
 'query','search-results','catalog-directory','search-suggest','text-results','p-1','fap-results'
].map(id=>[id,node(id)]));
const nav=[node('nav-catalog'),node('nav-saved')];
nav[0].dataset.tab='catalog';nav[1].dataset.tab='saved';
const document={
 documentElement:{dataset:{},style:{setProperty(){}}},
 querySelector(selector){
   if(selector==='meta[name="theme-color"]')return {content:''};
   return el[selector.replace('#','')]||null;
 },
 querySelectorAll(selector){return selector==='.bottom-nav button'?nav:[]},
 addEventListener(name,fn){(listeners['document.'+name]??=[]).push(fn)}
};
const location={hash:'#/catalog'};
const history={
 length:2,
 pushState(_s,_t,url){location.hash=url},
 replaceState(_s,_t,url){location.hash=url}
};
const window={
 LagbokSearch:search,LagbokReferences:legalLinks,LagbokTOC:tocModel,LagbokLaw:lawModel,LagbokIndex:require('../assets/search-index.js'),LagbokHighlights:require('../assets/highlights.js'),
 matchMedia:()=>({matches:false,addEventListener(){}}),
 addEventListener(name,fn){(listeners['window.'+name]??=[]).push(fn)}
};
async function fakeFetch(url){
 if(url==='data/catalog.json')return {ok:true,json:async()=>catalog};
 if(url.startsWith('data/index/'))return {ok:false,json:async()=>({})};
 const parts=/(\d{4})-(\d+)\.json/.exec(url);
 const record=parts?laws[parts[1]+':'+parts[2]]:null;
 return {ok:!!record,json:async()=>record};
}
const sandbox={
 document,window,location,history,navigator:{},fetch:fakeFetch,
 localStorage:{getItem:()=>null,setItem(){}},
 CSS:{escape:s=>s},requestAnimationFrame:fn=>fn(),
 setTimeout:()=>0,clearTimeout(){},console
};
vm.runInNewContext(app,sandbox,{filename:'assets/app.js'});
async function settle(){for(let i=0;i<30;i++)await Promise.resolve();}
async function submit(q){
 el.query.value=q;
 await listeners['view.submit'][0]({target:{id:'global-search'},preventDefault(){}});
 await settle();
}
(async()=>{
 await settle();
 assert.match(el.view.innerHTML,/Hitta lagrum/);
 listeners['view.input'][0]({target:{id:'query',value:'BrB 24:1'}});
 assert.match(el['search-results'].innerHTML,/Direkt till/);
 assert.match(el['search-suggest'].innerHTML,/Direkt till BrB 24:1/);
 await submit('BrB 1');
 assert.equal(location.hash,'#/law/1962%3A700/1');
 await submit('BrB 24:1');
 assert.equal(location.hash,'#/law/1962%3A700/24/1');
 assert.match(el.view.innerHTML,/Tjugofjärde kapitlet/);
 assert.match(el.view.innerHTML,/reading-mode-standard/);
 assert.doesNotMatch(el.view.innerHTML,/chapter-navigation/);
 assert.doesNotMatch(el.view.innerHTML,/Nästa: 2 §/);
 assert.doesNotMatch(el.view.innerHTML,/read-modes/);
 assert.equal(el['toc-button'].hidden,false,'Innehåll sitter i rubrikraden');
 assert.match(el.view.innerHTML,/paragraph-heading-button/);
 assert.match(el.view.innerHTML,/data-ref-para="2"/);
 // 0.5: redaktionell rubrik, ändrings-SFS, lydelser, upphävd paragraf och nästa kapitel
 assert.match(el.view.innerHTML,/paragraph-title">Nödvärn</);
 assert.match(el.view.innerHTML,/Nödvärn och laga befogenhet/);
 assert.match(el.view.innerHTML,/Ändrad genom SFS 1994:458/);
 assert.match(el.view.innerHTML,/Gäller till den dag regeringen bestämmer/);
 assert.match(el.view.innerHTML,/Kommande lydelse · träder i kraft 1 januari 2099/);
 assert.match(el.view.innerHTML,/Framtida lydelse/);
 assert.match(el.view.innerHTML,/class="paragraph reader-block repealed"/);
 assert.match(el.view.innerHTML,/Nästa kapitel/);
 // Hänvisningar öppnas direkt och ger en tillbaka-knapp.
 const refTarget={
   dataset:{refSfs:'1962:700',refChapter:'24',refPara:'2'},
   closest(selector){
     if(selector==='[data-ref]')return this;
     if(selector==='.paragraph')return {dataset:{paragraph:'1'}};
     return null;
   }
 };
 listeners['document.click'][0]({target:refTarget,preventDefault(){}});
 await settle();
 assert.equal(location.hash,'#/law/1962%3A700/24/2');
 assert.match(el.view.innerHTML,/Tillbaka till BrB 24:1/);
 listeners['document.click'][0]({target:{
   dataset:{action:'toc'},
   closest(selector){return selector==='[data-action]'?this:null}
 }});
 await settle();
 assert.equal(el.sheet.dataset.kind,'toc');
 assert.match(el.sheet.innerHTML,/toc-paragraphs/);
 assert.match(el.sheet.innerHTML,/toc-current/);
 assert.doesNotMatch(el.sheet.innerHTML,/para-grid/);
 assert.match(el.sheet.innerHTML,/Nödvärn och laga befogenhet/);
 const selectPara={
   closest(selector){
     if(selector==='a[data-link]')return {getAttribute:()=> '#/law/1962%3A700/24/1'};
     return null;
   }
 };
 listeners['document.click'][0]({target:selectPara,preventDefault(){}});
 await settle();
 assert.equal(location.hash,'#/law/1962%3A700/24/1');
 assert.equal(el.sheet.hidden,true);

 const action=(name,extra={})=>({
   dataset:{action:name,...extra},
   closest(selector){return selector==='[data-action]'?this:null}
 });
 listeners['document.click'][0]({target:action('read-mode',{mode:'compact'})});
 await settle();
 assert.match(el.view.innerHTML,/reading-mode-compact/);
 listeners['document.click'][0]({target:action('toggle-focus')});
 await settle();
 assert.equal(document.documentElement.dataset.focus,'true');
 listeners['document.click'][0]({target:action('toggle-focus')});
 await settle();
 assert.equal(document.documentElement.dataset.focus,'false');

 await submit('FuK 12');
 assert.equal(location.hash,'#/law/1947%3A948/0/12');
 assert.match(el.view.innerHTML,/Tolfte paragrafen/);
 await submit('FAP 104-4');
 assert.equal(location.hash,'#/fap/FAP%20104-04');
 assert.match(el.view.innerHTML,/fap-frame/);
 assert.match(el.view.innerHTML,/polisen\.se/);
 
 // Kapitellistan låter användaren välja avsnitt innan läsningen börjar.
 location.hash='#/law/1962%3A700';
 await listeners['window.hashchange'][0]();await settle();
 assert.match(el.view.innerHTML,/chapter-item/);
 assert.match(el.view.innerHTML,/Hela kapitlet/);
 assert.match(el.view.innerHTML,/href="#\/law\/1962%3A700\/24\/4"[^>]*><span class="grow"><span class="chapter-section-title">Nöd</);
 console.log('Appflöden 0.5: sökning, kapitelavsnitt, lydelser, direkta hänvisningar och FAP godkända');
})().catch(error=>{console.error(error);process.exitCode=1});
