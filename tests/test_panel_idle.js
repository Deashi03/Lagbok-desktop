// Regression checks for Ctrl+Alt+L panel state. Runs without Tauri or a browser.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../assets/desktop.js'),'utf8');

function mount({minutesIdle=null,page='law',query='gammal sökning',lookupOk=true}={}){
  const clock={now:10_000_000};
  const saved=new Map();
  if(minutesIdle!==null)saved.set('lagboken-desktop-last-activity',String(clock.now-minutesIdle*60*1000));
  const native=new Map(),docs=new Map(),wins=new Map(),timers=[];
  const on=(map,name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);};
  const calls={navigations:[],close:0,clear:0,quick:[],toast:[],focus:0,prevented:0};
  const state={page,query,sheetOpen:true};
  const sheet={get hidden(){return !state.sheetOpen;}};
  const input={get value(){return state.query;},set value(x){state.query=x;},focus(){document.activeElement=input;calls.focus++;}};
  const clear={click(){state.query='';calls.clear++;}};
  const searchButton={click(){throw Error('Quick jump sheet must not open in panel');}};
  const topbar={setAttribute(){}},actions={append(){}};
  const document={
    documentElement:{dataset:{panel:'true'}},
    visibilityState:'hidden',
    activeElement:null,
    hasFocus:()=>true,
    createElement:()=>({setAttribute(){},addEventListener(){}}),
    addEventListener:(name,fn)=>on(docs,name,fn),
    getElementById(id){
      if(id==='sheet')return sheet;
      if(id==='query')return state.page==='catalog'?input:null;
      if(id==='in-law-search')return searchButton;
      return null;
    },
    querySelector(sel){
      if(sel==='.topbar')return topbar;
      if(sel==='.top-actions')return actions;
      if(sel==='[data-action="clear-search"]')return state.page==='catalog'?clear:null;
      return null;
    },
  };
  const app={
    ready:()=>true,
    route:()=>({page:state.page}),
    closeSheet(){calls.close++;state.sheetOpen=false;},
    navigate(hash,replace){calls.navigations.push([hash,replace]);state.page='catalog';},
    goQuick(q){calls.quick.push(q);return Promise.resolve(lookupOk);},
    toast(x){calls.toast.push(x);},
    currentTitle:()=>'',favourites:()=>[],recents:()=>[],
  };
  const localStorage={
    getItem:k=>saved.has(k)?saved.get(k):null,
    setItem:(k,v)=>saved.set(k,String(v)),
  };
  const invoke=(name)=>Promise.resolve(name==='get_desktop_settings'?{}:null);
  const window={
    LAGBOK_DESKTOP:true,
    __TAURI__:{core:{invoke},event:{listen:(name,fn)=>on(native,name,fn)}},
    LagbokApp:app,
    addEventListener:(name,fn)=>on(wins,name,fn),
  };
  const location={hash:'#/law/1962-700/24/1'};
  vm.runInNewContext(source,{
    window,document,location,localStorage,
    Date:{now:()=>clock.now},
    setTimeout(fn){timers.push(fn);return timers.length;},
    clearTimeout(){},
    requestAnimationFrame(fn){timers.push(fn);},
    console,
  },{filename:'assets/desktop.js'});
  function flush(){
    let i=0;
    while(timers.length){const fn=timers.shift();fn();if(++i>120)throw Error('Timer loop');}
  }
  function emit(name,payload){
    for(const fn of native.get(name)||[])fn({payload});
    flush();
  }
  function docEvent(name,e={}){
    for(const fn of docs.get(name)||[])fn(e);
    flush();
  }
  return {clock,saved,state,calls,document,location,flush,emit,docEvent};
}

{
  const m=mount({minutesIdle:20,page:'law'});
  m.emit('panel-shown',null);
  assert.equal(m.state.page,'law','within an hour, remain on the same law');
  assert.equal(m.calls.navigations.length,0,'do not navigate away from current location');
  assert.equal(m.calls.close,1,'dismiss a sheet left open from previous visit');
  assert.equal(m.calls.focus,0,'do not take input focus from law reader');
}
{
  const m=mount({minutesIdle:60,page:'law'});
  m.emit('panel-shown',null);
  assert.equal(m.state.page,'catalog','at 60 minutes, return to main menu');
  assert.deepEqual(m.calls.navigations.map(n=>n[0]),['#/catalog']);
  assert.equal(m.calls.clear,1,'clear the stored query on reset');
  assert.equal(m.state.query,'','reset search input should be empty');
  assert.equal(m.document.activeElement.value,'','focus the empty main search');
}
{
  const m=mount({minutesIdle:null,page:'law'});
  m.emit('panel-shown',null);
  assert.equal(m.state.page,'catalog','first open without any history starts at catalog');
  assert.equal(m.calls.focus>0,true,'search should be ready for typing');
}
{
  const m=mount({minutesIdle:15,page:'catalog',query:'behåll'});
  m.emit('panel-shown',null);
  assert.equal(m.calls.navigations.length,0,'recent catalog stays as-is');
  assert.equal(m.state.query,'behåll','recent search is not discarded');
  assert.equal(m.document.activeElement.value,'behåll','focus search in catalog automatically');
}
{
  const m=mount({minutesIdle:59.9,page:'law'});
  m.emit('panel-shown',null);
  m.clock.now+=2000;
  m.docEvent('pointerdown');
  m.clock.now+=3599000;
  m.emit('panel-shown',null);
  assert.equal(m.state.page,'law','real activity extends the one-hour window');
}
{
  const m=mount({minutesIdle:80,page:'law'});
  m.emit('panel-shown','BrB 24:1');
  assert.deepEqual(m.calls.quick,['BrB 24:1'],'selected text lookup takes precedence over reset');
  assert.equal(m.calls.navigations.length,0);
}
{
  const m=mount({minutesIdle:10,page:'law'});
  m.emit('panel-shown',null);
  m.docEvent('click',{
    target:{closest:s=>s==='#in-law-search'?{}:null},
    preventDefault(){m.calls.prevented++;},
    stopPropagation(){},
  });
  assert.equal(m.state.page,'catalog','panel search icon opens embedded catalog search');
  assert.equal(m.calls.prevented,1,'prevent original quick-jump sheet opening');
  assert.equal(m.document.activeElement.value,'gammal sökning');
}
{
  const m=mount({minutesIdle:10,page:'law'});
  m.emit('panel-shown',null);
  m.docEvent('keydown',{
    key:'k',ctrlKey:true,shiftKey:false,altKey:false,metaKey:false,
    preventDefault(){m.calls.prevented++;},
  });
  assert.equal(m.state.page,'catalog','Ctrl+K in panel uses integrated search');
  assert.equal(m.calls.prevented,1);
}
console.log('Snabbpanel: 8 idle/resume/search checks passed');
