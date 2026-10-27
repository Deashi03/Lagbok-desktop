/* Lagbok Desktop 1.1 – Windows-delen av webbappen. Pratar med skalet i src-tauri:
   snabbpanelen (kortkommando, slå upp markerad text), Lagbok-länkar (lagbok://), hopplistan, externa länkar,
   fönstertiteln, uppdateringar och Windows-inställningarna. Dessutom det som hör datorn till: kortkommandon i
   appen, musens bakåt/framåt, förhandsvisning av hänvisningar, högerklick på paragrafer och kopiering med källa.
   Gör ingenting i en vanlig webbläsare. */
(function(){
  'use strict';
  if(!window.LAGBOK_DESKTOP||!window.__TAURI__)return;
  const {invoke}=window.__TAURI__.core,{listen}=window.__TAURI__.event;
  const app=()=>window.LagbokApp;
  const panel=document.documentElement.dataset.panel==='true';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const whenReady=fn=>{const tick=()=>app()&&app().ready()?fn():setTimeout(tick,50);tick();};
  const sheetOpen=()=>{const s=document.getElementById('sheet');return !!s&&!s.hidden;};
  const typing=e=>{const t=e.target;return !!t&&(/^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable);};
  // Egna val för Windows-delen (per dator, i webbdelens lagring).
  const local=(()=>{let v={};try{v=JSON.parse(localStorage.getItem('lagboken-desktop')||'{}');}catch(_){}return v;})();
  const saveLocal=()=>{try{localStorage.setItem('lagboken-desktop',JSON.stringify(local));}catch(_){}};
  if(local.copyCitation===undefined)local.copyCitation=true;

  // Länkar till webbsidor och e-post öppnas i Windows standardprogram, inte inne i appen.
  document.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
    const href=a.getAttribute('href');
    if(/^(?:https?:|mailto:)/i.test(href)){e.preventDefault();e.stopPropagation();invoke('open_external',{url:a.href}).catch(()=>{});}
  },true);

  // ---- Lagbok-länkar: lagbok://go/<adress i appen> (hopplistan) eller lagbok://BrB/3/8 och lagbok://BrB 3:8 ----
  function openLink(url){
    const rest=decodeURIComponent(String(url).replace(/^lagbok:\/*/i,'')).replace(/\/+$/,'');
    if(/^go\//i.test(rest)){location.hash=rest.slice(3);return;}
    const q=rest.replace(/^open\//i,'').replace(/\//g,' ').trim();
    if(q)whenReady(()=>app().goQuick(q).then(ok=>{if(!ok)app().toast('Hittade inte '+q);}));
  }
  // Skalet sparar länken tills den hämtas, så att en länk som startade appen inte går förlorad.
  const takeLink=()=>invoke('take_pending_link').then(url=>{if(url)openLink(url);}).catch(()=>{});
  if(!panel){listen('deep-link',takeLink);takeLink();listen('open-hash',e=>{location.hash=e.payload;});}

  // ---- Snabbpanelen ----
  if(panel){
    // Esc döljer panelen när ingen meny är öppen; menyer stängs först som vanligt.
    document.addEventListener('keydown',e=>{
      if(e.key!=='Escape'||sheetOpen()||document.getElementById('hl-pop'))return;
      if(typing(e)&&e.target.value){return;}
      invoke('hide_panel').catch(()=>{});
    });
    // Rubrikraden är fönstrets dragrad; två knappar: öppna det som visas i huvudfönstret, och dölj panelen.
    const bar=document.querySelector('.topbar'),actions=document.querySelector('.top-actions');
    if(bar){bar.setAttribute('data-tauri-drag-region','');const title=document.getElementById('top-title');if(title)title.setAttribute('data-tauri-drag-region','');}
    if(actions){
      const open=document.createElement('button');open.type='button';open.className='icon-button';open.id='panel-open-main';
      open.setAttribute('aria-label','Öppna i Lagbok Desktop');open.title='Öppna i huvudfönstret';open.textContent='⤢';
      open.addEventListener('click',()=>invoke('open_in_main',{hash:location.hash||'#/catalog'}).catch(()=>{}));
      const close=document.createElement('button');close.type='button';close.className='icon-button';close.id='panel-close';
      close.setAttribute('aria-label','Dölj snabbpanelen (Esc)');close.title='Dölj (Esc)';close.textContent='×';
      close.addEventListener('click',()=>invoke('hide_panel').catch(()=>{}));
      actions.append(open,close);
    }
    // Panelen visar samma sida som när man lämnade den. Bara på startsidan får sökfältet markören direkt.
    // Var något markerat i programmet man stod i öppnas det lagrummet i stället.
    const shown=lookup=>whenReady(()=>{
      if(lookup){app().goQuick(lookup).then(ok=>{if(!ok)focusStart();});return;}
      focusStart();
    });
    const focusStart=()=>{
      if(!['catalog','home','search'].includes(app().route().page))return;
      let n=0;const tryFocus=()=>{const q=document.getElementById('query');
        if(q&&document.activeElement===q&&document.hasFocus())return;
        if(q&&!sheetOpen())q.focus({preventScroll:true});if(++n<8)setTimeout(tryFocus,80);};
      tryFocus();
    };
    listen('panel-shown',e=>shown(e.payload));
    // Reserv om sidan läses in först när panelen visas första gången (då hinner signalen gå förbi).
    whenReady(()=>{if(document.visibilityState==='visible')focusStart();});
    window.addEventListener('focus',()=>{if(!window.__panelFocused){window.__panelFocused=true;whenReady(focusStart);}});
  }

  // ---- Kortkommandon i appen (huvudfönstret och panelen) ----
  document.addEventListener('keydown',e=>{
    const ctrl=e.ctrlKey&&!e.altKey&&!e.metaKey,a=app();if(!a)return;
    if(ctrl&&!e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();a.closeSheet();const b=document.getElementById('in-law-search');if(b)b.click();return;}
    if(ctrl&&!e.shiftKey&&e.key.toLowerCase()==='f'){
      e.preventDefault();a.closeSheet();
      const find=document.getElementById('find-button'),open=document.getElementById('find-input');
      if(open){open.focus();open.select();}
      else if(find&&!find.hidden){find.click();setTimeout(()=>{const f=document.getElementById('find-input');if(f){f.focus();f.select();}},80);}
      else{const q=document.getElementById('query');if(q){q.focus();q.select();}else{const b=document.getElementById('in-law-search');if(b)b.click();}}
      return;
    }
    if(ctrl&&(e.key==='+'||e.key==='='||e.key==='-'||e.key==='0')){e.preventDefault();a.fontStep(e.key==='-'?-1:e.key==='0'?0:1);return;}
    if(ctrl&&(e.key==='PageDown'||e.key==='PageUp')){e.preventDefault();a.chapterStep(e.key==='PageDown'?1:-1);return;}
    if(e.altKey&&!e.ctrlKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!typing(e)){e.preventDefault();history[e.key==='ArrowLeft'?'back':'forward']();}
  });
  // Musens bakåt- och framåtknappar.
  window.addEventListener('mouseup',e=>{if(e.button===3||e.button===4){e.preventDefault();history[e.button===3?'back':'forward']();}});
  // Ctrl + hjulet ändrar textstorleken (i stället för att zooma hela fönstret).
  window.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();
    const now=Date.now();if(now-(window.__wheelAt||0)<120)return;window.__wheelAt=now;app()&&app().fontStep(e.deltaY<0?1:-1);},{passive:false});

  // ---- Högerklick på en paragraf: samma meny som ⋯ (kopiera, kopiera med hänvisning, spara, anteckna …) ----
  // Med text markerad visas Windows vanliga meny, så att man kan kopiera markeringen.
  document.addEventListener('contextmenu',e=>{
    const para=e.target.closest&&e.target.closest('article.paragraph[data-key]');if(!para)return;
    const sel=window.getSelection();if(sel&&!sel.isCollapsed&&para.contains(sel.anchorNode))return;
    if(e.target.closest('a,button,input,textarea'))return;
    const menu=para.querySelector('[data-action="para-menu"]');if(!menu)return;
    e.preventDefault();menu.click();
  });

  // ---- Kopiera lagtext med källa: markerad text får "(3 kap. 8 § brottsbalken)" efter sig ----
  document.addEventListener('copy',e=>{
    if(!local.copyCitation||!e.clipboardData||!app())return;
    const sel=window.getSelection();if(!sel||sel.isCollapsed)return;
    const node=sel.anchorNode&&(sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentElement);
    const para=node&&node.closest&&node.closest('article.paragraph[data-key]');
    if(!para||!para.contains(sel.focusNode))return;
    const text=sel.toString().trim();if(!text)return;
    e.clipboardData.setData('text/plain',text+' ('+app().citation(para.dataset.key)+')');
    e.preventDefault();
  });

  // ---- Förhandsvisning: håll musen över en hänvisning så visas paragrafens text ----
  let tip=null,tipTimer=null,tipFor=null;
  const hideTip=()=>{clearTimeout(tipTimer);tipTimer=null;tipFor=null;if(tip)tip.hidden=true;};
  function placeTip(link){
    const r=link.getBoundingClientRect(),w=Math.min(460,window.innerWidth-24);
    tip.style.width=w+'px';
    const left=Math.max(12,Math.min(r.left,window.innerWidth-w-12));
    tip.style.left=left+'px';
    const below=window.innerHeight-r.bottom>260||r.top<260;
    tip.style.top=below?(r.bottom+8)+'px':'';tip.style.bottom=below?'':(window.innerHeight-r.top+8)+'px';
    tip.style.maxHeight=Math.max(160,(below?window.innerHeight-r.bottom:r.top)-24)+'px';
  }
  document.addEventListener('mouseover',e=>{
    const link=e.target.closest&&e.target.closest('a.law-ref[data-ref-para]');
    if(!link){if(tip&&tip.contains(e.target)){clearTimeout(tipTimer);return;}if(tipFor&&!tipTimer)return;
      if(tipFor){clearTimeout(tipTimer);tipTimer=setTimeout(hideTip,250);}return;}
    if(link===tipFor){clearTimeout(tipTimer);tipTimer=null;return;}
    hideTip();tipFor=link;
    tipTimer=setTimeout(()=>{
      tipTimer=null;const d=link.dataset;
      app().paragraphPreview(d.refSfs,d.refChapter,d.refPara).then(markup=>{
        if(tipFor!==link||!markup)return;
        if(!tip){tip=document.createElement('div');tip.className='ref-preview';tip.setAttribute('role','tooltip');document.body.appendChild(tip);
          tip.addEventListener('mouseleave',()=>{tipTimer=setTimeout(hideTip,250);});}
        tip.innerHTML=markup+(d.refTo?'<p class="small muted">Visar första paragrafen i intervallet.</p>':'');
        tip.hidden=false;placeTip(link);
      }).catch(()=>{});
    },450);
  });
  ['scroll','keydown','mousedown'].forEach(t=>window.addEventListener(t,e=>{if(tip&&!tip.hidden&&!(t==='mousedown'&&tip.contains(e.target)))hideTip();},true));
  window.addEventListener('hashchange',hideTip);

  // ---- Fönstrets titel och hopplistan följer det man läser ----
  let lastTitle='',lastJump='',followTimer=null;
  function follow(){
    const a=app();if(panel||!a||!a.ready())return;
    const t=a.currentTitle(),title=t?t+' – Lagbok Desktop':'Lagbok Desktop';
    if(title!==lastTitle){lastTitle=title;document.title=title;invoke('set_title',{title}).catch(()=>{});}
    const pick=list=>list.slice(0,6).map(x=>({title:x.title,url:'lagbok://go/'+encodeURIComponent(x.hash)}));
    const items={favourites:pick(a.favourites()),recents:pick(a.recents())};
    const json=JSON.stringify(items);
    if(json!==lastJump){lastJump=json;invoke('set_jump_list',items).catch(()=>{});}
  }
  const scheduleFollow=()=>{clearTimeout(followTimer);followTimer=setTimeout(follow,400);};
  window.addEventListener('hashchange',scheduleFollow);
  document.addEventListener('click',scheduleFollow);
  whenReady(scheduleFollow);

  // ---- Uppdateringar ----
  function updateBanner(version){
    if(document.getElementById('update-banner'))return;
    const b=document.createElement('button');b.id='update-banner';b.type='button';b.className='update-banner';
    b.innerHTML='<strong>Lagbok Desktop '+esc(version)+' finns</strong><span>Tryck för att installera och starta om</span>';
    b.addEventListener('click',()=>{b.querySelector('span').textContent='Hämtar och installerar …';invoke('install_update').catch(()=>{b.querySelector('span').textContent='Uppdateringen misslyckades. Försök igen senare.';});});
    document.body.appendChild(b);
  }
  if(!panel)listen('update-available',e=>updateBanner(e.payload));

  // Efter en uppdatering: kort om vad som är nytt, en gång.
  const NEWS={'1.1':['Snabbpanelen är ett eget fönster som du kan flytta och ändra storlek på. Den minns var du lade den och öppnas där du var.',
    'Markera "BrB 3:8" eller "20 kap. 1 § brottsbalken" i Word, ett mejl eller en PDF och tryck kortkommandot, så öppnas lagrummet direkt.',
    'Bred layout i stora fönster: innehållet till vänster, lagtexten i mitten och kopplingarna till höger.',
    'Håll musen över en hänvisning för att läsa paragrafen. Högerklicka på en paragraf för menyn. Kopierad lagtext får källan efter sig.',
    'Ctrl + K: gå till eller sök · Ctrl + F: sök i lagen · Ctrl + hjulet: textstorlek · Alt + ← →: bakåt och framåt.',
    'Eget kortkommando, panelens läge och mer under Inställningar → Windows. Hopplistan i aktivitetsfältet fungerar nu.']};
  if(!panel)whenReady(()=>{
    const v=app().version,minor=v.split('.').slice(0,2).join('.'),seen=local.seenVersion;
    local.seenVersion=v;saveLocal();
    if(!seen||seen.split('.').slice(0,2).join('.')===minor||!NEWS[minor])return;
    setTimeout(()=>app().showSheet('<div class="sheet-title">Nytt i Lagbok Desktop '+esc(minor)+' <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<ul class="news-list">'+NEWS[minor].map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>',false),900);
  });

  // ---- Windows-inställningar ----
  let settings={autostart:false,closeToTray:true,shortcut:'ctrl+alt+l',shortcutLabel:'Ctrl + Alt + L',shortcutOk:true,panelMode:'float',lookupSelection:true};
  const loadSettings=()=>invoke('get_desktop_settings').then(s=>{settings=Object.assign(settings,s);}).catch(()=>{});
  loadSettings();
  const rerenderSettings=()=>{if(/^#\/settings/.test(location.hash))window.dispatchEvent(new HashChangeEvent('hashchange'));};
  document.addEventListener('change',e=>{
    const el=e.target.closest&&e.target.closest('[data-desktop-setting]');if(!el)return;
    const key=el.dataset.desktopSetting,on=el.type==='checkbox'?el.checked:el.value;
    if(key==='copyCitation'){local.copyCitation=on;saveLocal();app().toast(on?'På':'Av');return;}
    const call={autostart:['set_autostart',{on}],closeToTray:['set_close_to_tray',{on}],lookupSelection:['set_lookup_selection',{on}],panelMode:['set_panel_mode',{mode:on}]}[key];
    if(!call)return;
    invoke(call[0],call[1]).then(()=>{settings[key]=on;app().toast(key==='panelMode'?(on==='edge'?'Panelen ligger längs högerkanten':'Panelen är ett fritt fönster'):(on?'På':'Av'));})
      .catch(()=>{if(el.type==='checkbox')el.checked=!on;app().toast('Inställningen kunde inte ändras');});
  });
  // Nytt kortkommando: tryck "Ändra" och sedan den kombination du vill ha (minst en av Ctrl, Alt, Win).
  function accelerator(e){
    if(/^(?:Control|Alt|Shift|Meta|OS)$/.test(e.key))return null;
    const mods=[e.ctrlKey&&'ctrl',e.altKey&&'alt',e.shiftKey&&'shift',e.metaKey&&'super'].filter(Boolean);
    if(!e.ctrlKey&&!e.altKey&&!e.metaKey)return null;
    const code=e.code||'';let key=null;
    if(/^Key[A-Z]$/.test(code))key=code.slice(3).toLowerCase();
    else if(/^Digit\d$/.test(code))key=code.slice(5);
    else if(/^F\d{1,2}$/.test(code))key=code.toLowerCase();
    else key=({Space:'space',Period:'.',Comma:',',Minus:'-',Slash:'/',Backslash:'\\',Semicolon:';',Quote:"'",BracketLeft:'[',BracketRight:']',Backquote:'`'})[code]||null;
    return key?mods.concat(key).join('+'):null;
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest&&e.target.closest('[data-desktop-action="shortcut"]');if(!btn)return;
    btn.textContent='Tryck kombinationen …';btn.classList.add('recording');
    const stop=()=>{window.removeEventListener('keydown',onKey,true);btn.classList.remove('recording');btn.textContent='Ändra';};
    const onKey=ev=>{
      ev.preventDefault();ev.stopPropagation();
      if(ev.key==='Escape'){stop();return;}
      const acc=accelerator(ev);if(!acc)return;
      stop();
      invoke('set_shortcut',{shortcut:acc}).then(label=>{settings.shortcut=acc;settings.shortcutLabel=label;settings.shortcutOk=true;app().toast('Kortkommando: '+label);rerenderSettings();})
        .catch(()=>app().toast('Kombinationen används redan av ett annat program. Välj en annan.'));
    };
    window.addEventListener('keydown',onKey,true);
  });
  const check=(key,label,sub,on)=>'<label class="list-row desktop-setting"><div class="grow"><div class="row-title">'+label+'</div><div class="row-sub">'+sub+'</div></div>'+
    '<input type="checkbox" data-desktop-setting="'+key+'"'+(on?' checked':'')+'></label>';
  const KEYS=[['Ctrl + K','Gå till eller sök (t.ex. BrB 3:8)'],['Ctrl + F','Sök i lagen du läser'],['Esc','Stäng menyn, eller dölj snabbpanelen'],
    ['Alt + ← →, musens sidoknappar','Bakåt och framåt'],['Ctrl + Page Up/Down','Föregående och nästa kapitel'],['Ctrl + hjulet, Ctrl + plus/minus','Textstorlek (Ctrl + 0 återställer)'],
    ['Högerklick på en paragraf','Kopiera, spara, anteckna …']];

  window.LagbokDesktop={
    settingsHtml(){
      loadSettings();
      return '<div class="section-title">Windows</div><div class="card-list">'+
        '<div class="list-row desktop-setting"><div class="grow"><div class="row-title">Snabbpanel: '+esc(settings.shortcutLabel)+'</div>'+
        '<div class="row-sub">'+(settings.shortcutOk?'Fungerar var du än är i Windows. Esc eller samma kortkommando döljer panelen.':'Kombinationen används av ett annat program. Välj en annan.')+'</div></div>'+
        '<button type="button" class="button" data-desktop-action="shortcut">Ändra</button></div>'+
        '<label class="list-row desktop-setting"><div class="grow"><div class="row-title">Panelens läge</div><div class="row-sub">Ett fritt fönster som minns var du lade det, eller längs högerkanten.</div></div>'+
        '<select data-desktop-setting="panelMode"><option value="float"'+(settings.panelMode!=='edge'?' selected':'')+'>Fritt fönster</option><option value="edge"'+(settings.panelMode==='edge'?' selected':'')+'>Högerkanten</option></select></label>'+
        check('lookupSelection','Slå upp markerad text','Markerar du "BrB 3:8" i ett annat program och trycker kortkommandot öppnas lagrummet direkt. Görs inte i terminaler.',settings.lookupSelection)+
        check('copyCitation','Kopiera lagtext med källa','Markerad lagtext får källan efter sig när du kopierar, t.ex. "(3 kap. 8 § brottsbalken)".',local.copyCitation)+
        check('closeToTray','Krysset gömmer appen vid klockan','Appen fortsätter att gå i bakgrunden så att kortkommandot alltid fungerar. Avsluta via ikonen vid klockan.',settings.closeToTray)+
        check('autostart','Starta med Windows','Startar dold vid inloggning, redo för kortkommandot.',settings.autostart)+
        '</div><div class="section-title">Kortkommandon i appen</div><div class="card-list key-list">'+
        KEYS.map(([k,d])=>'<div class="list-row"><kbd>'+esc(k)+'</kbd><div class="grow row-sub">'+esc(d)+'</div></div>').join('')+'</div>';
    },
    checkUpdate(){
      app().toast('Letar efter ny version …');
      invoke('check_update').then(v=>{if(v)updateBanner(v);else app().toast('Du har den senaste versionen');})
        .catch(()=>app().toast('Kunde inte nå uppdateringsservern'));
    }
  };
})();
