/* Lagbok Desktop 1.0 (från Lagboken 1.4) – introduktion vid första starten. Visas en gång; kan visas igen från Inställningar. */
(function(root){
  'use strict';
  const SLIDES=[
    {art:'<div class="tut-mark">§</div>',title:'Välkommen till Lagbok Desktop',
     text:'Här finns i stort sett all svensk lag samlad, med texten från riksdagen.se och uppdaterad varje månad. Det tar en minut att gå igenom det viktigaste.'},
    {art:'<div class="tut-search">⌨ <span>Ctrl + Alt + L</span></div>',title:'Alltid ett kortkommando bort',
     text:'Tryck <b>Ctrl + Alt + L</b> var du än är i Windows, så glider Lagbok fram i högerkanten med sökfältet redo. Skriv till exempel <b>BrB 3:8</b> och tryck Enter. <b>Esc</b> eller samma kortkommando döljer den igen. Krysset i fönstret gömmer appen vid klockan, så att kortkommandot alltid fungerar.'},
    {art:'<div class="tut-search">⌕ <span>BrB 24:1</span></div><div class="tut-chips"><span>husrannsakan</span><span>RB 23</span><span>PL 10</span></div>',title:'Sök',
     text:'Skriv det du letar efter, till exempel <i>husrannsakan</i>. Vet du var det står kan du skriva <b>BrB 24:1</b> och hamna direkt i paragrafen, eller bara <b>PL</b> för att öppna polislagen. Konventioner fungerar likadant: <b>EKMR 8</b>. Inne i en lag söker förstoringsglaset uppe till höger i just den lagen. Orden markeras i texten och pilarna tar dig till nästa träff. Vill du leta i hela lagboken trycker du på <b>I hela lagboken</b>.'},
    {art:'<div class="tut-tree"><b>Rättegångsbalken</b><span>├ Förundersökningskungörelsen</span><span>├ Lagen om offentligt biträde</span><span>└ …</span></div>',title:'Hitta rätt lag',
     text:'Lagarna ligger ordnade som i en tryckt lagbok: grundlagarna först, sedan balkarna med lagarna som hör till dem, och därefter ett område i taget. Letar du efter ett namn finns registret A–Ö.'},
    {art:'<div class="tut-para"><b>24 kap. 1 §</b><span>… enligt <u>23 kap. 3 §</u> …</span><em>§ Kompletteras av FuK 1 §</em></div>',title:'Hoppa mellan paragrafer',
     text:'Står det ”enligt 23 kap. 3 §” räcker det att trycka, så kommer du dit och kan gå tillbaka lika lätt. Under paragrafen ser du om en förordning fyller ut den, och vad som hänvisar hit.'},
    {art:'<div class="tut-pen"><mark>stryk under</mark> ✎ anteckning</div>',title:'Stryk under och skriv anteckningar',
     text:'Tryck på <b>Penna</b> och dra fingret över texten, precis som med en överstrykningspenna. Bakom de tre prickarna vid varje paragraf kan du skriva en anteckning, kopiera eller dela. Allt sparat hittar du under <b>Sparat</b>.'},
    {art:'<div class="tut-chips fav"><span>BrB</span><span>RB 24 kap.</span><span>PL</span></div>',title:'Spara det du använder ofta',
     text:'Tryck på stjärnan vid en lag eller ett kapitel. Då ligger den överst när du öppnar appen, ett tryck bort.'},
    {art:'<div class="tut-date">◷ Visar lydelsen 1 juni 2027</div>',title:'Gamla och kommande lydelser',
     text:'Vill du se hur en paragraf löd ett visst datum, till exempel när något hände, väljer du det i menyn vid paragrafen. Ändringar som är på väg syns redan nu, med datum. Under <b>Nytt i lagen</b> ser du vad som ändrats sedan sist.'},
    {art:'<div class="tut-mark small">⇣</div>',title:'Utan täckning',
     text:'Det du har läst finns kvar i telefonen. Ska du vara någonstans utan nät kan du ladda ner lagboken i förväg under <b>Inställningar</b>, en del i taget eller allt på en gång (ungefär 120 MB).'},
    {art:'<div class="tut-mark small">🔒</div>',title:'Det du sparar är ditt',
     text:'Favoriter, understrykningar och anteckningar finns bara i din telefon. Det finns inga konton och ingenting skickas någonstans. Vill du flytta dem till en annan telefon gör du en säkerhetskopia under Inställningar.'},
    {art:'<div class="tut-mark">§</div>',title:'Viktigt att veta',final:true,
     text:'Jag har byggt Lagboken på egen hand. Den har ingen koppling till riksdagen.se, Regeringskansliet eller någon myndighet. Texten hämtas från riksdagen.se och kan ibland ligga efter eller innehålla fel, så kolla mot <b>Svensk författningssamling</b> innan du använder den på riktigt. Hittar du något som inte stämmer får du gärna höra av dig via <b>Rapportera fel</b> i menyn vid paragrafen.'}
  ];
  function show(onDone){
    if(document.getElementById('tutorial'))return;
    let at=0;const box=document.createElement('div');
    box.id='tutorial';box.className='tutorial';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Introduktion till Lagboken');
    const draw=dir=>{
      const s=SLIDES[at],last=at===SLIDES.length-1;
      box.innerHTML='<div class="tut-card'+(dir?' tut-'+dir:'')+'">'+
        (last?'':'<button type="button" class="tut-skip" data-tut="skip">Hoppa över</button>')+
        '<div class="tut-art" aria-hidden="true">'+s.art+'</div><h2>'+s.title+'</h2><p>'+s.text+'</p>'+
        (s.final?'<p class="tut-sign">Hoppas den kommer till nytta!<br><span>Jonathan</span></p>':'')+
        '<div class="tut-dots" aria-hidden="true">'+SLIDES.map((_,i)=>'<i'+(i===at?' class="on"':'')+'></i>').join('')+'</div>'+
        '<div class="tut-actions">'+(at?'<button type="button" class="button" data-tut="back">Tillbaka</button>':'<span></span>')+
        '<button type="button" class="button primary" data-tut="'+(last?'done':'next')+'">'+(last?'Jag förstår':'Nästa')+'</button></div></div>';
      const b=box.querySelector('.button.primary');if(b)b.focus();
    };
    const go=(n,dir)=>{at=Math.max(0,Math.min(SLIDES.length-1,n));draw(dir);};
    box.addEventListener('click',e=>{
      const t=e.target.closest('[data-tut]');if(!t)return;
      const a=t.dataset.tut;
      if(a==='next')go(at+1,'next');else if(a==='back')go(at-1,'back');else if(a==='skip')go(SLIDES.length-1,'next');
      else if(a==='done'){box.classList.add('tut-out');setTimeout(()=>box.remove(),220);if(onDone)onDone();}
    });
    // Svep åt sidorna för att bläddra.
    let x0=null;
    box.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
    box.addEventListener('touchend',e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;
      if(dx<-50&&at<SLIDES.length-1)go(at+1,'next');else if(dx>50&&at>0)go(at-1,'back');},{passive:true});
    document.addEventListener('keydown',function key(e){
      if(!document.body.contains(box)){document.removeEventListener('keydown',key);return;}
      if(e.key==='ArrowRight'&&at<SLIDES.length-1)go(at+1,'next');if(e.key==='ArrowLeft'&&at>0)go(at-1,'back');
    });
    document.body.appendChild(box);draw('');
  }
  root.LagbokTutorial={show,slides:SLIDES.length};
})(typeof window!=='undefined'?window:globalThis);
