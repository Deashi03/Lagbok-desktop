/* Lagbok Desktop 1.0 – Windows-delen av webbappen. Pratar med skalet i src-tauri:
   snabbpanelen (Ctrl + Alt + L), Lagbok-länkar (lagbok://), hopplistan i aktivitetsfältet, externa länkar,
   uppdateringar och Windows-inställningarna under Inställningar. Gör ingenting i en vanlig webbläsare. */
(function(){
  'use strict';
  if(!window.LAGBOK_DESKTOP||!window.__TAURI__)return;
  const {invoke}=window.__TAURI__.core,{listen}=window.__TAURI__.event;
  const app=()=>window.LagbokApp;
  const panel=document.documentElement.dataset.panel==='true';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const whenReady=fn=>{const tick=()=>app()&&app().ready()?fn():setTimeout(tick,50);tick();};

  // Länkar till webbsidor och e-post öppnas i Windows standardprogram, inte inne i appen.
  document.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
    const href=a.getAttribute('href');
    if(/^(?:https?:|mailto:)/i.test(href)){e.preventDefault();e.stopPropagation();invoke('open_external',{url:a.href}).catch(()=>{});}
  },true);

  // Lagbok-länkar: lagbok://go/<adress i appen> (hopplistan) eller lagbok://BrB/3/8 och lagbok://BrB 3:8 (snabbkod).
  function openLink(url){
    const rest=decodeURIComponent(String(url).replace(/^lagbok:\/*/i,'')).replace(/\/+$/,'');
    if(/^go\//i.test(rest)){location.hash=rest.slice(3);return;}
    const q=rest.replace(/^open\//i,'').replace(/\//g,' ').trim();
    if(q)whenReady(()=>app().goQuick(q).then(ok=>{if(!ok)app().toast('Hittade inte '+q);}));
  }
  // Skalet sparar länken tills den hämtas, så att en länk som startade appen inte går förlorad.
  const takeLink=()=>invoke('take_pending_link').then(url=>{if(url)openLink(url);}).catch(()=>{});
  if(!panel){listen('deep-link',takeLink);takeLink();}
  if(!panel)listen('open-hash',e=>{location.hash=e.payload;});

  // ---- Snabbpanelen ----
  if(panel){
    // Esc döljer panelen när ingen meny är öppen; menyer stängs först som vanligt.
    document.addEventListener('keydown',e=>{
      if(e.key!=='Escape')return;
      const sheet=document.getElementById('sheet');
      if(sheet&&!sheet.hidden)return;
      invoke('hide_panel').catch(()=>{});
    });
    // Två knappar i rubrikraden: öppna det som visas i huvudfönstret, och dölj panelen.
    const actions=document.querySelector('.top-actions');
    if(actions){
      const open=document.createElement('button');open.type='button';open.className='icon-button';open.id='panel-open-main';
      open.setAttribute('aria-label','Öppna i Lagbok Desktop');open.title='Öppna i huvudfönstret';open.textContent='⤢';
      open.addEventListener('click',()=>invoke('open_in_main',{hash:location.hash||'#/catalog'}).catch(()=>{}));
      const close=document.createElement('button');close.type='button';close.className='icon-button';close.id='panel-close';
      close.setAttribute('aria-label','Dölj snabbpanelen (Esc)');close.title='Dölj (Esc)';close.textContent='×';
      close.addEventListener('click',()=>invoke('hide_panel').catch(()=>{}));
      actions.append(open,close);
    }
    // När panelen visas: sökfältet är redo att skriva i.
    const focusSearch=()=>{
      const q=document.getElementById('query');
      if(q){q.focus();q.select();return;}
      const jump=document.getElementById('in-law-search');if(jump)jump.click();
      setTimeout(()=>{const j=document.getElementById('jump-query');if(j)j.focus();},60);
    };
    // Fönstret får fokus en stund efter att det visats; därför flera försök tills sökfältet har markören.
    const focusSoon=()=>{let n=0;const tryFocus=()=>{const q=document.getElementById('query');
      if(q&&document.activeElement===q&&document.hasFocus())return;
      if(n++===0||q)focusSearch();if(n<8)setTimeout(tryFocus,80);};tryFocus();};
    // Signalen från skalet, och som reserv: när fönstret blir synligt eller laddas medan det syns.
    listen('panel-shown',()=>whenReady(focusSoon));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')whenReady(focusSoon);});
    whenReady(()=>{if(document.visibilityState==='visible'&&document.hasFocus())focusSoon();});
  }

  // ---- Hopplistan: favoriter och senast lästa när man högerklickar på ikonen i aktivitetsfältet ----
  let lastJump='';
  function updateJumpList(){
    if(panel||!app()||!app().ready())return;
    const pick=list=>list.slice(0,6).map(x=>({title:x.title,url:'lagbok://go/'+encodeURIComponent(x.hash)}));
    const items={favourites:pick(app().favourites()),recents:pick(app().recents())};
    const json=JSON.stringify(items);if(json===lastJump)return;lastJump=json;
    invoke('set_jump_list',items).catch(()=>{});
  }
  let jumpTimer=null;
  const scheduleJump=()=>{clearTimeout(jumpTimer);jumpTimer=setTimeout(updateJumpList,1500);};
  window.addEventListener('hashchange',scheduleJump);
  document.addEventListener('click',scheduleJump);
  whenReady(scheduleJump);

  // ---- Uppdateringar ----
  function updateBanner(version){
    if(document.getElementById('update-banner'))return;
    const b=document.createElement('button');b.id='update-banner';b.type='button';b.className='update-banner';
    b.innerHTML='<strong>Lagbok Desktop '+esc(version)+' finns</strong><span>Tryck för att installera och starta om</span>';
    b.addEventListener('click',()=>{b.querySelector('span').textContent='Hämtar och installerar …';invoke('install_update').catch(()=>{b.querySelector('span').textContent='Uppdateringen misslyckades. Försök igen senare.';});});
    document.body.appendChild(b);
  }
  if(!panel)listen('update-available',e=>updateBanner(e.payload));

  // ---- Windows-inställningar ----
  let settings={autostart:false,closeToTray:true,shortcut:'Ctrl+Alt+L'};
  invoke('get_desktop_settings').then(s=>{settings=Object.assign(settings,s);}).catch(()=>{});
  document.addEventListener('change',e=>{
    const box=e.target.closest&&e.target.closest('[data-desktop-setting]');if(!box)return;
    const key=box.dataset.desktopSetting,on=box.checked;
    invoke(key==='autostart'?'set_autostart':'set_close_to_tray',{on}).then(()=>{settings[key]=on;app().toast(on?'På':'Av');})
      .catch(()=>{box.checked=!on;app().toast('Inställningen kunde inte ändras');});
  });
  const check=(key,label,sub)=>'<label class="list-row desktop-setting"><div class="grow"><div class="row-title">'+label+'</div><div class="row-sub">'+sub+'</div></div>'+
    '<input type="checkbox" data-desktop-setting="'+key+'"'+(settings[key]?' checked':'')+'></label>';

  window.LagbokDesktop={
    settingsHtml(){
      return '<div class="section-title">Windows</div><div class="card-list">'+
        '<div class="list-row"><div class="grow"><div class="row-title">Snabbpanel: '+esc(settings.shortcut.replace(/\+/g,' + '))+'</div>'+
        '<div class="row-sub">Fäller fram Lagbok i högerkanten var du än är i Windows. Esc eller samma kortkommando döljer den.</div></div></div>'+
        check('closeToTray','Krysset gömmer appen vid klockan','Appen fortsätter att gå i bakgrunden så att kortkommandot alltid fungerar. Avsluta via ikonen vid klockan.')+
        check('autostart','Starta med Windows','Startar dold vid inloggning, redo för kortkommandot.')+
        '</div>';
    },
    checkUpdate(){
      app().toast('Letar efter ny version …');
      invoke('check_update').then(v=>{if(v)updateBanner(v);else app().toast('Du har den senaste versionen');})
        .catch(()=>app().toast('Kunde inte nå uppdateringsservern'));
    }
  };
})();
