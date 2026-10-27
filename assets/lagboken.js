/* Genereras av scripts/bundle.js från assets/search-core.js, legal-links.js, editorial.js, law-model.js, search-index.js, highlights.js, toc-model.js, tutorial.js, app.js, desktop.js. Ändra i källfilerna, inte här. */
// ---- search-core.js ----
/* Lagboken 0.2 – ren, testbar tolkning av snabbkoder. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokSearch=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const norm=v=>String(v||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s.-]+/g,' ').trim();
  const paraKey=v=>String(v||'').toLocaleLowerCase('sv').replace(/\s+/g,'');
  function parseQuick(input,laws,faps){
    const q=String(input||'').trim();
    if(!q)return null;
    const fap=/^fap\s*(\d{2,4})\s*[-–]?\s*(\d{1,2})$/i.exec(q);
    if(fap){
      const id='FAP '+fap[1]+'-'+fap[2].padStart(2,'0');
      const doc=(faps||[]).find(f=>f.id===id);
      return doc?{type:'fap',fap:doc}:null;
    }
    // Bara förkortningen, lagens namn eller SFS-numret ("PL", "brottsbalken", "1984:387") öppnar författningens början.
    const whole=norm(q),abbr=a=>/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö]{0,7}$/.test(a)&&/[A-ZÅÄÖ].*[A-ZÅÄÖa-zåäö]|^[A-ZÅÄÖ]{2,}$/.test(a);
    // Konventioner i en lag nås också med sitt vedertagna namn ("Barnkonventionen", "Europakonventionen").
    const exact=(laws||[]).filter(l=>norm(l.name)===whole||l.sfs===q||(l.aliases||[]).some(a=>(abbr(a)||l.articleChapter)&&norm(a)===whole));
    if(exact.length){
      exact.sort((a,b)=>Number(norm(b.name)===whole)-Number(norm(a.name)===whole)||Number(b.type==='lag')-Number(a.type==='lag'));
      return {type:'law',meta:exact[0],chapter:null,para:null};
    }
    const candidates=[];
    (laws||[]).forEach(l=>{
      [l.name,l.sfs,...(l.aliases||[])].forEach(alias=>{
        const prefix=String(alias||'').trim();
        if(!prefix||norm(prefix).length<2)return;
        if(q.toLocaleLowerCase('sv').startsWith(prefix.toLocaleLowerCase('sv'))){
          // "EKMR art. 8" och "EKMR artikel 8" fungerar som "EKMR 8".
          const rest=q.slice(prefix.length).trim().replace(/^art(?:ikel|\.)?\s*(?=\d)/i,'');
          if(rest&&/^\d/.test(rest)) candidates.push({meta:l,rest,length:prefix.length});
        }
      });
    });
    candidates.sort((a,b)=>b.length-a.length);
    for(const item of candidates){
      const chapPara=/^(\d{1,3})(?:\s*(?::|\.|\s+kap(?:itel)?\.?\s*)\s*|\s+)(\d+\s*[a-z]?)\s*§?$/i.exec(item.rest);
      if(chapPara&&item.meta.chaptered){
        return {type:'law',meta:item.meta,chapter:chapPara[1],para:paraKey(chapPara[2])};
      }
      const one=/^(\d+\s*[a-z]?)\s*(?:§|kap\.?)?$/i.exec(item.rest);
      // "EKMR 8": lagen har konventionen som kapitel ("K"); ett ensamt nummer avser artikeln.
      if(one&&item.meta.articleChapter&&!/(?:§|kap)/i.test(item.rest))return {type:'law',meta:item.meta,chapter:item.meta.articleChapter,para:paraKey(one[1])};
      if(one){
        if(item.meta.chaptered){
          if(/[a-z]/i.test(one[1]))return null;
          return {type:'law',meta:item.meta,chapter:one[1].trim(),para:null};
        }
        return {type:'law',meta:item.meta,chapter:'0',para:paraKey(one[1])};
      }
    }
    return null;
  }
  function resolvedQuick(direct,doc){
    if(!direct)return null;
    if(direct.type==='fap')return direct;
    if(!doc||!Array.isArray(doc.chapters))return null;
    if(direct.chapter==null)return direct;
    const ch=doc.chapters.find(c=>String(c.number)===String(direct.chapter));
    if(!ch)return null;
    if(!direct.para)return direct;
    const para=(ch.items||[]).find(p=>p.type==='para'&&paraKey(p.number)===paraKey(direct.para));
    return para?{...direct,para:paraKey(para.number)}:null;
  }
  // Exakta namn och inledningar rankas högre än substring och ämnesord.
  function rankSuggestions(input,laws,faps,topics,recents){
    const q=norm(input);if(!q)return [];
    const out=[],seen=new Set();
    const add=(score,type,key,title,subtitle,extra)=>{
      if(seen.has(key))return;
      seen.add(key);out.push({score,order:out.length,type,key,title,subtitle,...(extra||{})});
    };
    const quick=parseQuick(input,laws,faps);
    if(quick)add(1000,quick.type==='fap'?'fap':'quick','quick',quick.type==='fap'?quick.fap.name:quick.meta.name,
      'Direkt till '+input.trim(),{quick});
    for(const l of laws||[]){
      const name=norm(l.name), aliases=(l.aliases||[]).map(norm);
      let score=0;
      if(name===q||aliases.includes(q))score=950;
      else if(name.startsWith(q))score=810;
      else if(aliases.some(a=>a.length<=5&&a.startsWith(q)))score=760;
      else if(q.length>=2&&name.split(/\s+/).some(w=>w.startsWith(q)))score=500;
      else if(q.length>=3&&name.includes(q))score=250;
      else if(q.length>=3&&aliases.some(a=>a.startsWith(q)))score=430;
      else if(q.length>=3&&aliases.some(a=>a.includes(q)))score=200;
      // Vid ofullständig träff hamnar förordningar och kungörelser efter lagarna.
      if(score&&score<950&&l.type&&l.type!=='lag')score-=60;
      if(score)add(score,'law','law:'+l.sfs,l.name,(l.aliases||[])[0]+' · SFS '+l.sfs,{law:l});
    }
    if(q.length>=2){
      for(const f of faps||[]){
        const terms=[f.id,f.name,f.code,...(f.tags||[])].map(norm);
        let score=terms[0]===q?930:terms.some(t=>t.startsWith(q))?530:q.length>=3&&terms.some(t=>t.includes(q))?180:0;
        if(score)add(score,'fap','fap:'+f.id,f.name,f.id+' · '+f.code,{fap:f});
      }
    }
    // Juridiska ämnesord aktiveras efter minst tre tecken för att undvika R -> husrannsakan.
    if(q.length>=3){
      for(const t of topics||[]){
        const name=norm(t.term);
        const score=name===q?710:name.startsWith(q)?610:name.includes(q)?110:0;
        if(score)add(score,'topic','topic:'+t.code,t.term,t.code,{code:t.code});
      }
    }
    if(q.length>=2){
      for(const t of recents||[]){
        if(norm(t.title).startsWith(q))add(140,'recent','recent:'+t.url,t.title,'Senast öppnad',{url:t.url});
      }
    }
    out.sort((a,b)=>b.score-a.score||a.order-b.order);
    return out.slice(0,7);
  }
  return {norm,paraKey,parseQuick,resolvedQuick,rankSuggestions};
});
;
// ---- legal-links.js ----
/* Lagboken 0.6: juridiska hänvisningar, bevarad lagtext.
   Känner igen t.ex. "24 kap. 1 §", "3 a eller 3 b §", "1, 2, 5 eller 6 §§", "1–4 §§",
   "6 kap. brottsbalken", "10 § polislagen (1984:387)" och "8 § första stycket 2".
   Varje paragrafnummer länkas för sig; nummer som saknas i lagtexten lämnas olänkade.
   Intervall ("7–9 §§", "24–28 kap.") länkas som en helhet med from/to, och alla paragrafer
   eller kapitel däremellan räknas som hänvisade (context.members/context.chapters ger dem). */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokReferences=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=n=>String(n).toLowerCase().replace(/\s+/g,'');
  // Grundlista; utökas med katalogens namn via configure().
  let titles=[
    ['rättegångsbalken','1942:740'],['brottsbalken','1962:700'],
    ['polislagen','1984:387'],['förundersökningskungörelsen','1947:948'],
    ['trafikförordningen','1998:1276'],['ordningslagen','1993:1617'],
    ['regeringsformen','1974:152'],['offentlighets- och sekretesslagen','2009:400'],
    ['förvaltningslagen','2017:900'],['vapenlagen','1996:67'],
    ['narkotikastrafflagen','1968:64'],['trafikbrottslagen','1951:649'],
    ['lagen om straff för vissa trafikbrott','1951:649'],
    ['lagen med särskilda bestämmelser om unga lagöverträdare','1964:167'],
    ['lagen om omhändertagande av berusade personer','1976:511']
  ];
  let known=new Set();
  // Konventioner som gäller som svensk lag: [namn, id]; artiklar länkas ("artikel 8 i Europakonventionen").
  let treaties=[];
  function sortTitles(){titles.sort((a,b)=>b[0].length-a[0].length);known=new Set(titles.map(t=>t[1]));}
  sortTitles();
  // Lägger till namn från katalogen: [{sfs,name,refNames}]
  function configure(laws){
    treaties=[];
    for(const law of laws||[])if(law.articleChapter)for(const name of (law.aliases||[])){
      const n=String(name||'').toLowerCase().trim();if(n.length>3)treaties.push([n,law.sfs,law.articleChapter]);
    }
    treaties.sort((a,b)=>b[0].length-a[0].length);
    laws=(laws||[]).filter(l=>l.type!=='konvention');
    const seen=new Set(titles.map(t=>t[0]+'|'+t[1]));
    for(const law of laws||[]){
      for(const name of [law.name,...(law.refNames||[])]){
        const n=String(name||'').toLowerCase().trim();
        if(n.length>3&&!seen.has(n+'|'+law.sfs)){titles.push([n,law.sfs]);seen.add(n+'|'+law.sfs);}
      }
      known.add(law.sfs);
    }
    // Namn som pekar på författningar som inte längre finns i katalogen (t.ex. upphävda) tas bort.
    const inCatalog=new Set((laws||[]).map(l=>l.sfs));
    if(inCatalog.size)titles=titles.filter(([,sfs])=>inCatalog.has(sfs));
    sortTitles();known=new Set(titles.map(t=>t[1]));for(const law of laws||[])known.add(law.sfs);
  }
  const NUM='\\d+(?:\\s?[a-z](?![\\p{L}]))?';
  const SEP='\\s*(?:,|och|eller|samt|respektive|-{1,2}|–)\\s*';
  // "18 a-c §§": bokstavsintervall inom samma paragrafnummer.
  const LETTERS='(?:\\s*(?:-{1,2}|–)\\s*[a-z](?![\\p{L}]))?';
  const pattern=new RegExp('(?<![\\p{L}\\p{N}\\-–:])(?:(\\d{1,3}(?:\\s?[a-z](?=\\s*kap))?)\\s*kap(?:itel)?\\.?\\s*)?('+NUM+LETTERS+'(?:'+SEP+NUM+LETTERS+')*)\\s*(§{1,2})(?![\\p{N}]|[\\p{L}]\\s*§)','giu');
  // Kapitel skrivs som i lagtexten: "3 a", inte "3a".
  const chap=c=>String(c).replace(/\s*([a-z])$/i,' $1').toLowerCase();
  const NOTPARA='(?!\\s*'+NUM+'(?:'+SEP+NUM+')*\\s*§)';
  const chapterOnly=new RegExp('(?<![\\p{L}\\p{N}\\-–:§])(\\d{1,3}(?:\\s?[a-z])?)\\s*kap\\.'+NOTPARA,'giu');
  // Kapitel i uppräkning eller intervall: "24–28 kap.", "1, 2 och 5 kap.", "3 och 4 kap. brottsbalken".
  const CSEP='\\s*(?:,|och|eller|samt|respektive|-{1,2}|–)\\s*';
  const CNUM='\\d{1,3}(?:\\s?[a-z](?![\\p{L}]))?';
  const chapterList=new RegExp('(?<![\\p{L}\\p{N}\\-–:§])('+CNUM+'(?:'+CSEP+CNUM+')+)\\s*kap\\.'+NOTPARA,'giu');
  const DASH=/^\s*(?:-{1,2}|–)\s*$/;
  const numberIn=new RegExp(NUM,'giu');
  // Stycke, punkt och mening efter paragrafen påverkar inte vilken paragraf som avses.
  const ORD='(?:första|andra|tredje|fjärde|femte|sjätte|sjunde|åttonde|nionde|tionde|sista)';
  const PUNKT='(?:\\d+|[a-z]\\)?)(?![\\p{L}\\p{N}]|\\s*[a-z]?\\s*§)';
  const qualifier=new RegExp('^\\s*(?:'+ORD+'(?:\\s*(?:,|och)\\s*'+ORD+')*\\s+(?:stycket|styckena|meningen|meningarna|punkten|punkterna)(?:\\s+'+PUNKT+'(?:\\s*(?:,|och|eller)\\s*'+PUNKT+')*)?(?:\\s*,?\\s*'+ORD+'\\s+meningen)?\\s*)*','iu');
  // Följande hänvisningar i samma uppräkning, t.ex. "2 kap. 4 § eller 6 kap. 2 § kustbevakningslagen".
  const chained=new RegExp('^(?:'+SEP.replace('|respektive','')+'(?:(?:\\d{1,3}(?:\\s?[a-z])?\\s*kap\\.?\\s*)?'+NUM+'(?:'+SEP+NUM+')*\\s*§{1,2}'+qualifier.source.slice(1)+'|\\d{1,3}(?:\\s?[a-z])?(?:'+SEP+'\\d{1,3}(?:\\s?[a-z])?)*\\s*kap\\.))*','iu');
  const bySfs=/^\s*(?:i\s+|av\s+|enligt\s+)?[\p{L}-]*(?:lagen|förordningen|kungörelsen|balken|ordningen|grundlagen)\s*\((\d{4}:\d+)\)/iu;
  // Returnerar {id,explicit} eller null när hänvisningen avser en författning som inte finns i appen.
  function targetLaw(after,context,last){
    let rest=after.replace(qualifier,'');
    rest=rest.replace(chained,'');
    const numbered=bySfs.exec(rest);
    if(numbered)return known.has(numbered[1])?{id:numbered[1],explicit:true}:null;
    // Avstavning över radbrytning i källan: "regerings- formen".
    let lower=rest.replace(/^\s*(?:i\s+|av\s+|enligt\s+)?/iu,'').toLowerCase().replace(/^([\p{L}]+)-\s+(?!och\b|eller\b|samt\b)([\p{L}]+)/u,'$1$2');
    if(/^(?:denna\s+(?:lag|balk|förordning|kungörelse)|detta\s+kapitel)/.test(lower))return {id:context.sfs,explicit:true};
    // "samma balk", "den lagen": senast namngivna författning i samma text.
    if(/^(?:samma|den|nämnda|sagda|angivna)\s+(?:lag|balk|förordning|kungörelse)(?:en)?\b/.test(lower))return last?{id:last,explicit:true}:null;
    // "balken", "nya balken" i en lag som ansluter till en balk (t.ex. promulgationslagen) avser den balken.
    if(/^(?:nya\s+)?balken\b/.test(lower))return context.anchor?{id:context.anchor,explicit:true}:null;
    lower=lower.replace(/^nya\s+(?=[\p{L}]*(?:balken|lagen))/u,'');
    const found=titles.find(([name])=>lower.startsWith(name)&&!/[\p{L}]/u.test(lower.charAt(name.length)));
    if(found){
      // "lagen (2025:1062) om …" med okänt nummer ska inte länkas via ett kortare namn.
      if(/^\s*\(\d{4}:\d+\)/.test(lower.slice(found[0].length))){
        const sfs=/^\s*\((\d{4}:\d+)\)/.exec(lower.slice(found[0].length))[1];
        if(sfs!==found[1])return known.has(sfs)?{id:sfs,explicit:true}:null;
      }
      return {id:found[1],explicit:true};
    }
    if(/^(?:lagen|förordningen|kungörelsen)\b/.test(lower))return null; // okänd annan författning
    if(/^[\p{L}-]+(?:lagen|balken|förordningen|kungörelsen|ordningen|grundlagen)\b/u.test(lower))return null;
    return {id:context.sfs,explicit:false};
  }
  function exists(context,id,chapter,para){
    return typeof context.exists!=='function'||context.exists(id,chapter,para);
  }
  // Kapitlet där paragrafen finns i den aktuella lagen, om lagen numrerar paragraferna löpande.
  function locate(context,para){
    return typeof context.locate==='function'?context.locate(context.sfs,para):null;
  }
  // Bygger en locate-funktion: docFor(sfs) ger lagens dokument. Bara lagar där inget paragrafnummer
  // förekommer i mer än ett kapitel räknas som löpande numrerade.
  function locator(docFor){
    const cache=new Map();
    return (sfs,para)=>{
      if(!cache.has(sfs)){
        const doc=docFor(sfs);let map=null;
        if(doc&&doc.chapters&&doc.chapters.filter(c=>c.number!=='0'&&!c.unit).length>1){
          map=new Map();
          for(const ch of doc.chapters){if(ch.unit)continue;for(const i of ch.items||[]){if(i.type!=='para')continue;const k=key(i.number);
            if(map.has(k)){map=null;break;}map.set(k,String(ch.number));}if(!map)break;}
        }
        if(!doc)return null;
        cache.set(sfs,map);
      }
      const map=cache.get(sfs);return map&&map.get(key(para))||null;
    };
  }
  function parseRefs(text,context){
    const s=String(text||''),refs=[];
    let last=null,prev=null;
    // Senast namngivna andra författning före en position ("25–28 kap. samma balk").
    const lastBefore=pos=>{let id=null;for(const r of refs)if(r.end<=pos&&r.explicit&&r.id!==context.sfs)id=r.id;
      if(!id){const before=s.slice(Math.max(0,pos-400),pos).toLowerCase();let best=-1;
        for(const [name,sfs] of titles){const i=before.lastIndexOf(name);if(i>best&&sfs!==context.sfs){best=i;id=sfs;}}}
      return id;};
    // "Följande bestämmelser i myndighetsförordningen (2007:515) ska inte tillämpas: 2 § …, 9–18 §§ …":
    // en lista efter kolon avser den författning som namnges före kolonet i samma mening.
    const colonLaw=pos=>{
      const before=s.slice(Math.max(0,pos-600),pos);let cut=-1;for(const b of before.matchAll(/[.;]\s+(?=[A-ZÅÄÖ])/g))cut=b.index;
      const sentence=before.slice(cut+1),colon=sentence.lastIndexOf(':');if(colon<0)return null;
      // Bara listor som uttryckligen räknar upp "bestämmelser/paragrafer i X", inte bemyndiganden ("i fråga om", "med stöd av").
      if(/(?:i fråga om|med stöd av|denna|detta|dessa)\s*$/i.test(s.slice(Math.max(0,pos-24),pos)))return null;
      if(/[.;]\s/.test(sentence.slice(colon)))return null;
      const head=sentence.slice(0,colon).toLowerCase();let best=-1,id=null;
      for(const [name,sfs] of titles){const i=head.lastIndexOf(name);if(i>best){best=i;id=sfs;}}
      const num=/lagen\s*\((\d{4}:\d+)\)[^()]*$/.exec(head);if(num&&known.has(num[1])&&(best<0||num.index>best)){best=num.index;id=num[1];}
      if(best<0||!/(?:bestämmelse\w*|paragraf\w*)\s+i\s+$/.test(head.slice(Math.max(0,best-40),best)))return null;
      return id&&id!==context.sfs?id:null;};
    // "Bestämmelserna i 1 kap. om 1. ekonomisk reglering i 6–10 §§, …" och "Följande bestämmelser i 1 kap.
    // årsredovisningslagen ska tillämpas: 3 § …": paragrafer utan kapitel i listan avser det kapitlet.
    const listChapter=pos=>{
      const before=s.slice(Math.max(0,pos-1200),pos);let cut=-1;for(const b of before.matchAll(/[.;]\s+(?=[A-ZÅÄÖ])/g))cut=b.index;
      const sentence=before.slice(cut+1);let hit=null;
      for(const h of sentence.matchAll(/bestämmelse\w*\s+i\s+(\d{1,3}(?:\s?[a-z](?![\p{L}]))?)\s*kap\.(?!\s*\d)/giu))hit=h;
      if(!hit)return null;
      const rest=sentence.slice(hit.index+hit[0].length);
      if(/\d\s*kap\./.test(rest)||!/[:\n]/.test(rest))return null;
      // Står kapitlet i en numrerad punkt gäller det inte efter nästa punkt ("5. … i 5 kap.: - 44 § … 6. 31 §").
      if(/(?:^|\n)\s*\d+\s*[a-z]?\.\s/.test(sentence.slice(0,hit.index))&&/\n\s*\d+\s*[a-z]?\.\s/.test(rest))return null;
      const t=targetLaw(rest,context,null);
      return t?{id:t.id,chapter:chap(hit[1])}:null;};
    for(const m of s.matchAll(pattern)){
      const body=m[0],start=m.index,after=s.slice(start+body.length,start+body.length+260);
      let target=targetLaw(after,context,last||lastBefore(start)),listCh=null;
      if(target&&!target.explicit&&!m[1]){const lc=listChapter(start);
        if(lc&&exists(context,lc.id,lc.chapter,key((m[2].match(numberIn)||[''])[0]))){target={id:lc.id,explicit:true};listCh=lc.chapter;}}
      if(target&&!target.explicit){const c=colonLaw(start);if(c&&exists(context,c,m[1]?chap(m[1]):'0',key((m[2].match(numberIn)||[''])[0])))target={id:c,explicit:true};}
      // Uppräkningar som avslutas med "…, allt jordabalken" avser den namngivna lagen.
      if(target&&!target.explicit){
        const tail=s.slice(start+body.length,start+body.length+4000);
        const all=/^[^;]*?,\s*allt\s+(?=\S)/.exec(tail);
        if(all&&!/\n\s*\d+\s*[a-z]?\.\s/.test(all[0])){const t=targetLaw(tail.slice(all[0].length),context,last);if(t&&t.explicit)target=t;}
        // Lång uppräkning där paragrafen inte finns i den egna lagen ("… 5 kap. 1 §, 7 kap. 1 § … lagen (2018:1200)"):
        // den första författning som namnges längre fram i samma uppräkning avses.
        const firstNum=(m[2].match(numberIn)||[''])[0];
        if(!target.explicit&&!exists(context,context.sfs,m[1]?chap(m[1]):(context.chapter||'0'),key(firstNum))&&!(!m[1]&&locate(context,key(firstNum)))){
          const stop=tail.search(/;|\n\s*\d+\s*[a-z]?\.\s|\.\s+[A-ZÅÄÖ]/);
          const span=stop<0?tail:tail.slice(0,stop);
          const nm=/(?<![\p{L}])(?:[\p{L}-]*(?:lagen|balken|förordningen|kungörelsen|ordningen)|lagen|förordningen)(?![\p{L}])/u.exec(span);
          if(nm){const t=targetLaw(span.slice(nm.index)+tail.slice(span.length,span.length+40),context,last);if(t&&t.explicit)target=t;}
          // Annars: en förordning som hänvisar till "2 kap. 1 §" utan lagnamn avser lagen den kompletterar.
          else if(context.anchor&&exists(context,context.anchor,m[1]?chap(m[1]):'0',key(firstNum)))target={id:context.anchor,explicit:true};
          // Annars: punktlista efter en namngiven lag ("Följande bestämmelser i förvaltningslagen (2017:900) gäller inte: - 32 § om …").
          else{
            const before=s.slice(Math.max(0,start-700),start);
            const names=[...before.matchAll(/(?<![\p{L}])(?:[\p{L}-]*(?:lagen|balken|förordningen|kungörelsen|ordningen)|lagen|förordningen)(?![\p{L}])/gu)];
            for(let i=names.length-1;i>=0;i--){
              const t=targetLaw(before.slice(names[i].index)+' ',context,last);
              if(t&&t.explicit&&t.id!==context.sfs&&exists(context,t.id,m[1]?chap(m[1]):'0',key(firstNum))&&/(?:^|\n)\s*-\s*$|:\s*$|,\s*-?\s*$|\n\s*-\s/.test(before.slice(names[i].index))){target=t;break;}
            }
          }
        }
      }
      // Följer hänvisningen direkt på en annan i en uppräkning ärver den dess kapitel.
      const between=prev?s.slice(prev.end,start):null;
      const inChain=between!=null&&new RegExp('^(?:'+qualifier.source.slice(1)+')?'+SEP+'$','iu').test(between);
      // "24 kap. 3 § respektive 5 § i den nya skollagen": samma författning och kapitel som föregående led.
      if(inChain&&target&&!target.explicit&&prev.explicit&&prev.id!==context.sfs&&!m[1]&&exists(context,prev.id,prev.chapter,key((m[2].match(numberIn)||[''])[0])))
        target={id:prev.id,explicit:true};
      prev={end:start+body.length,chapter:m[1]?chap(m[1]):(listCh||(inChain?prev.chapter:null)),id:target&&target.id,explicit:!!(target&&target.explicit)};
      if(!target)continue;
      const id=target.id;
      if(target.explicit&&id!==context.sfs)last=id;
      let chapter=prev.chapter||(id===context.sfs?(context.chapter||'0'):'0');
      const listStart=body.indexOf(m[2]);
      const raw=[];
      for(const n of m[2].matchAll(numberIn)){
        const at=start+listStart+n.index;raw.push({num:key(n[0]),start:at,end:at+n[0].length});
        const letter=/^\s*(?:-{1,2}|–)\s*([a-z])(?![\p{L}])/iu.exec(m[2].slice(n.index+n[0].length));
        if(letter&&/[a-z]$/i.test(n[0])){const pos=at+n[0].length+letter[0].length-1;raw.push({num:key(n[0]).replace(/[a-z]$/i,'')+letter[1].toLowerCase(),start:pos,end:pos+1});}
      }
      // Lag med löpande paragrafnumrering över kapitlen ("enligt 8 §" i 4 kap. avser 8 § i 2 kap.).
      if(id===context.sfs&&!prev.chapter&&raw.length&&!raw.some(n=>exists(context,id,chapter,n.num))){
        const c=locate(context,raw[0].num);if(c){chapter=c;prev.chapter=c;}
      }
      const numbers=[],members=[];
      for(let i=0;i<raw.length;i++){
        const n=raw[i],next=raw[i+1];
        // "7–9 §§": båda ändarna och allt däremellan; länken täcker hela intervallet.
        if(next&&DASH.test(s.slice(n.end,next.start))&&(exists(context,id,chapter,n.num)||exists(context,id,chapter,next.num))){
          const inner=typeof context.members==='function'?context.members(id,chapter,n.num,next.num):null;
          const all=inner&&inner.length?inner.map(key):[n.num,next.num];
          numbers.push({num:n.num,to:next.num,start:n.start,end:next.end});members.push(...all);i++;continue;
        }
        if(exists(context,id,chapter,n.num)){numbers.push(n);members.push(n.num);}
      }
      if(!numbers.length)continue;
      // En ensam paragraf länkas i sin helhet ("24 kap. 1 §"), uppräkningar nummer för nummer.
      const single=numbers.length===1&&raw.length===1;
      const parts=single?[{num:numbers[0].num,start,end:start+body.length}]:numbers;
      refs.push({start,end:start+body.length,body,id,chapter,explicit:target.explicit,numbers:[...new Set(members)],parts});
    }
    for(const m of s.matchAll(chapterList)){
      const start=m.index,end=start+m[0].length;
      if(refs.some(r=>start<r.end&&end>r.start))continue;
      const target=targetLaw(s.slice(end,end+200),context,lastBefore(start));
      if(!target)continue;
      if(!target.explicit&&(!context.chapter||context.chapter==='0'))continue;
      const raw=[...m[1].matchAll(/\d{1,3}(?:\s?[a-z](?![\p{L}]))?/giu)].map(n=>({num:chap(n[0]),start:start+n.index,end:start+n.index+n[0].length}));
      const parts=[],chapters=[];
      for(let i=0;i<raw.length;i++){
        const n=raw[i],next=raw[i+1];
        if(next&&DASH.test(s.slice(n.end,next.start))&&exists(context,target.id,n.num,null)&&exists(context,target.id,next.num,null)){
          const inner=typeof context.chapters==='function'?context.chapters(target.id,n.num,next.num):null;
          parts.push({num:null,chapter:n.num,chapterTo:next.num,start:n.start,end:next.end});
          chapters.push(...(inner&&inner.length?inner:[n.num,next.num]));i++;continue;
        }
        if(exists(context,target.id,n.num,null)){parts.push({num:null,chapter:n.num,start:n.start,end:n.end});chapters.push(n.num);}
      }
      if(!parts.length)continue;
      refs.push({start,end,body:m[0],id:target.id,explicit:target.explicit,chapter:parts[0].chapter,chapters,numbers:[],parts});
    }
    // Artiklar: "artikel 8 i Europakonventionen", "artiklarna 2–4"; inne i en konvention avses samma del.
    for(const m of s.matchAll(/(?<![\p{L}])[Aa]rtik(?:el|eln|larna)\s+(\d{1,3})(?:\.\d+)?((?:\s*(?:,|och|eller|-{1,2}|–)\s*\d{1,3}(?:\.\d+)?)*)/gu)){
      const start=m.index,end=start+m[0].length;
      if(refs.some(r=>start<r.end&&end>r.start))continue;
      const after=s.slice(end,end+160).toLowerCase().replace(/^\s*(?:första|andra|tredje|fjärde|femte)?\s*(?:stycket|punkten|led(?:et)?)?\s*/,'');
      const via=/^\s*(?:\d+\s+)?i\s+(?:den\s+)?/.exec(after);
      let id=null,chapter='0';
      if(via){const rest=after.slice(via[0].length);const t=treaties.find(([n])=>rest.startsWith(n));if(t){id=t[1];chapter=t[2];}
        else if(context.unit==='artikel'&&/^(?:denna|nämnda)\s+(?:konvention|avtal|överenskommelse|protokoll)/.test(rest)){id=context.sfs;chapter=context.chapter||'0';}}
      else if(context.unit==='artikel'&&!/^\s*i\s/.test(after)){id=context.sfs;chapter=context.chapter||'0';}
      if(!id)continue;
      const nums=[...m[0].matchAll(/(\d{1,3})(?:\.\d+)?/g)].map(n=>({num:n[1],start:start+n.index,end:start+n.index+n[0].length}));
      const parts=[],numbers=[];
      for(let i=0;i<nums.length;i++){
        const n=nums[i],next=nums[i+1];
        if(next&&DASH.test(s.slice(n.end,next.start))&&exists(context,id,chapter,n.num)){parts.push({num:n.num,to:next.num,start:n.start,end:next.end});numbers.push(n.num,next.num);i++;continue;}
        if(exists(context,id,chapter,n.num)){parts.push({num:n.num,start:nums.length===1?start:n.start,end:nums.length===1?end:n.end});numbers.push(n.num);}
      }
      if(parts.length)refs.push({start,end,body:m[0],id,explicit:true,chapter,numbers,parts});
    }
    for(const m of s.matchAll(chapterOnly)){
      const start=m.index,end=start+m[0].length;
      if(refs.some(r=>start<r.end&&end>r.start))continue;
      const target=targetLaw(s.slice(end,end+200),context,lastBefore(start));
      if(!target)continue;
      // Kapitel utan lagnamn avser aktuell lag endast när den har kapitel.
      if(!target.explicit&&(!context.chapter||context.chapter==='0'))continue;
      const c=chap(m[1]);
      if(!exists(context,target.id,c,null))continue;
      refs.push({start,end,body:m[0],id:target.id,explicit:target.explicit,chapter:c,numbers:[],parts:[{num:null,start,end}]});
    }
    return refs.sort((a,b)=>a.start-b.start);
  }
  function linkify(text,context){
    const s=String(text||''),refs=parseRefs(s,context);let out='',at=0;
    for(const ref of refs){
      if(ref.start<at)continue;
      for(const part of ref.parts){
        out+=escape(s.slice(at,part.start));
        const label=s.slice(part.start,part.end),para=part.num,chapter=part.chapter||ref.chapter;
        const href=context.href(ref.id,chapter,para);
        const range=part.to?' data-ref-to="'+escape(part.to)+'"':part.chapterTo?' data-ref-chapter-to="'+escape(part.chapterTo)+'"':'';
        out+='<a href="'+escape(href)+'" class="law-ref'+(range?' law-range':'')+'" data-ref="1" data-ref-sfs="'+escape(ref.id)+
          '" data-ref-chapter="'+escape(chapter)+'"'+(para?' data-ref-para="'+escape(para)+'"':'')+range+
          ' aria-label="Visa '+escape(ref.id+' '+chapter+(para?':'+para+(part.to?'–'+part.to:''):(part.chapterTo?'–'+part.chapterTo:'')+' kap.'))+'">'+escape(label)+'</a>';
        at=part.end;
      }
      // Paragraftecknet följer med sista numret visuellt men länkas inte separat.
      out+=escape(s.slice(at,ref.end));at=ref.end;
    }
    return out+escape(s.slice(at));
  }
  return {parseRefs,linkify,configure,targetLaw,locator};
});
;
// ---- editorial.js ----
/* Lagboken 0.5 – redaktionella rubriker, åtskilda från importerad lagtext.
   groups: rubrik som inleder en grupp vid angiven paragraf. Används bara i kapitel
           som saknar egna rubriker i källan.
   titles: kort rubrik för enskild paragraf (brottsbeteckning eller ämne).
   tests/test_editorial.js kontrollerar att varje angiven paragraf finns i lagdatan,
   så att en lagändring som flyttar eller tar bort paragrafer upptäcks direkt. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokEditorial=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const groups={
    '1962:700':{
      '3':{'1':'Uppsåtligt dödande','5':'Misshandel','7':'Vållande- och farebrott','11':'Förstadier och åtal'},
      '4':{'1':'Människorov, människohandel och frihetsberövande','3':'Barnfridsbrott','4':'Olaga tvång, fridskränkning och förföljelse',
        '4 c':'Äktenskapstvång och hedersrelaterade brott','5':'Olaga hot','6':'Hemfrid och integritet',
        '7':'Ofredande och psykisk påverkan','8':'Post-, tele- och dataintrång','10':'Förstadier och åtal'},
      '8':{'1':'Stöldbrott','5':'Rån','7':'Andra tillgreppsbrott','12':'Förstadier och åtalsbestämmelser'},
      '9':{'1':'Bedrägeribrott','4':'Utpressning och ocker','6':'Häleribrott','8':'Andra oredlighetsbrott','11':'Förstadier och åtalsbestämmelser'},
      '12':{'1':'Skadegörelsebrott','4':'Tagande av olovlig väg','5':'Förstadier och åtal'},
      '17':{'1':'Angrepp mot tjänsteman','8':'Brott vid röstning','10':'Brott mot rättskipningen','12':'Rymning','13':'Övriga brott mot allmän verksamhet','16':'Förstadier'},
      '23':{'1':'Försök, förberedelse och stämpling','4':'Medverkan','6':'Underlåtenhet att avslöja brott','7':'Vinning för annan'},
      '24':{'1':'Nödvärn och laga befogenhet','4':'Nöd','5':'Hjälp och excess','7':'Samtycke, order och villfarelse'}
    },
    '1942:740':{
      '23':{'1':'Förundersökningens inledning och ledning','5':'Försvarare och förhör','16':'Tvångsmedel och utredningsmaterial','18':'Underrättelse och avslut','21':'Dokumentation och särskilda regler'},
      '24':{'1':'Häktning','6':'Anhållande och gripande','8':'Underrättelse och rättigheter','12':'Häktningsframställning och förhandling','18':'Tidsfrister och hävning','22':'Förvar'}
    }
  };
  const titles={
    '1962:700':{
      '3':{'1':'Mord','2':'Dråp','3':'Barnadråp','5':'Misshandel','6':'Grov och synnerligen grov misshandel',
        '7':'Vållande till annans död','8':'Vållande till kroppsskada eller sjukdom','9':'Framkallande av fara för annan',
        '10':'Arbetsmiljöbrott','11':'Försök, förberedelse och stämpling','12':'Begränsningar i åtalsrätten'},
      '4':{'1':'Människorov','1 a':'Människohandel','1 b':'Människoexploatering','2':'Olaga frihetsberövande','3':'Barnfridsbrott',
        '4':'Olaga tvång','4 a':'Grov fridskränkning och grov kvinnofridskränkning','4 b':'Olaga förföljelse',
        '4 c':'Äktenskapstvång','4 d':'Äktenskapsresebrott','4 e':'Hedersförtryck','4 f':'Oskuldskontroll',
        '4 g':'Intygande av sexuell oskuld','5':'Olaga hot','6':'Hemfridsbrott och olaga intrång','6 a':'Kränkande fotografering',
        '6 b':'Olovlig identitetsanvändning','6 c':'Olaga integritetsintrång','6 d':'Grovt olaga integritetsintrång',
        '7':'Ofredande','7 a':'Uppmaning till självmord','7 b':'Psykiskt våld','8':'Brytande av post- eller telehemlighet',
        '9':'Intrång i förvar','9 a':'Olovlig avlyssning','9 b':'Förberedelse till brytande av telehemlighet m.m.',
        '9 c':'Dataintrång','10':'Försök, förberedelse och stämpling','11':'Begränsningar i åtalsrätten'},
      '8':{
        '1':'Stöld','2':'Ringa stöld','4':'Grov stöld','4 a':'Inbrottsstöld',
        '5':'Rån','6':'Grovt rån','7':'Tillgrepp av fortskaffningsmedel','8':'Egenmäktigt förfarande',
        '9':'Självtäkt','10':'Olovlig energiavledning',
        '11':'Tillgrepp i skog eller mark','12':'Försök och förberedelse','13':'Begränsningar i åtalsrätten'
      },
      '9':{'1':'Bedrägeri','2':'Ringa bedrägeri','3':'Grovt bedrägeri','3 a':'Grovt fordringsbedrägeri',
        '3 c':'Olovlig befattning med betalningsverktyg','3 d':'Företagskapning',
        '4':'Utpressning','5':'Ocker','6':'Häleri','6 a':'Utförselhäleri','7':'Häleriförseelse',
        '8':'Oredligt förfarande','9':'Svindleri','10':'Ockerpantning',
        '11':'Förstadier','12':'Begränsningar i åtalsrätten'},
      '12':{'1':'Skadegörelse','2':'Ringa skadegörelse','2 a':'Åverkan','3':'Grov skadegörelse','4':'Tagande av olovlig väg',
        '5':'Försök och förberedelse','6':'Begränsningar i åtalsrätten'},
      '17':{'1':'Våld eller hot mot tjänsteman','2':'Angrepp mot tjänsteman','3':'Förolämpning mot tjänsteman','4':'Våldsamt motstånd',
        '5':'Skydd för vissa samhällsnyttiga funktioner','6':'Tjänstemän vid Internationella brottmålsdomstolen',
        '8':'Otillbörligt verkande vid röstning','9':'Brott mot rösthemlighet','10':'Övergrepp i rättssak',
        '11':'Skyddande av brottsling','12':'Rymning','12 a':'Främjande av rymning eller flykt',
        '13':'Överträdelse av myndighets bud','15':'Föregivande av allmän ställning','16':'Försök, förberedelse och stämpling'},
      '23':{'1':'Försök','2':'Förberedelse och stämpling','3':'Frivilligt tillbakaträdande','4':'Medverkan',
        '5':'Lindrigare straff vid medverkan','6':'Underlåtenhet att avslöja eller förhindra brott','7':'Vinning för annan'},
      '24':{'1':'Nödvärn','2':'Laga befogenhet vid rymning och motstånd','3':'Våld vid myteri och strid','4':'Nöd',
        '5':'Hjälp till den som har rätt att ingripa','6':'Excess','7':'Samtycke','8':'Order','9':'Straffrättsvillfarelse'}
    },
    '1984:387':{
      '0':{'1':'Polisverksamhetens ändamål','2':'Polismyndighetens uppgifter','2 a':'Särskilt personsäkerhetsarbete','2 b':'Särskilda avdelningar',
        '3':'Säkerhetspolisens uppgifter','4':'Polisman','6':'Samverkan','7':'Jäv','8':'Behovs- och proportionalitetsprincipen',
        '9':'Rapporteringsskyldighet','10':'Våldsanvändning','10 a':'Fängsel','11':'Tillfälligt omhändertagande enligt särskild föreskrift',
        '12':'Omhändertagande av unga under 18 år','12 a':'Omhändertagande i avvaktan på LVM-beslut','13':'Ordningsstörning: avvisa, avlägsna, omhänderta',
        '13 a':'Avvisande från avspärrat område','13 b':'Inställd eller upplöst allmän sammankomst','13 c':'Folksamling som stör ordningen',
        '14':'Kvarhållande för identifiering','15':'Underrättelse om omhändertagande','16':'Förhör och längsta tid','17':'Hänsyn vid omhändertagande',
        '18':'Förhållandet till gripande','19':'Skyddsvisitation','19 a':'Kroppsvisitation vid förhör','20':'Tillträde för att söka efter person',
        '20 a':'Genomsökning av fordon efter vapen','20 b':'Tillträde till gemensamma utrymmen','21':'Tillträde när någon kan behöva hjälp',
        '22':'Stoppa fordon','22 a':'Visitation i säkerhetszon','22 b':'Beslut om säkerhetszon','22 c':'Säkerhetszonens varaktighet',
        '22 d':'Beslutets innehåll','22 e':'Upphävande av säkerhetszon','22 f':'Överklagande','23 a':'Arrestantvakt och passkontrollant',
        '23 b':'Tystnadsplikt för arrestantvakt','24':'Avspärrning och utrymning','24 a':'Omhändertagande av egendom vid risk för trafikbrott',
        '24 b':'Anmälan om omhändertagen egendom','24 c':'Omhändertagandets längd','24 d':'Egendom som inte hämtas',
        '25':'Uppgifter från transportföretag','27':'Protokoll över ingripanden','28':'Protokoll över fängsel och tekniska hjälpmedel',
        '29 a':'Transport av frihetsberövade','30':'Verkställighetsföreskrifter'}
    },
    '1976:511':{
      '0':{'1':'Omhändertagande av berusad','2':'Hänsyn vid omhändertagande','3':'Läkarundersökning','4':'Kvarhållande och förvar',
        '5':'Anmälan till förman','6':'Tillsyn','7':'Underrättelse och frigivning','7 a':'Omprövning vid förvar hos Kriminalvården',
        '8':'Omhändertagande av berusningsmedel','9':'Förhållandet till gripande','10':'Ordningsvakter'}
    },
    '1942:740':{
      '28':{
        '1':'Reell husrannsakan','2':'Personell husrannsakan','2 a':'Personell husrannsakan i transportmedel',
        '3':'Husrannsakan i vissa lokaler','3 a':'Proportionalitet','4':'Beslut om husrannsakan',
        '5':'Fara i dröjsmål','6':'Genomförande av husrannsakan','7':'Närvaro vid husrannsakan',
        '8':'Enskilda handlingar','9':'Protokoll och bevis','10':'Undersökning på annat ställe',
        '10 a':'Definition av genomsökning på distans','10 b':'Genomsökning på distans',
        '10 c':'Undantagna uppgifter','10 d':'Beslut och fara i dröjsmål',
        '10 e':'Närvaro vid genomsökning','10 f':'Försvårande av utredning',
        '10 g':'Underrättelse','10 h':'Protokoll','10 i':'Tillämpliga bestämmelser',
        '11':'Kroppsvisitation','12':'Kroppsbesiktning','12 a':'DNA-prov på misstänkt',
        '12 b':'DNA-prov på annan än misstänkt','12 c':'Provtagningsform','13':'Gemensamma bestämmelser',
        '13 a':'Kvarhållande för visitation','14':'Fingeravtryck och andra underlag',
        '14 a':'Underlag från annan än misstänkt','14 b':'Gemensamma bestämmelser','15':'Avvikande bestämmelser'
      },
      '24':{
        '1':'Häktning och särskilda häktningsskäl','2':'Häktning utan hänsyn till brottets svårhet',
        '3':'Utredningshäktning','4':'Begränsningar med hänsyn till personliga förhållanden',
        '4 a':'Tidsgräns för häktning','5':'Beslut om häktning','5 a':'Restriktioner','6':'Anhållande','7':'Gripande',
        '8':'Förhör efter anhållande','9':'Underrättelse till frihetsberövad','9 a':'Insyn i skälen',
        '10':'Hävning av anhållande','11':'Häktningsframställning','12':'Tidsfrist för häktningsframställning',
        '13':'Häktningsförhandling','13 a':'Särskilda regler för häktningsförhandling',
        '14':'Förhandlingens genomförande','15':'Förhandlingens fortsättning','16':'Häktningsbeslut',
        '17':'Häktning utan föregående anhållande','18':'Åtalstid','18 a':'Förlängning av häktningstid',
        '19':'Omprövning av utredningshäktning','20':'Hävning av häktning',
        '21':'Häktning efter dom','21 a':'Frihetsberövandets längd','22':'Förvar av gripna och anhållna','23':'Lagstöd för förvar','24':'Behandling av frihetsberövade'
      }
    }
  };
  return {groups,titles};
});
;
// ---- law-model.js ----
/* Lagboken 0.5 – val av lydelse. Avgör vilken lydelse som gäller ett visst datum
   utifrån Riksdagens markeringar om ikraftträdande och upphörande. Gissar aldrig:
   ett obestämt datum ("den dag som regeringen bestämmer") räknas som ej inträffat. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokLaw=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function today(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function status(v,day){
    const started=!v.inForce||(!!v.inForce.date&&v.inForce.date<=day);
    const ended=!!(v.expires&&v.expires.date&&v.expires.date<=day);
    if(v.superseded)return started&&!ended?'superseded':ended?'expired':'upcoming';
    return !started?'upcoming':ended?'expired':'current';
  }
  function versions(item){
    return item.versions&&item.versions.length?item.versions:[{text:item.text,amendedBy:item.amendedBy}];
  }
  // {current, others, pending}: pending = paragrafen har ingen lydelse som gäller i dag.
  function resolve(item,day){
    day=day||today();
    const list=versions(item).map((v,i)=>Object.assign({},v,{index:i,status:status(v,day)}));
    const current=list.find(v=>v.status==='current')||list.find(v=>v.status==='upcoming')||list[0];
    const others=list.filter(v=>v!==current&&v.status!=='expired');
    return {current,others,pending:current.status!=='current'};
  }
  function formatDate(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
    if(!m)return iso||'';
    const months=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
    return Number(m[3])+' '+months[Number(m[2])-1]+' '+m[1];
  }
  function when(mark){return mark.date?formatDate(mark.date):'den dag regeringen bestämmer';}
  function describe(v){
    if(v.status==='upcoming')return 'Kommande lydelse · träder i kraft '+when(v.inForce);
    if(v.status==='expired')return 'Upphörd lydelse';
    if(v.status==='superseded')return 'Tidigare lydelse'+(v.amendedBy?' (SFS '+v.amendedBy+')':'')+' · kan gälla enligt övergångsbestämmelser';
    if(v.expires)return 'Gäller till '+(v.expires.date?formatDate(v.expires.date):'den dag regeringen bestämmer');
    return 'Annan lydelse i källan';
  }
  // Kontrollsummor för ändringsbevakning. Samma beräkning används i scripts/build_indexes.js.
  function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
  function paraHash(item){return hash(JSON.stringify(item.versions||[item.text]));}
  function snapshot(doc){
    const paras={},parts=[];
    for(const ch of doc.chapters)for(const item of ch.items){
      if(item.type!=='para')continue;
      const h=paraHash(item);paras[ch.number+'|'+item.number]=h;parts.push(ch.number+'|'+item.number+'|'+h);
    }
    return {hash:hash(parts.join(';')),paras};
  }
  function diff(before,doc){
    const now=snapshot(doc),added=[],changed=[],removed=[];
    for(const k in now.paras){if(!(k in before.paras))added.push(k);else if(before.paras[k]!==now.paras[k])changed.push(k);}
    for(const k in before.paras)if(!(k in now.paras))removed.push(k);
    return {added,changed,removed,snapshot:now};
  }
  // Ordvis jämförelse mellan två lydelser: [{type:'same'|'del'|'ins',text}]
  function diffWords(a,b){
    const A=String(a||'').split(/(\s+)/),B=String(b||'').split(/(\s+)/);
    if(A.length*B.length>4e6)return [{type:'del',text:a},{type:'ins',text:b}];
    const n=A.length,m=B.length,L=new Array((n+1)*(m+1)).fill(0),w=m+1;
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*w+j]=A[i]===B[j]?L[(i+1)*w+j+1]+1:Math.max(L[(i+1)*w+j],L[i*w+j+1]);
    const out=[],push=(type,text)=>{const last=out[out.length-1];if(last&&last.type===type)last.text+=text;else out.push({type,text});};
    let i=0,j=0;
    while(i<n&&j<m){
      if(A[i]===B[j]){push('same',A[i]);i++;j++;}
      else if(L[(i+1)*w+j]>=L[i*w+j+1])push('del',A[i++]);
      else push('ins',B[j++]);
    }
    while(i<n)push('del',A[i++]);while(j<m)push('ins',B[j++]);
    // Slå ihop ändringar som bara skiljs åt av mellanrum till ett struket och ett nytt block,
    // så att texten läses som "gammal formulering → ny formulering" i stället för ord för ord.
    const marked=out.map(x=>(/^\s+$/.test(x.text)?{type:'same',text:x.text}:x)),res=[];
    for(let k=0;k<marked.length;k++){
      const x=marked[k];
      if(x.type==='same'){res.push(x);continue;}
      let del='',ins='';
      while(k<marked.length){
        const y=marked[k];
        if(y.type==='del')del+=y.text;else if(y.type==='ins')ins+=y.text;
        else if(/^\s+$/.test(y.text)&&marked[k+1]&&marked[k+1].type!=='same'){del+=del?y.text:'';ins+=ins?y.text:'';}
        else break;
        k++;
      }
      k--;
      if(del)res.push({type:'del',text:del});
      if(ins)res.push({type:'ins',text:ins});
      if(marked[k+1]&&marked[k+1].type==='same'&&(del||ins))res.push({type:'same',text:''});
    }
    return res.filter(x=>x.text!=='');
  }
  return {today,status,resolve,describe,formatDate,hash,paraHash,snapshot,diff,diffWords};
});
;
// ---- search-index.js ----
/* Lagboken 0.9 – fritextsökning i ett färdigbyggt index (scripts/build_indexes.js).
   Bara de indexdelar som behövs för sökorden hämtas; lagtexten laddas först när träffar visas.
   Varje sökord måste finnas i paragrafen. Ordet matchas också som början av längre ord,
   så att "husrannsak" hittar både husrannsakan och husrannsakningar. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokIndex=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const fold=s=>String(s||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const words=s=>Array.from(new Set(fold(s).match(/[a-z0-9]{2,}/g)||[]));
  // Vardagliga ord och förkortningar som annars inte finns i lagtexten.
  const SYNONYMS={
    lob:['berusad'],fylla:['berusad'],fyllo:['berusad'],
    rattfylla:['rattfylleri'],rattfyllerist:['rattfylleri'],rattonykter:['rattfylleri'],
    snatteri:['ringa','stold'],fortkorning:['hastighet'],olovlig:['olovlig'],
    visitation:['kroppsvisitation'],visitera:['kroppsvisitera'],
    gripa:['gripas'],anhalla:['anhallas'],hakta:['haktas'],
    kniv:['kniv'],vapen:['vapen'],misshandla:['misshandel'],
    nodvarn:['nodvarn'],tvang:['tvang'],
    sekretess:['sekretess'],hemfrid:['hemfrid'],
    lvu:['vard','unga'],lvm:['missbrukare'],lpt:['psykiatrisk','tvangsvard'],
    anhallande:['anhall'],haktning:['hakt'],gripande:['grip'],omhandertagande:['omhandertag'],beslagtagande:['beslag']
  };
  function expand(tokens){
    const out=[];
    for(const t of tokens){const s=SYNONYMS[t];if(s&&!(s.length===1&&s[0]===t))out.push(...s);else out.push(t);}
    return Array.from(new Set(out));
  }
  function decode(list){let n=0;return list.map(d=>(n+=d));}
  function create(fetchJson){
    let base=null;const shards=new Map(),chunks=new Map();
    function meta(){if(!base)base=fetchJson('data/index/meta.json').then(m=>Object.assign(m,{names:new Set(m.shards)})).catch(e=>{base=null;throw e;});return base;}
    function shard(name){
      if(!shards.has(name))shards.set(name,Promise.resolve().then(()=>fetchJson('data/index/terms/'+name+'.json')).catch(()=>({})));
      return shards.get(name);
    }
    function chunk(n){
      if(!chunks.has(n))chunks.set(n,Promise.resolve().then(()=>fetchJson('data/index/paras/'+n+'.json')).catch(e=>{chunks.delete(n);throw e;}));
      return chunks.get(n);
    }
    // Orddelar som kan innehålla ord som börjar med t.
    function shardsFor(m,t){
      for(let k=t.length;k>=2;k--)if(m.names.has(t.slice(0,k)))return [t.slice(0,k)];
      return m.shards.filter(n=>n.startsWith(t));
    }
    async function terms(m,t){
      const parts=await Promise.all(shardsFor(m,t).map(shard));
      return Object.assign({},...parts);
    }
    async function query(q,options){
      const limit=(options&&options.limit)||60;
      const tokens=expand(words(q));
      if(!tokens.length)return {total:0,hits:[],tokens};
      const idx=await meta();
      const matches=[];
      for(const t of tokens){
        const data=await terms(idx,t);
        const exact=new Set(data[t]?decode(data[t]):[]),all=new Set(exact);
        for(const term in data)if(term!==t&&term.startsWith(t))for(const n of decode(data[term]))all.add(n);
        matches.push({token:t,exact,all});
      }
      matches.sort((a,b)=>a.all.size-b.all.size);
      let candidates=[...matches[0].all];
      for(const m of matches.slice(1))candidates=candidates.filter(n=>m.all.has(n));
      const lawCount=idx.laws.length;
      // Bara de block som innehåller kandidater hämtas.
      const need=[...new Set(candidates.map(n=>Math.floor(n/idx.chunk)))];
      const loaded=new Map(await Promise.all(need.map(c=>chunk(c).then(rows=>[c,rows]))));
      const row=n=>loaded.get(Math.floor(n/idx.chunk))[n%idx.chunk];
      const scored=candidates.map(n=>{
        const p=row(n),title=fold(p[3]);
        let score=0;
        for(const m of matches){
          score+=m.exact.has(n)?2:1;
          if(title&&title.includes(m.token))score+=5;
        }
        // Central författning (balk, grundlag, lag före förordning) och sökord i lagens namn väger tyngre.
        const w=idx.weights?idx.weights[p[0]]:(lawCount-p[0])/lawCount;
        score+=w*4;
        if(idx.names)for(const m of matches)if(new RegExp('(?:^|[^a-z])'+m.token+'|'+m.token+'(?:slag|sforordning|sbalk)').test(idx.names[p[0]]))score+=4*w;
        return {n,score};
      }).sort((a,b)=>b.score-a.score||a.n-b.n);
      return {total:scored.length,tokens,hits:scored.slice(0,limit).map(({n,score})=>{
        const p=row(n);return {sfs:idx.laws[p[0]],chapter:p[1],number:p[2],title:p[3],score};
      })};
    }
    function warm(){meta().then(m=>['ha','br','po','gr','an'].forEach(t=>shardsFor(m,t).slice(0,4).forEach(shard))).catch(()=>{});}
    return {query,warm};
  }
  // Kort utdrag kring första träffen, med sökorden markerade.
  function snippet(text,tokens,escape,size){
    size=size||180;
    const plain=String(text||'').replace(/\s+/g,' ');
    const folded=fold(plain);
    let at=-1;
    for(const t of tokens){const i=folded.search(new RegExp('(?:^|[^a-z0-9])'+t));if(i>=0&&(at<0||i<at))at=i;}
    const start=Math.max(0,at-50),slice=plain.slice(start,start+size);
    // Folding ändrar inte längden för svenska tecken, så positioner kan återanvändas.
    const f=fold(slice),parts=[];
    for(const t of tokens){
      const re=new RegExp('(^|[^a-z0-9])('+t+'[a-z0-9]*)','g');let m;
      while((m=re.exec(f))){const s=m.index+m[1].length;parts.push([s,s+m[2].length]);}
    }
    parts.sort((a,b)=>a[0]-b[0]);
    let out='',pos=0;
    for(const [s,e] of parts){if(s<pos)continue;out+=escape(slice.slice(pos,s))+'<mark>'+escape(slice.slice(s,e))+'</mark>';pos=e;}
    out+=escape(slice.slice(pos));
    return (start>0?'…':'')+out+(start+size<plain.length?'…':'');
  }
  return {create,words,fold,snippet,expand};
});
;
// ---- highlights.js ----
/* Lagboken 0.6 – överstrykningar i lagtext.
   En markering sparas som teckenpositioner i paragrafens text plus den markerade texten.
   Om lagtexten ändras söks texten upp igen; hittas den inte visas markeringen som inaktuell. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokHighlights=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const COLORS=[['yellow','Gul'],['green','Grön'],['rose','Rosa']];
  // Hitta markeringens läge i aktuell text: först sparade positioner, annars sökning på texten.
  function locate(text,h){
    if(text.slice(h.start,h.end)===h.quote)return {start:h.start,end:h.end};
    const at=text.indexOf(h.quote);
    return at>=0?{start:at,end:at+h.quote.length}:null;
  }
  function textNodes(container){
    const out=[],walk=n=>{for(const c of n.childNodes){if(c.nodeType===3)out.push(c);else if(c.nodeType===1)walk(c);}};
    walk(container);return out;
  }
  // Teckenpositioner för ett markerat område, räknat i containerns textContent.
  function offsets(container,range){
    let pos=0,start=null,end=null;
    for(const node of textNodes(container)){
      if(node===range.startContainer)start=pos+range.startOffset;
      if(node===range.endContainer)end=pos+range.endOffset;
      pos+=node.data.length;
    }
    if(start==null&&container.contains(range.startContainer))start=0;
    if(end==null&&container.contains(range.endContainer))end=pos;
    if(start==null||end==null||end<=start)return null;
    return {start,end};
  }
  // Omsluter [start,end) med <mark>-element utan att ändra textens struktur (länkar bevaras).
  function wrap(container,start,end,make){
    let pos=0;
    for(const node of textNodes(container)){
      const len=node.data.length,from=Math.max(start,pos),to=Math.min(end,pos+len);
      if(from<to){
        let target=node;
        if(to-pos<len)target.splitText(to-pos);
        if(from-pos>0)target=target.splitText(from-pos);
        const mark=make();target.parentNode.insertBefore(mark,target);mark.appendChild(target);
      }
      pos+=len;
      if(pos>=end)break;
    }
  }
  return {COLORS,locate,offsets,wrap,textNodes};
});
;
// ---- toc-model.js ----
/* Lagboken 0.5 – rubriker och innehållsförteckning.
   Samma gruppering används i innehållsförteckningen, kapitellistan och i lagtexten.
   Rubriker från källan har företräde; redaktionella grupper (assets/editorial.js)
   används bara i kapitel som saknar egna rubriker. Lagtexten påverkas aldrig. */
(function(root,factory){
  const editorial=(typeof module==='object'&&module.exports)?require('./editorial.js'):root.LagbokEditorial;
  const api=factory(editorial);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokTOC=api;
})(typeof window!=='undefined'?window:globalThis,function(editorial){
  'use strict';
  const groups=(editorial&&editorial.groups)||{};
  const titles=(editorial&&editorial.titles)||{};
  const n=v=>String(v||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const clean=s=>String(s||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
  const key=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  function snippet(text){
    let s=clean(text).replace(/^\/(?:Upphör|Träder)[^/]*\/\s*/i,'');
    if(/^(?:har|är)\s+upphäv(?:ts|d)|^har\s+upphört\s+att\s+gälla/i.test(s)||/(?:har|är)\s+upphäv(?:ts|d)/i.test(s.slice(0,90)))return 'Upphävd paragraf';
    const punctuation=s.search(/[.;:!?]/);
    if(punctuation>=18&&punctuation<100)s=s.slice(0,punctuation+1);
    if(s.length>88){s=s.slice(0,85).replace(/\s+\S*$/,'')+'…';}
    return s||'Text saknas';
  }
  // Rubriker som står i själva dokumentet (t.ex. konventionsartiklar: "Artikel 8 – Rätt till skydd för privat- och familjeliv").
  const docTitles={};
  function registerDoc(sfs,doc){
    for(const ch of (doc&&doc.chapters)||[])for(const item of ch.items||[])
      if(item.type==='para'&&item.title)docTitles[sfs+'|'+ch.number+'|'+key(item.number)]=item.title;
  }
  function curatedTitle(sfs,chapter,number){
    return titles[sfs]?.[String(chapter)]?.[key(number)]||docTitles[sfs+'|'+chapter+'|'+key(number)]||null;
  }
  function description(sfs,chapter,p){
    if(p.repealed)return {text:'Upphävd paragraf',kind:'upphävd'};
    const curated=curatedTitle(sfs,chapter,p.number);
    return curated?{text:curated,kind:'redaktionell'}:{text:snippet(p.text),kind:'textutdrag'};
  }
  function hasSourceHeadings(ch){return (ch.items||[]).some(x=>x.type==='heading'&&!x.editorial);}
  // Grupp: {id,title,parent,origin,first,paragraphs:[{number,title,kind,excerpt}]}
  function chapterGroups(sfs,ch){
    const starts=hasSourceHeadings(ch)?{}:(groups[sfs]?.[String(ch.number)]||{});
    const out=[];let active=null,pending=[],id=0;
    function newGroup(title,origin,parent){active={id:'g'+id++,title,parent:parent||null,origin,first:null,paragraphs:[]};out.push(active);}
    for(const item of ch.items||[]){
      if(item.type==='heading'){pending.push({title:clean(item.text),origin:item.editorial?'redaktionell':'källa'});continue;}
      if(item.type!=='para')continue;
      const start=starts[key(item.number)];
      if(start)newGroup(start,'redaktionell');
      else if(pending.length){
        const last=pending[pending.length-1];
        const parent=pending.length>1?pending[pending.length-2].title:null;
        if(!active||last.title!==active.title)newGroup(last.title,last.origin,parent);
      }
      if(!active)newGroup(ch.title||'Bestämmelser','kapitel');
      if(active.first==null)active.first=String(item.number);
      const d=description(sfs,ch.number,item);
      active.paragraphs.push({number:String(item.number),title:d.text,kind:d.kind,excerpt:clean(item.text).slice(0,120)});
      pending=[];
    }
    return out.filter(g=>g.paragraphs.length);
  }
  function chapterMatches(ch,chapterGroups,query){
    const q=n(query);if(!q)return true;
    return n([ch.title,ch.number+' kap.',...chapterGroups.flatMap(g=>[g.title,...g.paragraphs.flatMap(p=>[p.number+' §',p.title,p.excerpt])])].join(' ')).includes(q);
  }
  return {chapterGroups,chapterMatches,description,curatedTitle,snippet,registerDoc};
});
;
// ---- tutorial.js ----
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
;
// ---- app.js ----
/* Lagbok Desktop: Lagboken som Windows-app (Tauri). Samma läsapp som Lagboken; Windows-delarna finns i desktop.js och src-tauri. */
(function () {
  'use strict';
  const APP_VERSION='1.1.0';
  // Lagbok Desktop körs i Windows-skalet; i en vanlig webbläsare (testerna) beter sig appen som Lagboken.
  const DESKTOP=!!window.LAGBOK_DESKTOP;
  const APP_NAME='Lagbok Desktop';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const view = $('#view');
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  const defaults = {favourites:[], recents:[], notes:{}, highlights:{}, collections:[], watch:{}, readPos:{}, lastRead:null, lastColor:'yellow', usage:{}, fontFamily:'sans', lastBackup:null, theme:'light', fontSize:1, lineHeight:1.55, readingMode:'standard', focusReader:'off', openSections:['grundlagar','balkar']};
  let pref;
  try { pref = Object.assign({}, defaults, JSON.parse(localStorage.getItem('lagboken-settings') || '{}')); }
  catch (_) { pref = Object.assign({}, defaults); }
  if(pref.theme==='system' && !pref.themeChosen){pref.theme='light';try{localStorage.setItem('lagboken-settings',JSON.stringify(pref))}catch(_){}}
  const searchCore=window.LagbokSearch;
  const legalLinks=window.LagbokReferences;
  const tocModel=window.LagbokTOC;
  const lawModel=window.LagbokLaw;
  const highlights=window.LagbokHighlights;
  const fetchJson=(url)=>fetch(url).then(r=>{if(!r.ok)throw Error(url);return r.json();});
  const searchIndex=window.LagbokIndex?window.LagbokIndex.create(fetchJson):null;
  const state = {find:null,navDir:'',newHighlight:null,version:'',sections:[],relations:{},pen:false,penAnchor:null,editingNote:null,searchFilter:'',marksFilter:'',marksQuery:'',status:{},upcoming:null,backlinks:new Map(),pendingHighlight:null,markTerms:null,returnStack:[],catalog:[],fap:[],laws:new Map(),loading:new Map(),query:'',searchEpoch:0,positions:{},current:null,previous:[],savedOnHome:false,focus:pref.focusReader==='on',visibleParagraph:null,history:new Map(),forarbeten:new Map(),atDate:null,editFavs:false,showSections:false};
  const source = 'https://data.riksdagen.se/dokument/sfs-';
  const html = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = html;
  const norm = (v) => String(v || '').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s.-]+/g,' ').trim();
  const sfsFile = (id) => String(id).replace(/[: ]/g,'-');
  const sourceUrl = (id) => source + sfsFile(String(id).replace(/-K$/,'')) + '.html';
  const lawById = (id) => state.catalog.find(d => d.sfs === id);
  // Konventioner som en lag inkorporerar (t.ex. Europakonventionen i lag 1994:1219) ligger i lagen som egna
  // kapitel ("K", "P1", "P4" …) indelade i artiklar i stället för paragrafer.
  const isArt = (id,cap) => {
    const d=state.laws.get(id);
    if(d){const c=d.chapters.find(x=>String(x.number)===String(cap));return !!c&&c.unit==='artikel';}
    return /^[KPB]\d*b*$/.test(String(cap||''))&&!!(lawById(id)||{}).articleChapter;
  };
  const numLabel = (id,num,cap) => isArt(id,cap)?'Artikel '+num:/^\d+(?:\.\d+)+$/.test(String(num))?'Tilläggsbestämmelse '+num:num+' §';
  function chapShort(id,cap){
    const d=state.laws.get(id),c=d&&d.chapters.find(x=>String(x.number)===String(cap));
    return c&&c.title?c.title.replace(/\s+till\s+(?:den\s+)?(?:europeiska\s+)?konventionen.*$/i,''):cap;
  }
  // "3 kap. 8 §", "8 §", "artikel 8" eller "Protokoll nr 4 artikel 2".
  function placeLabel(id,cap,para){
    if(isArt(id,cap))return chapShort(id,cap)+(para?', artikel '+para:'');
    return (cap&&cap!=='0'?cap+' kap. ':'')+(para?(/^\d+(?:\.\d+)+$/.test(String(para))?'tilläggsbestämmelse '+para:para+' §'):'');
  }
  const searchText = (item) => item.versions ? item.versions.map(v=>v.text).join('\n\n') : String(item.text||'');
  function savePrefs() { try {localStorage.setItem('lagboken-settings',JSON.stringify(pref));} catch (_) {} }
  function applyPrefs() {
    const dark = pref.theme === 'dark' || (pref.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.content=dark?'#131D17':'#FFFDF9';
    document.documentElement.style.setProperty('--fontscale',String(pref.fontSize));
    document.documentElement.dataset.readerFont=pref.fontFamily==='serif'?'serif':'sans';
    document.documentElement.style.setProperty('--lineheight',String(pref.lineHeight));
    document.documentElement.dataset.readmode=pref.readingMode||'standard';
  }
  applyPrefs();
  function route() {
    const hash = (location.hash || '#/catalog').replace(/^#\/?/,'');
    const p = hash.split('/').map(decodeURIComponent);
    return {page:p[0] || 'catalog',sfs:p[1] || '',chapter:p[2],paragraph:p[3]};
  }
  function urlFor(sfs,cap,para) {
    return '#/law/' + encodeURIComponent(sfs) + (cap == null ? '' : '/' + encodeURIComponent(String(cap))) + (para == null ? '' : '/' + encodeURIComponent(String(para)));
  }
  function navigate(hash,replace) {
    state.positions[location.hash || '#/home'] = view.scrollTop;
    state.visibleParagraph=null;
    closeSheet();
    const dest = hash || '#/catalog';
    if(!dest.startsWith('#/law/'))state.focus=false;
    else state.focus=pref.focusReader==='on';
    if ((location.hash || '#/home') === dest && !replace) { render(); return; }
    if(!state.navDir)state.navDir='forward';
    if (replace) history.replaceState(null,'',dest);
    else history.pushState(null,'',dest);
    // Lagens namn glider från raden i listan upp till rubrikraden (iOS 18 och senare).
    const shared=state.sharedTitle;state.sharedTitle=null;
    if(shared&&document.startViewTransition&&!reducedMotion()){
      state.navDir='none';
      shared.style.viewTransitionName='law-title';
      const vt=document.startViewTransition(async()=>{
        shared.style.viewTransitionName='';
        await render(true);
        $('#top-title').style.viewTransitionName='law-title';
      });
      vt.finished.finally(()=>{$('#top-title').style.viewTransitionName='';});
      return;
    }
    render(true);
  }
  function reducedMotion(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function back() {
    closeSheet();
    if (history.state || state.previous.length) history.back();
    else navigate('#/catalog');
  }
  // Kort meddelande, valfritt med en ångra-knapp.
  function toast(message,undo) {
    const el = $('#toast');
    toast.undo=undo||null;
    if(undo){el.innerHTML='<span>'+html(message)+'</span><button type="button" class="toast-undo" data-action="toast-undo">Ångra</button>';}
    else el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {el.hidden=true;toast.undo=null;},undo?5000:2300);
  }
  function closeSheet() {
    sheet.style.translate='';if(sheet.classList.remove)sheet.classList.remove('dragging');
    sheet.hidden = true; scrim.hidden = true; sheet.dataset.kind=''; $('#menu-button').setAttribute('aria-expanded','false'); sheet.innerHTML = '';
  }
  function showSheet(markup,autoFocus=true) {
    sheet.innerHTML = markup;
    sheet.dataset.kind='normal';
    sheet.hidden = false; scrim.hidden = false; $('#menu-button').setAttribute('aria-expanded','true');
    if(autoFocus)setTimeout(() => { const focus = $('input',sheet); if(focus) focus.focus({preventScroll:true}); },40);
  }
  function iconSearch() {return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 5 5"/></svg>';}
  function searchBox(placeholder) {
    return '<form id="global-search" class="searchbar-wrap" role="search" autocomplete="off"><div class="searchbox">'+iconSearch()+
      '<input id="query" name="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-suggest" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="'+html(placeholder||'Sök författning, begrepp eller lagrum')+'" value="'+attr(state.query)+'">'+
      '<button type="button" class="search-clear" data-action="clear-search" aria-label="Rensa sökning">×</button></div>'+
      '<div id="search-suggest" class="suggestions" role="listbox" hidden></div></form>';
  }
  function listRow(title,subtitle,go,badge) {
    return '<a class="list-row" href="' + attr(go) + '" data-link="1">' +
      (badge ? '<span class="pill">' + html(badge) + '</span>' : '') +
      '<div class="grow"><div class="row-title">' + html(title) + '</div><div class="row-sub">' + html(subtitle || '') + '</div></div><span class="chevron">›</span></a>';
  }
  // Vedertagen förkortning (SkolL, DelgF, HB), om författningen har en.
  const abbrOf=l=>(l.aliases||[]).find(a=>/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö]{1,5}$/.test(a))||'';
  function lawSub(law){
    return (law.type==='förordning'?'Förordning':'Lag')+(abbrOf(law)?' · '+abbrOf(law):'')+' · SFS '+law.sfs;
  }
  function lawRow(law) {
    return listRow(law.name, lawSub(law), urlFor(law.sfs),law.sfs);
  }
  function footer() {
    return '<div class="footer-meta">Källa: riksdagen.se (öppna data). Lagboken är en fristående tjänst och ersätter inte kontroll av officiella författningar. Uppgifter om gällande lydelse och ikraftträdande måste alltid kontrolleras mot originalkällan.</div>';
  }
  function badgeMark(id) {return pref.favourites.includes(id) ? '★' : '☆';}
  function addRecent(target) {
    const sfs=target.split('|')[0];
    if(pref.recents[0]!==target)pref.usage[sfs]=(pref.usage[sfs]||0)+1;
    pref.recents = [target].concat(pref.recents.filter(t=>t!==target)).slice(0,15);
    savePrefs();
  }
  function favToggle(target) {
    if(pref.favourites.includes(target)) pref.favourites=pref.favourites.filter(f=>f!==target);
    else{
      pref.favourites.unshift(target);
      // Lagar med favoriter bevakas automatiskt.
      const sfs=target.split('|')[0];
      if(!pref.watch[sfs])loadLaw(sfs).then(doc=>{pref.watch[sfs]=Object.assign(lawModel.snapshot(doc),{at:lawModel.today()});savePrefs();}).catch(()=>{});
    }
    savePrefs();
    const position=view.scrollTop;
    Promise.resolve(render(false,true)).then(()=>{view.scrollTop=position;
      if(pref.favourites.includes(target))$$('[data-action="fav"]').filter(b=>b.dataset.key===target).forEach(b=>b.classList.add('pop'));});
    toast(pref.favourites.includes(target)?'Sparad i favoriter':'Borttagen från favoriter');
  }
  function favTitle(target) {
    const [id,cap,para] = target.split('|'); const meta=lawById(id);
    if (!meta) return target;
    return meta.name + (cap ? ' · ' + placeLabel(id,cap,para) : '');
  }
  function favRoute(target) {
    const [id,cap,para] = target.split('|');
    return urlFor(id,cap,para);
  }
  function home() {
    const recent = pref.recents.filter(x=>lawById(x.split('|')[0])).slice(0,4);
    const favs = pref.favourites.filter(x=>lawById(x.split('|')[0])).slice(0,6);
    return '<div class="page"><h1 class="page-title">Lagboken</h1><p class="intro">Svensk lagstiftning, snabbt och enkelt.</p>' +
      searchBox('Sök lag, paragraf eller ämne') +
      '<div id="home-results"></div>' +
      '<div class="section-title">Senast öppnade</div><div class="card-list">' +
      (recent.length?recent.map(id=>listRow(favTitle(id),'Fortsätt läsa',favRoute(id))).join(''):
        '<div class="empty">De lagrum du läser kommer att visas här.</div>') +
      '</div><div class="section-title">Favoriter <a href="#/saved" data-link="1">Visa alla</a></div><div class="card-list">' +
      (favs.length?favs.map(id=>listRow(favTitle(id),'Sparat lagrum',favRoute(id))).join(''):
        '<div class="empty">Tryck på stjärnan vid ett lagrum för att spara det.</div>') +
      '</div><div class="section-title">Lagbok</div><div class="card-list">' +
      state.catalog.slice(0,5).map(lawRow).join('') +
      '</div><p class="small muted" style="margin-top:17px"><a href="#/catalog" data-link="1">Alla författningar</a></p>' + footer() + '</div>';
  }
  // Katalogen följer Sveriges Rikes Lag: grundlagar, balkarna med anslutande författningar, övriga områden.
  // Anslutande författningar hänger under sin balk som grenar i ett träd; balken själv är en vanlig rad.
  function childRow(law,last,deep){
    return '<a class="tree-row'+(last?' last':'')+(deep?' deep':'')+'" href="'+attr(urlFor(law.sfs))+'" data-link="1"><span class="tree-branch" aria-hidden="true"></span>'+
      '<span class="grow"><span class="tree-title">'+html(law.name)+'</span><span class="tree-sub">'+html(lawSub(law))+'</span></span><span class="chevron">›</span></a>';
  }
  function readTarget(sfs){
    const pos=pref.readPos[sfs];if(!pos)return null;
    return {url:urlFor(sfs,pos.chapter,pos.para?searchCore.paraKey(pos.para):null),label:placeLabel(sfs,pos.chapter,pos.para)};
  }
  // Genvägar till de författningar man öppnar oftast.
  function shortcuts(){
    // Favoriterna ersätter de automatiska genvägarna när man har valt egna.
    if(pref.favourites.some(t=>t.split('|').length<=2&&lawById(t.split('|')[0])))return '';
    const used=Object.entries(pref.usage).filter(([s])=>lawById(s)).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([s])=>lawById(s));
    if(used.length<2)return '';
    const abbr=abbrOf;
    return '<div class="section-title">Mina genvägar</div><div class="shortcut-grid">'+used.map(l=>'<a class="shortcut" data-link="1" href="'+attr(urlFor(l.sfs))+'">'+
      (abbr(l)?'<b>'+html(abbr(l))+'</b>':'')+'<span>'+html(l.name)+'</span></a>').join('')+'</div>';
  }
  function continueRow(){
    const sfs=pref.lastRead,meta=sfs&&lawById(sfs),t=meta&&readTarget(sfs);
    if(!t)return '';
    return '<a class="continue-row" data-link="1" href="'+attr(t.url)+'"><span class="continue-icon" aria-hidden="true">↻</span><div class="grow"><div class="row-title">Fortsätt läsa</div>'+
      '<div class="row-sub">'+html(meta.name)+(t.label?' · '+html(t.label):'')+'</div></div><span class="chevron">›</span></a>';
  }
  // Katalogen följer Sveriges Rikes Lag. Avdelningarna fälls ihop och fylls först när de öppnas,
  // så att nästan 2 000 författningar inte behöver ritas vid start.
  // Träd i katalogen: balk → anslutande lagar → deras förordningar, och lag → förordningar.
  // Byggs en gång per katalog i stället för att söka igenom alla författningar för varje rad.
  let treeCache=null;
  function tree(){
    if(treeCache&&treeCache.catalog===state.catalog)return treeCache;
    const kids=new Map(),regs=new Map(),bySfs=new Map(state.catalog.map(l=>[l.sfs,l]));
    for(const l of state.catalog){
      if(l.parent&&bySfs.has(l.parent)){if(!kids.has(l.parent))kids.set(l.parent,[]);kids.get(l.parent).push(l);}
      const a=l.anchor&&bySfs.get(l.anchor);
      if(a&&!l.parent&&a.section===l.section){if(!regs.has(l.anchor))regs.set(l.anchor,[]);regs.get(l.anchor).push(l);}
    }
    return treeCache={catalog:state.catalog,kids,regs,bySfs};
  }
  function isNested(l){const t=tree();return (l.parent&&t.bySfs.has(l.parent))||t.regs.has(l.anchor)&&t.regs.get(l.anchor).includes(l);}
  function sectionRows(sec,asList){
    const t=tree();
    const rows=state.catalog.filter(l=>(!sec.id||l.section===sec.id)&&!isNested(l)).map(law=>{
      const kids=t.kids.get(law.sfs)||[],regs=t.regs.get(law.sfs)||[];
      if(!kids.length&&!regs.length)return '<div class="law-block">'+lawRow(law)+'</div>';
      const rows=[];
      for(const k of kids){rows.push([k,false]);for(const r of t.regs.get(k.sfs)||[])rows.push([r,true]);}
      for(const r of regs)rows.push([r,false]);
      const counts=[kids.length?kids.length+' anslutande':'',regs.length?regs.length+(regs.length===1?' förordning':' förordningar'):''].filter(Boolean).join(' · ');
      // Långa förordningslistor (t.ex. årliga beloppsförordningar) visar de första och resten på begäran.
      const LIMIT=8,shown=rows.length>LIMIT+2?rows.slice(0,LIMIT):rows,hidden=rows.slice(shown.length);
      const more=hidden.length?'<details class="tree-more"><summary class="tree-row last"><span class="tree-branch" aria-hidden="true"></span><span class="grow"><span class="tree-title">Visa '+hidden.length+' till</span></span></summary>'+
        hidden.map(([l,deep],i)=>childRow(l,i===hidden.length-1,deep)).join('')+'</details>':'';
      return '<div class="law-block">'+listRow(law.name,lawSub(law)+' · '+counts,urlFor(law.sfs),law.sfs).replace('class="list-row"','class="list-row has-tree"')+
        '<div class="law-tree" role="group" aria-label="Anslutande författningar till '+attr(law.name)+'">'+shown.map(([l,deep],i)=>childRow(l,!hidden.length&&i===shown.length-1,deep)).join('')+more+'</div></div>';
    });
    return asList?rows:rows.join('');
  }
  function catalogSections(){
    const sections=state.sections.length?state.sections:[{id:'',name:'Författningar'}];
    const count=id=>state.catalog.filter(l=>!id||l.section===id).length;
    const open=new Set(pref.openSections||[]);
    // Överst: dina favoriter, registret och Nytt i lagen. Avdelningarna finns i listan nedanför.
    const news='<a class="chip" href="#/nytt" data-link="1">Nytt i lagen'+(unseenNews()?' <span class="dot" aria-label="nytt"></span>':'')+'</a>';
    return favChips()+'<nav class="section-index" aria-label="Genvägar"><a class="chip" href="#/register" data-link="1">Register A–Ö</a>'+news+'</nav>'+
      (pref.favourites.length?'':'<p class="fav-hint small muted">Tryck ☆ vid en lag eller ett kapitel så hamnar den här överst.</p>')+
      sections.map(sec=>sectionBlock(sec,count,open)).join('');
  }
  function sectionBlock(sec,count,open){
    const n=count(sec.id);if(!n)return '';
    const isOpen=open.has(sec.id);
    return '<details class="cat-section" id="sec-'+attr(sec.id)+'" data-section="'+attr(sec.id)+'"'+(isOpen?' open':'')+'><summary class="cat-summary"><span class="cat-name">'+html(sec.name)+'</span><span class="cat-count">'+n+'</span></summary>'+
      '<div class="card-list">'+(isOpen?sectionRows(sec):'')+'</div></details>';
  }
  // Favoriter (lagar och kapitel) som genvägar överst i katalogen, i den ordning man själv valt.
  function favLabel(target){
    const [id,cap]=target.split('|'),meta=lawById(id);if(!meta)return '';
    const short=abbrOf(meta)||meta.name.replace(/^(Lagen|Förordningen) (om|med) /,'').replace(/^./,c=>c.toUpperCase());
    return cap&&cap!=='0'?short+' '+(isArt(id,cap)?chapShort(id,cap):cap+' kap.'):short;
  }
  function favChips(){
    let favs=pref.favourites.filter(t=>t.split('|').length<=2&&lawById(t.split('|')[0]));
    if(!favs.length)return '';
    // Mest använda först, tills man själv har ordnat dem.
    if(!pref.favOrdered){const use=t=>pref.usage[t.split('|')[0]]||0;favs=favs.map((t,i)=>[t,i]).sort((a,b)=>use(b[0])-use(a[0])||a[1]-b[1]).map(x=>x[0]);}
    const edit=state.editFavs;
    return '<nav class="fav-row'+(edit?' editing':'')+'" aria-label="Favoriter">'+favs.map((t,i)=>edit?
        '<span class="chip fav-chip"><button type="button" class="fav-move" data-action="fav-move" data-key="'+attr(t)+'" aria-label="Flytta fram"'+(i?'':' disabled')+'>‹</button>'+
        '<span>'+html(favLabel(t))+'</span><button type="button" class="fav-remove" data-action="fav" data-key="'+attr(t)+'" aria-label="Ta bort '+attr(favLabel(t))+'">×</button></span>':
        '<a class="chip fav-chip" href="'+attr(favRoute(t))+'" data-link="1" title="'+attr(favTitle(t))+'"><span class="fav-star-mini" aria-hidden="true">★</span>'+html(favLabel(t))+'</a>').join('')+
      '<button type="button" class="chip chip-quiet" data-action="fav-edit">'+(edit?'Klar':'Ordna')+'</button></nav>';
  }
  function fillSection(details){
    const list=details.querySelector('.card-list'),sec=state.sections.find(x=>x.id===details.dataset.section);
    if(!list||!sec||list.children.length)return;
    // Stora avdelningar ritas i omgångar så att de öppnas direkt.
    const rows=sectionRows(sec,true);
    list.innerHTML=rows.slice(0,40).join('');
    let at=40;const idle=window.requestIdleCallback||(fn=>setTimeout(fn,16));
    const more=()=>{if(at>=rows.length||!list.isConnected)return;list.insertAdjacentHTML('beforeend',rows.slice(at,at+80).join(''));at+=80;idle(more);};
    if(rows.length>40)idle(more);
  }
  // Register A–Ö över alla författningar, som lagbokens register.
  function registerPage(){
    const sorted=state.catalog.slice().sort((a,b)=>a.name.localeCompare(b.name,'sv'));
    const groups=new Map();
    for(const l of sorted){const k=(l.name.replace(/^(Lagen|Förordningen|Kungörelsen) (om|med|angående) /,'').charAt(0)||'#').toUpperCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(l);}
    const letters=[...groups.keys()].sort((a,b)=>a.localeCompare(b,'sv'));
    return '<div class="page"><h1 class="page-title">Register A–Ö</h1><p class="intro">'+state.catalog.length+' författningar, ordnade efter ämnesord. ”Lagen om …” står under ordet efter ”om”.</p>'+
      '<nav class="letter-bar" aria-label="Bokstäver">'+letters.map(k=>'<button type="button" data-action="letter" data-id="'+attr(k)+'">'+html(k)+'</button>').join('')+'</nav>'+
      letters.map(k=>'<div class="section-title" id="letter-'+attr(k)+'">'+html(k)+'</div><div class="card-list register-list">'+
        groups.get(k).map(l=>'<a class="register-row" href="'+attr(urlFor(l.sfs))+'" data-link="1"><span>'+html(l.name)+'</span><small>'+html(abbrOf(l)||l.sfs)+'</small></a>').join('')+'</div>').join('')+footer()+'</div>';
  }
  function catalogPage(){
    return '<div class="page"><div class="catalog-hero"><h1 class="page-title">Hitta lagrum</h1>'+
      '<p class="intro">Sök på författning, juridiskt begrepp eller skriv exempelvis BrB 24:1.</p></div>'+
      searchBox('Sök i lagboken')+
      '<div id="search-results"></div><div id="catalog-directory">'+continueRow()+shortcuts()+catalogSections()+
      '<p class="catalog-meta">'+APP_NAME+' '+APP_VERSION+' · Text från riksdagen.se · <a href="#/about" data-link="1">Om '+APP_NAME+'</a></p>'+
      footer()+'</div></div>';
  }
  function savedPage(){
    const favs = pref.favourites.filter(x=>lawById(x.split('|')[0]));
    const marks=Object.entries(pref.highlights).flatMap(([k,list])=>list.map(h=>({k,h}))).filter(x=>lawById(x.k.split('|')[0]));
    // Ordning: egna markeringar och anteckningar först, bevakning sist.
    return '<div class="page"><h1 class="page-title">Sparat</h1><p class="intro">Dina markeringar, anteckningar, favoriter och samlingar sparas på den här enheten.</p>' +
      '<div class="section-title">Markeringar och anteckningar ('+(marks.length+Object.keys(pref.notes).filter(x=>pref.notes[x]).length)+')</div>'+
      '<div class="marks-tools"><div class="searchbox small-search">'+iconSearch()+'<input id="marks-query" type="search" placeholder="Sök i markeringar och anteckningar" value="'+attr(state.marksQuery)+'"></div>'+
      '<div class="chips">'+[['','Alla'],['yellow','Gul'],['green','Grön'],['rose','Rosa'],['note','Anteckningar']].map(([id,label])=>
        '<button type="button" class="chip'+(state.marksFilter===id?' active':'')+'" data-action="marks-filter" data-id="'+id+'">'+(id&&id!=='note'?'<span class="hl-dot hl-'+id+'"></span>':'')+label+'</button>').join('')+'</div></div>'+
      '<div id="marks-list">'+marksHtml()+'</div>'+
      '<div class="section-title">Favoriter ('+favs.length+')</div><div class="card-list">' +
      (favs.length?favs.map(id=>listRow(favTitle(id),'',favRoute(id),'★')).join(''):'<div class="empty">Inga sparade lagrum ännu.</div>') +'</div>'+
      '<div class="section-title">Samlingar ('+pref.collections.length+')</div><div class="card-list">'+
      (pref.collections.length?pref.collections.map(c=>listRow(c.name,c.items.length+' paragrafer','#/collection/'+encodeURIComponent(c.id),'▤')).join(''):
        '<div class="empty">Samla paragrafer, t.ex. ”LOB-ingripande”, via paragrafens meny ⋯.</div>')+'</div>'+
      '<div class="section-title">Bevakning <a href="#/upcoming" data-link="1">Alla kommande ändringar</a></div><div id="watch-box">'+watchSummary()+'</div>'+
      '</div>';
  }
  // Markeringar och anteckningar grupperade per författning, med filter på färg och fritext.
  function marksHtml(){
    const q=norm(state.marksQuery),f=state.marksFilter,items=[];
    for(const [k,list] of Object.entries(pref.highlights))for(const h of list)items.push({k,color:h.color,quote:h.quote,note:h.note||''});
    for(const [k,n] of Object.entries(pref.notes))if(n)items.push({k,color:'note',quote:'',note:n});
    const shown=items.filter(x=>lawById(x.k.split('|')[0])&&(!f||x.color===f||(f==='note'&&x.note))&&(!q||norm(x.quote+' '+x.note+' '+favTitle(x.k)).includes(q)));
    if(!shown.length)return '<div class="empty">'+(items.length?'Inget matchar filtret.':'Markera text i en paragraf eller skriv en anteckning så samlas de här.')+'</div>';
    const groups=new Map();
    for(const x of shown){const s=x.k.split('|')[0];if(!groups.has(s))groups.set(s,[]);groups.get(s).push(x);}
    const order=sfs=>state.catalog.findIndex(l=>l.sfs===sfs);
    return [...groups].sort((a,b)=>order(a[0])-order(b[0])).map(([sfs,list])=>'<div class="marks-group"><div class="marks-law">'+html(lawById(sfs).name)+'</div><div class="card-list">'+
      list.map(x=>'<a class="list-row" data-link="1" href="'+attr(favRoute(x.k))+'">'+(x.color==='note'?'<span class="note-dot">✎</span>':'<span class="hl-dot hl-'+attr(x.color)+'"></span>')+
        '<div class="grow"><div class="row-title">'+html(shortRef(...x.k.split('|')))+'</div>'+
        (x.quote?'<div class="row-sub">”'+html(x.quote.slice(0,140))+'”</div>':'')+(x.note?'<div class="row-sub note-text">'+html(x.note.slice(0,160))+'</div>':'')+
        '</div><span class="chevron">›</span></a>').join('')+'</div></div>').join('');
  }
  function fapPage(){
    const query=norm(state.query),items=state.fap.filter(f=>!query||norm([f.id,f.name,f.code,(f.tags||[]).join(' ')].join(' ')).includes(query));
    return '<div class="page"><span class="source-label">Polismyndigheten</span><h1 class="page-title">Polisens FAP</h1>'+
      '<p class="intro">Öppna en föreskrift i appens dokumentläsare. Originalet visas som PDF från Polismyndigheten och kräver internetanslutning.</p>'+
      '<div class="searchbox">'+iconSearch()+'<input id="fap-query" type="search" enterkeyhint="search" autocomplete="off" placeholder="Sök OC, batong, FAP 104-4…" value="'+attr(state.query)+'"></div>'+
      '<div id="fap-results" class="card-list">'+fapResults(items)+'</div>'+footer()+'</div>';
  }
  function fapResults(items){
    return items.length?items.map(f=>listRow(f.name, f.id+' · '+(f.code||'')+(f.pdfVersion?' · '+f.pdfVersion:''),'#/fap/'+encodeURIComponent(f.id),f.id)).join(''):
      '<div class="empty">Ingen föreskrift matchade sökningen.</div>';
  }
  function fapReader(id){
    const f=state.fap.find(x=>x.id===id);
    if(!f)return '<div class="page"><div class="empty">Föreskriften hittades inte.</div></div>';
    return '<div class="page"><span class="source-label">'+html(f.id)+' · '+html(f.code||'')+'</span><h1 class="page-title">'+html(f.name)+'</h1>'+
      '<p class="intro">'+html(f.pdfVersion||'Originalföreskrift')+'. PDF levereras från Polismyndigheten. Sammanställda versioner är endast avsedda som information; kontrollera alltid officiell gällande lydelse.</p>'+
      '<a class="button primary fap-open" href="'+attr(f.pdfUrl||f.url)+'" target="_blank" rel="noopener noreferrer">Öppna original-PDF separat ↗</a>'+
      (f.pdfUrl?'<div class="fap-viewer"><iframe class="fap-frame" title="'+attr(f.id+' — '+f.name)+'" loading="lazy" src="'+attr(f.pdfUrl)+'"></iframe></div>'+
      '<p class="small muted">'+(DESKTOP?'Om dokumentet inte visas här, använd knappen ovan.':'Om dokumentet inte visas i din iPhone-webbläsare, använd knappen ovan.')+' PDF-innehållet ingår inte i appens fritextindex.</p>':
      '<div class="notice">Ingen verifierad direktlänk till PDF finns för denna föreskrift.</div>')+
      '<div class="footer-meta">Källa: <a target="_blank" rel="noopener noreferrer" href="'+attr(f.url)+'">Polismyndighetens författningssamling ↗</a></div></div>';
  }
  async function loadLaw(id) {
    if(state.laws.has(id)) return state.laws.get(id);
    if(state.loading.has(id)) return state.loading.get(id);
    // Lagtexten och hänvisningarna hit hämtas samtidigt.
    const back=fetchJson('data/index/backlinks/'+sfsFile(id)+'.json').catch(()=>({}));
    const promise=fetch('data/laws/'+sfsFile(id)+'.json',{cache:'no-store'}).then(async res=>{
      if(!res.ok) throw new Error('Författningstext ännu inte importerad');
      const data = await res.json();
      if(!Array.isArray(data.chapters)||!data.chapters.length) throw new Error('Ofullständigt dataformat');
      tocModel.registerDoc(id,data);
      state.backlinks.set(id,await back);
      state.laws.set(id,data); return data;
    }).finally(()=>state.loading.delete(id));
    state.loading.set(id,promise); return promise;
  }
  // Riksdagen anger en senare ändring än den som finns inarbetad i den publicerade texten.
  // Texten är uppdaterad till och med den ändring som riksdagen.se anger ("Ändrad: t.o.m. SFS …"); någon
  // varning om halvfärdig text behövs inte. Funktionen finns kvar för anrop från äldre vyer.
  function gapNotice(){return '';}
  function hasRealChapters(data){return data.chapters.length>1||data.chapters[0].number!=='0';}
  function docIntro(meta,data){
    const n=data.chapters.reduce((total,ch)=>total+(ch.items||[]).filter(i=>i.type==='para').length,0);
    return '<div class="law-head"><span class="source-label">'+html(lawSub(meta))+'</span>'+
      '<h1>'+html(data.title||meta.name)+'</h1><p>'+data.chapters.length+' kapitel/avsnitt · '+n+(data.chapters.some(c=>c.unit==='artikel')?' paragrafer och artiklar':' paragrafer')+' · Kontrollerad mot riksdagen.se '+html(lawModel.formatDate((data.fetchedAt||'').substring(0,10))||'okänt datum')+
      ((data.amendedTo||data.latestAmendment)?' · Ändrad t.o.m. SFS '+html(data.amendedTo||data.latestAmendment):'')+'</p>'+
      '<div class="actions"><button type="button" class="button" data-action="fav" data-key="'+attr(meta.sfs)+'">'+badgeMark(meta.sfs)+' Spara</button>'+
      '<button type="button" class="button'+(pref.watch[meta.sfs]?' active':'')+'" data-action="watch" data-key="'+attr(meta.sfs)+'">'+(pref.watch[meta.sfs]?'◉ Bevakas':'○ Bevaka ändringar')+'</button>'+
      '<a class="button" href="'+attr(sourceUrl(meta.sfs))+'" target="_blank" rel="noopener noreferrer">Officiell källa ↗</a></div>'+
      (readTarget(meta.sfs)&&readTarget(meta.sfs).label?'<a class="continue-row compact" data-link="1" href="'+attr(readTarget(meta.sfs).url)+'"><span class="continue-icon" aria-hidden="true">↻</span><div class="grow"><div class="row-title">Fortsätt där du var</div><div class="row-sub">'+html(readTarget(meta.sfs).label)+'</div></div><span class="chevron">›</span></a>':'')+
      futureNotice(data)+repealNotice(data)+preambleHtml(data)+lawRelations(meta)+
      '<p class="small muted">Appen visar den lydelse som gäller i dag enligt källans markeringar. Kommande lydelser visas under respektive paragraf. Kontrollera alltid mot Svensk författningssamling vid rättslig användning.</p></div>';
  }
  // Hela författningen träder i kraft senare (t.ex. elmarknadslagen 2027-01-01): den gäller inte i dag.
  function futureNotice(data){
    const f=data&&data.inForce;if(!f||(f.date&&f.date<=lawModel.today()))return '';
    return '<div class="notice future-notice">Författningen träder i kraft '+html(f.date?lawModel.formatDate(f.date):f.label)+'. Den gäller inte i dag.</div>';
  }
  function preambleHtml(data){return data&&data.preamble?'<p class="preamble">'+html(data.preamble).replace(/\n\n/g,'<br>')+'</p>':'';}
  function repealNotice(data){
    return data&&data.repealAt?'<div class="notice repeal-notice">Författningen upphör att gälla '+html(lawModel.formatDate(data.repealAt))+' enligt riksdagen.se.</div>':'';
  }
  // Förordningar som ansluter till lagen, eller lagen som förordningen ansluter till.
  // Kopplingar på lagnivå visas som en diskret rad; listan öppnas i en meny.
  function relatedRegs(meta){
    const r=state.relations[meta.sfs]||{},seen=new Set();
    return state.catalog.filter(l=>l.anchor===meta.sfs).concat((r.kompletteras||[]).map(lawById).filter(Boolean))
      .filter(l=>l.sfs!==meta.sfs&&!seen.has(l.sfs)&&seen.add(l.sfs));
  }
  function lawRelations(meta){
    const r=state.relations[meta.sfs]||{},regs=relatedRegs(meta);
    const up=meta.anchor&&lawById(meta.anchor)||(r.kompletterar||[]).map(lawById).filter(Boolean)[0]||(meta.parent&&lawById(meta.parent));
    const rows=[];
    if(regs.length)rows.push('<button type="button" class="relation-row" data-action="show-regs" data-key="'+attr(meta.sfs)+'">'+regs.length+(regs.length===1?' anslutande förordning':' anslutande förordningar')+' <span aria-hidden="true">›</span></button>');
    if(up)rows.push('<a class="relation-row" data-link="1" href="'+attr(urlFor(up.sfs))+'">'+(meta.type==='förordning'?'Kompletterar ':'Ansluter till ')+html(up.name)+' <span aria-hidden="true">›</span></a>');
    return rows.length?'<div class="relations">'+rows.join('')+'</div>':'';
  }
  function showRegs(sfs){
    const meta=lawById(sfs);if(!meta)return;
    const regs=relatedRegs(meta),instr=regs.filter(l=>l.section==='instruktioner'||/instruktion/i.test(l.name)),other=regs.filter(l=>!instr.includes(l));
    const list=ls=>'<div class="card-list">'+ls.map(l=>'<a class="list-row" data-link="1" href="'+attr(urlFor(l.sfs))+'"><div class="grow"><div class="row-title">'+html(l.name)+'</div><div class="row-sub">'+html(lawSub(l))+'</div></div><span class="chevron">›</span></a>').join('')+'</div>';
    showSheet('<div class="sheet-title">Anslutande förordningar <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">Förordningar som kompletterar '+html(meta.name)+'.</p>'+
      (other.length?list(other):'')+(instr.length?'<div class="section-title">Myndigheternas instruktioner</div>'+list(instr):''));
  }
  // Bilagor (t.ex. konventionstext) visas först när de fälls ut, eftersom de kan vara mycket långa.
  function appendixHtml(data){
    // Är bilagan en konvention som redan finns i lagen artikel för artikel visas inte råtexten (med flera språk).
    if(!data.appendix||data.chapters.some(c=>c.unit==='artikel'))return '';
    return '<details class="transitions appendix" data-appendix="1"><summary>Bilaga <span>'+Math.round(data.appendix.length/1000)+' 000 tecken</span></summary><div class="appendix-body"></div></details>';
  }
  function transitionsHtml(meta,data){
    const list=data.transitions||[];if(!list.length)return '';
    const ch={number:'0'};
    return '<details class="transitions"><summary>Övergångsbestämmelser <span>'+list.length+(list.length===1?' författning':' ändringsförfattningar')+'</span></summary>'+
      '<p class="small muted">Ikraftträdande- och övergångsbestämmelser för lagen och dess ändringar, nyast först.</p>'+
      list.slice().reverse().map(t=>'<div class="transition"><div class="transition-sfs">'+(t.sfs?'SFS '+html(t.sfs):'Ursprunglig lydelse')+'</div>'+
        '<div class="paragraph-content">'+textHtml(t.text,meta,ch)+'</div></div>').join('')+'</details>';
  }
  function chapterList(meta,data){
    // Stora lagar (t.ex. socialförsäkringsbalken) får ett rutnät med kapitelnummer för snabba hopp.
    const grid=data.chapters.length>=20?'<div class="chapter-jump" aria-label="Hoppa till kapitel">'+data.chapters.map(ch=>
      '<a data-link="1" href="'+attr(urlFor(meta.sfs,ch.number))+'" title="'+attr(ch.title||'')+'">'+html(ch.number)+'</a>').join('')+'</div>':'';
    return docIntro(meta,data)+
      '<div class="chapter-list">'+(grid?'<div class="section-title">Hoppa till kapitel</div>'+grid:'')+'<div class="section-title">Välj kapitel</div><div class="card-list chapters-grid">'+
      data.chapters.map(ch=>{
        // Avdelningar ("Andra avdelningen – Om brotten") delar upp kapitellistan.
        const division=ch.division?'</div><div class="section-title division-title">'+html(ch.division)+'</div><div class="card-list chapters-grid">':'';
        const paras=(ch.items||[]).filter(i=>i.type==='para');
        const label=ch.unit==='artikel'?(ch.title||'Bilaga'):(ch.number==='0'?'Bestämmelser':ch.number+' kap.')+(ch.title?' · '+ch.title:'');
        const groups=tocModel.chapterGroups(meta.sfs,ch).filter(g=>g.origin!=='kapitel');
        const unit=ch.unit==='artikel'?' artiklar':' paragrafer';
        if(groups.length<2)return division+listRow(label,paras.length+unit,urlFor(meta.sfs,ch.number));
        // Kapitel med rubriker: välj del av kapitlet innan läsningen börjar.
        return division+'<details class="chapter-item"><summary class="list-row"><div class="grow"><div class="row-title">'+html(label)+'</div>'+
          '<div class="row-sub">'+paras.length+unit+' · '+groups.length+' avsnitt</div></div><span class="chevron chapter-toggle" aria-hidden="true">⌄</span></summary>'+
          '<div class="chapter-sections"><a class="chapter-section all" data-link="1" href="'+attr(urlFor(meta.sfs,ch.number))+'">Hela kapitlet<span class="chevron">›</span></a>'+
          groups.map(g=>'<a class="chapter-section" data-link="1" href="'+attr(urlFor(meta.sfs,ch.number,searchCore.paraKey(g.first)))+'">'+
            '<span class="grow">'+(g.parent?'<span class="chapter-section-parent">'+html(g.parent)+'</span>':'')+'<span class="chapter-section-title">'+html(g.title)+'</span></span>'+
            '<span class="chapter-section-range">'+html(range(g,meta.sfs,ch.number))+'</span><span class="chevron">›</span></a>').join('')+
          '</div></details>';
      }).join('')+repealedChapters(data)+'</div>'+transitionsHtml(meta,data)+'</div>';
  }
  // Upphävda kapitel ("11 kap. Har upphävts genom förordning (2026:678).") visas som diskreta rader sist i listan.
  function repealedChapters(data){
    return (data.repealedChapters||[]).map(c=>'<div class="list-row repealed-chapter" aria-disabled="true"><div class="grow"><div class="row-title">'+html(c.number)+' kap.</div><div class="row-sub">'+html(c.title)+'</div></div></div>').join('');
  }
  function range(g,sfs,cap){
    const first=g.paragraphs[0].number,last=g.paragraphs[g.paragraphs.length-1].number;
    if(isArt(sfs,cap))return first===last?'art. '+first:'art. '+first+'–'+last;
    return first===last?first+' §':first+'–'+last+' §§';
  }
  function refExists(id,chapter,paragraph){
    const doc=state.laws.get(id);
    if(!doc)return true; // Ett ännu inte inläst annat lagrum kontrolleras före öppning.
    const ch=doc.chapters.find(c=>String(c.number)===String(chapter));
    if(paragraph==null)return !!ch;
    return !!ch&&(ch.items||[]).some(p=>p.type==='para'&&searchCore.paraKey(p.number)===searchCore.paraKey(paragraph));
  }
  const refLocate=legalLinks.locator(id=>state.laws.get(id));
  // Hänvisningstolken får katalogens namn först när den behövs (eller när appen är ledig efter start).
  let linksReady=false;
  function prepareLinks(){if(!linksReady&&legalLinks.configure){legalLinks.configure(state.catalog);linksReady=true;}}
  function linkify(input,sfs,chapter){
    prepareLinks();
    return legalLinks.linkify(input,{
      unit:isArt(sfs,chapter)?'artikel':'',
      sfs,chapter,anchor:(lawById(sfs)||{}).parent||(lawById(sfs)||{}).anchor,
      exists:refExists,locate:refLocate,
      href:urlFor
    });
  }
  function textHtml(text,meta,ch){
    // "7--9 §§" i källan visas med tankstreck: "7–9 §§".
    const paragraphs=String(text||'').replace(/(\d(?:\s?[a-z])?)\s*--\s*(\d)/g,'$1–$2').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean);
    return paragraphs.map(p=>{
      const ordered=/^(\d{1,2})[.)]\s+([\s\S]*)$/.exec(p);
      if(ordered)return '<div class="legal-item"><span class="legal-item-number">'+html(ordered[1])+'.</span>'+
        '<div class="legal-item-body">'+linkify(ordered[2],meta.sfs,ch.number).replace(/\n/g,'<br>')+'</div></div>';
      return '<p>'+linkify(p,meta.sfs,ch.number).replace(/\n/g,'<br>')+'</p>';
    }).join('');
  }
  // Ändringsförfattning med länkar till förarbetena (proposition och betänkande) när de är kända.
  function amended(v){
    if(!v||!v.amendedBy)return '';
    const year=v.amendedBy.slice(0,4),shard=state.forarbeten.get(year);
    if(shard===undefined)loadForarbeten(year);
    const f=shard&&shard[v.amendedBy],doc=id=>'https://data.riksdagen.se/dokument/'+encodeURIComponent(id)+'.html';
    const links=f?(f[0]?' · <a class="prep" href="'+attr(doc(f[1]))+'" target="_blank" rel="noopener" title="Proposition '+attr(f[0])+'">prop.</a>':'')+(f[2]?' · <a class="prep" href="'+attr(doc(f[3]))+'" target="_blank" rel="noopener" title="Betänkande '+attr(f[2])+'">bet.</a>':''):'';
    return '<p class="amended">Ändrad genom SFS '+html(v.amendedBy)+links+'</p>';
  }
  function loadForarbeten(year){
    state.forarbeten.set(year,null);
    fetchJson('data/index/forarbeten/'+year+'.json').then(d=>{state.forarbeten.set(year,d);if(route().page==='law')renderKeep();}).catch(()=>state.forarbeten.set(year,{}));
  }
  function paraHtml(meta,ch,item){
    const key=meta.sfs+'|'+ch.number+'|'+item.number;
    const anchor=' id="p-'+attr(searchCore.paraKey(item.number))+'" data-paragraph="'+attr(item.number)+'"';
    if(item.repealed)return '<article class="paragraph reader-block repealed"'+anchor+' aria-label="'+attr(numLabel(meta.sfs,item.number,ch.number)+' upphävd')+'"><span class="paragraph-num">'+html(numLabel(meta.sfs,item.number,ch.number))+'</span>'+
      '<span class="repealed-text">'+html(item.text)+'</span></article>';
    const resolved=lawModel.resolve(withHistory(meta.sfs,ch.number,item),state.atDate||undefined),current=resolved.current;
    // Lydelse vid ett valt datum: markera var den skiljer sig från i dag.
    const todayText=state.atDate?lawModel.resolve(item).current.text:null;
    const dateNote=state.atDate&&todayText!==current.text?'<div class="lydelse-status dated">Lydelsen '+html(lawModel.formatDate(state.atDate))+' skiljer sig från i dag</div>'+
      '<details class="lydelse"><summary>Visa ändringen fram till i dag</summary><div class="paragraph-content diff">'+diffHtml(current.text,todayText)+'</div></details>':'';
    // Paragrafrubriken visas inte när den är samma som avsnittsrubriken direkt ovanför.
    const idx=(ch.items||[]).indexOf(item),prevItem=idx>0?ch.items[idx-1]:null;
    const rawTitle=tocModel.curatedTitle(meta.sfs,ch.number,item.number);
    const title=rawTitle&&prevItem&&prevItem.type==='heading'&&prevItem.text.trim().toLowerCase()===rawTitle.trim().toLowerCase()?'':rawTitle;
    const status=resolved.pending?'<div class="lydelse-status upcoming">'+html(lawModel.describe(current))+'</div>':
      current.expires?'<div class="lydelse-status">'+html(lawModel.describe(current))+'</div>':'';
    const others=resolved.others.map(v=>'<details class="lydelse"><summary>'+html(lawModel.describe(v))+'</summary>'+
      (v.status==='upcoming'&&!resolved.pending?'<div class="diff-legend"><span class="diff-del">struket</span> tas bort · <span class="diff-ins">understruket</span> är nytt</div>'+
        '<div class="paragraph-content diff">'+diffHtml(current.text,v.text)+'</div>'+
        '<details class="plain-version"><summary>Visa ny lydelse utan markeringar</summary><div class="paragraph-content">'+textHtml(v.text,meta,ch)+'</div></details>':
        '<div class="paragraph-content">'+textHtml(v.text,meta,ch)+'</div>')+amended(v)+'</details>').join('');
    const back=(state.backlinks.get(meta.sfs)||{})[ch.number+'|'+searchCore.paraKey(item.number)]||[];
    return '<article class="paragraph reader-block'+(resolved.pending?' pending-para':'')+'" data-key="'+attr(key)+'"'+anchor+' aria-label="'+attr(numLabel(meta.sfs,item.number,ch.number)+(title?' '+title:''))+'">'+
      '<header class="paragraph-header">'+
      '<button type="button" class="paragraph-heading-button" data-action="para-menu" data-key="'+attr(key)+'" aria-label="'+attr(numLabel(meta.sfs,item.number,ch.number))+' – meny">'+
      (item.unnumbered?'<span class="paragraph-num unnumbered">Lagtext</span>':'<span class="paragraph-num'+(ch.unit==='artikel'?' article-num':'')+'">'+html(numLabel(meta.sfs,item.number,ch.number))+'</span>')+(title?'<span class="paragraph-title">'+html(title)+'</span>':'')+'</button>'+
      '<button type="button" class="para-menu-button" data-action="para-menu" data-key="'+attr(key)+'" aria-label="Meny för '+attr(numLabel(meta.sfs,item.number,ch.number))+': kopiera, dela, spara, samla eller anteckna">⋯</button>'+
      '</header>'+status+dateNote+'<div class="paragraph-content">'+textHtml(current.text,meta,ch)+'</div>'+amended(current)+others+
      linksRow(key,back)+noteHtml(key)+'</article>';
  }
  // Kopplingar under paragrafen: kompletterande föreskrifter, vad den kompletterar och hänvisningar hit.
  function linkLabel(list){
    const names=list.slice(0,3).map(([s,c,n])=>shortRef(s,c,n));
    return names.join(', ')+(list.length>3?' +'+(list.length-3):'');
  }
  // "2 förordningar": antal författningar som kompletterar paragrafen; namnen visas när chippet öppnas.
  function countLabel(list){
    const ids=[...new Set(list.map(e=>e[0]))],all=ids.every(id=>(lawById(id)||{}).type==='förordning');
    return ids.length+' '+(all?(ids.length===1?'förordning':'förordningar'):(ids.length===1?'författning':'författningar'));
  }
  function linksRow(key,back){
    if(!back.length)return '';
    const reg=back.filter(e=>e[3]==='föreskrift'),comp=back.filter(e=>e[3]==='kompletterar'),refs=back.filter(e=>!e[3]||e[3]==='ref');
    return '<div class="links-row">'+
      (reg.length?'<button type="button" class="link-chip regulation" data-action="backlinks" data-key="'+attr(key)+'">§ Kompletteras av '+html(countLabel(reg))+'</button>':'')+
      (comp.length?'<button type="button" class="link-chip complements" data-action="backlinks" data-key="'+attr(key)+'">↗\uFE0E Kompletterar '+html(linkLabel(comp))+'</button>':'')+
      (refs.length?'<button type="button" class="link-chip" data-action="backlinks" data-key="'+attr(key)+'">'+refs.length+(refs.length===1?' hänvisning':' hänvisningar')+' hit</button>':'')+
      '</div>';
  }
  function noteHtml(key){
    if(state.editingNote===key)return '<div class="note-inline"><textarea class="note-input" data-note-key="'+attr(key)+'" rows="3" placeholder="Skriv en anteckning till paragrafen …">'+html(pref.notes[key]||'')+'</textarea>'+
      '<div class="note-actions"><span class="small muted">Sparas automatiskt</span><button type="button" class="button primary" data-action="note-done" data-key="'+attr(key)+'">Klar</button></div></div>';
    return pref.notes[key]?'<button type="button" class="paragraph-note" data-action="note" data-key="'+attr(key)+'"><span class="note-label">Anteckning</span>'+html(pref.notes[key])+'</button>':'';
  }
  function diffHtml(a,b){
    return lawModel.diffWords(a,b).map(x=>{
      const t=html(x.text).replace(/\n\n+/g,'<br><br>').replace(/\n/g,'<br>');
      return x.type==='same'?t:x.type==='del'?'<del class="diff-del">'+t+'</del>':'<ins class="diff-ins">'+t+'</ins>';
    }).join('');
  }
  // Stjärnan vid rubriken: ett kapitel, eller hela författningen när den saknar kapitel (även förordningar).
  function favStar(key,what){
    const on=pref.favourites.includes(key);
    return '<button type="button" class="fav-star'+(on?' on':'')+'" data-action="fav" data-key="'+attr(key)+'" aria-label="'+(on?'Ta bort '+what+' från favoriter':'Spara '+what+' som favorit')+'">'+(on?'★':'☆')+'</button>';
  }
  // ---------- 0.9: sök i författningen (som "Sök på sidan") ----------
  function findBar(meta){
    const f=state.find;if(!f||f.sfs!==meta.sfs)return '';
    // Sökraden under rubrikraden: ord markeras i lagen och ↑ ↓ hoppar mellan träffarna; växeln byter till hela lagboken.
    // I hela lagboken visas träfflistan här under, utan att lämna lagen.
    const all=f.scope==='all';
    return '<form class="find-bar" id="find-form" role="search"><div class="find-field"><input id="find-input" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" '+
      'placeholder="'+(all?'Sök i hela lagboken':'Sök i '+attr(abbrOf(meta)||meta.name)+' eller skriv 2:1')+'" value="'+attr(f.q)+'" aria-label="'+(all?'Sök i hela lagboken':'Sök i författningen')+'">'+
      '<span class="find-count" id="find-count" aria-live="polite">'+(all?'':findCount())+'</span></div>'+
      (all?'':'<button type="button" class="find-step" data-action="find-prev" aria-label="Föregående träff">↑</button>'+
      '<button type="button" class="find-step" data-action="find-next" aria-label="Nästa träff">↓</button>')+'</form>'+
      '<div class="find-scope" role="group" aria-label="Var du söker"><button type="button" data-action="find-scope" data-scope="law" class="'+(all?'':'on')+'" aria-pressed="'+!all+'">I '+html(meta.name)+'</button>'+
      '<button type="button" data-action="find-scope" data-scope="all" class="'+(all?'on':'')+'" aria-pressed="'+all+'">I hela lagboken</button></div>'+
      (all?'<div class="find-all-results" id="find-all-results"></div>':'');
  }
  function findCount(){
    const f=state.find;if(!f||!f.q.trim())return '';
    if(!f.tokens.length)return '';
    if(!f.hits.length)return 'Inga träffar';
    return f.i>=0?(f.i+1)+' av '+f.hits.length:f.hits.length+(f.hits.length===1?' träff':' träffar');
  }
  function findTokens(q){return window.LagbokIndex?window.LagbokIndex.words(q):norm(q).split(' ').filter(x=>x.length>1);}
  function runFind(q){
    const f=state.find,doc=f&&state.laws.get(f.sfs);if(!doc)return;
    f.q=q;f.tokens=findTokens(q);f.i=-1;f.hits=[];
    if(f.tokens.length){
      const fold=window.LagbokIndex?window.LagbokIndex.fold:norm;
      const res=f.tokens.map(t=>new RegExp('(^|[^a-z0-9])'+t));
      for(const ch of doc.chapters)for(const item of ch.items){
        if(item.type!=='para'||item.repealed)continue;
        const text=fold(lawModel.resolve(item).current.text+' '+(tocModel.curatedTitle(f.sfs,ch.number,item.number)||''));
        if(!res.every(r=>r.test(text)))continue;
        // Varje förekomst i paragraftexten blir ett eget steg för ↑ ↓ (minst ett, om ordet bara finns i rubriken).
        const n=Math.max(1,findRanges(fold(lawModel.resolve(item).current.text),f.tokens).length);
        for(let k=0;k<n;k++)f.hits.push({c:ch.number,p:String(item.number),k});
      }
    }
    const count=$('#find-count');if(count){count.textContent=findCount();bump(count);}
    clearFindMarks();applyFindMarks();
  }
  // Var sökorden förekommer i en (normaliserad) text, i textordning och utan överlapp.
  function findRanges(folded,tokens){
    const ranges=[];
    for(const t of tokens){const re=new RegExp('(^|[^a-z0-9])('+t+'[a-z0-9]*)','g');let x;while((x=re.exec(folded))){const st=x.index+x[1].length;ranges.push([st,st+x[2].length]);}}
    ranges.sort((a,b)=>a[0]-b[0]);
    return ranges.filter((r,i)=>!i||r[0]>=ranges[i-1][1]);
  }
  // Träffen i fokus hamnar mitt på skärmen, så att ordet syns även långt ned i en lång paragraf.
  function scrollToFocus(){
    const el=$('mark.find-focus')||$('.paragraph.find-current');
    if(el&&el.scrollIntoView)el.scrollIntoView({block:'center',behavior:'smooth'});
  }
  function bump(el){if(!el.classList||!el.classList.remove)return;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}
  function stepFind(dir){
    const f=state.find;if(!f||!f.hits.length)return;
    f.i=(f.i+dir+f.hits.length)%f.hits.length;
    const h=f.hits[f.i],r=route();
    const count=$('#find-count');if(count){count.textContent=findCount();bump(count);}
    const input=$('#find-input');if(input)input.blur();
    if(String(r.chapter)===String(h.c)){
      clearFindMarks();applyFindMarks();scrollToFocus();
    }else{f.scrollPending=true;state.navDir='none';navigate(urlFor(f.sfs,h.c,searchCore.paraKey(h.p)),true);}
  }
  function clearFindMarks(){
    $$('mark.find-hit').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);m.remove();p.normalize&&p.normalize();});
    $$('.paragraph.find-current').forEach(a=>a.classList.remove('find-current'));
    $$('mark.find-focus').forEach(m=>m.classList.remove('find-focus'));
  }
  // Markerar sökorden i de träffar som syns i det öppna kapitlet; aktuell träff får en tydligare ram.
  function applyFindMarks(){
    const f=state.find,r=route();
    if(!f||!f.tokens.length||!f.hits.length||r.sfs!==f.sfs||typeof view.querySelector!=='function'||!highlights)return;
    const fold=window.LagbokIndex.fold;
    const done=new Set(),current=f.i>=0?f.hits[f.i]:null;
    f.hits.forEach(h=>{
      if(String(h.c)!==String(r.chapter)||done.has(h.p))return;done.add(h.p);
      const article=$('#p-'+CSS.escape(searchCore.paraKey(h.p)));
      const content=article&&article.querySelector(':scope > .paragraph-content');if(!content)return;
      findRanges(fold(content.textContent),f.tokens).reverse().forEach(([st,en])=>highlights.wrap(content,st,en,()=>{const m=document.createElement('mark');m.className='find-hit';return m;}));
      // Den förekomst som pilarna står på får en egen, tydligare markering.
      if(current&&current.p===h.p&&String(current.c)===String(r.chapter)){
        article.classList.add('find-current');
        const marks=content.querySelectorAll('mark.find-hit');
        if(marks.length)marks[Math.min(current.k||0,marks.length-1)].classList.add('find-focus');
      }
    });
  }
  // Rubrikraden i en lag: namn och var man är, sedan ⌕ (sök i lagen), ✎ (penna), ☷ (innehåll) och ⋯.
  function syncLawTools(r,meta){
    r=r||route();meta=meta||lawById(r.sfs);
    const inLaw=r.page==='law'&&!!meta,set=(sel,fn)=>{const e=$(sel);if(e)fn(e);};
    set('#find-button',e=>{e.hidden=!inLaw;const on=!!(inLaw&&state.find&&state.find.sfs===meta.sfs);e.classList.toggle('on',on);e.setAttribute('aria-pressed',String(on));});
    set('#pen-button',e=>{e.hidden=!inLaw;e.classList.toggle('on',!!state.pen);e.setAttribute('aria-pressed',String(!!state.pen));});
    set('#toc-button',e=>{e.hidden=!inLaw;});
    set('#in-law-search',e=>{e.hidden=inLaw;});
    set('#top-version',e=>{e.hidden=inLaw;});
    set('.topbar',e=>{if(e.classList)e.classList.toggle('law-mode',inLaw);});
    if(!inLaw)return;
    const data=state.laws.get(meta.sfs),ch=data&&r.chapter!=null?data.chapters.find(c=>String(c.number)===String(r.chapter)):null;
    const where=ch&&ch.unit==='artikel'?chapShort(meta.sfs,ch.number):ch&&ch.number!=='0'?ch.number+' kap. '+(ch.title||''):'SFS '+meta.sfs;
    set('#top-title',e=>{e.innerHTML='<span class="tt-name">'+html(meta.name)+'</span><span class="tt-sub">'+html((abbrOf(meta)?abbrOf(meta)+' · ':'')+where)+'</span>';});
  }
  // Sökning i hela lagboken inifrån en lag: samma träffar som på startsidan, i en lista under sökraden.
  function runAll(q){
    const box=$('#find-all-results');if(!box)return;
    if(!q.trim()){box.innerHTML='<p class="small muted">Skriv ett ord, ett lagnamn eller ett lagrum som BrB 24:1.</p>';state.searchEpoch++;return;}
    box.innerHTML=resultsHtml(q);
    const epoch=++state.searchEpoch;
    if(findDirect(q)){const t=$('#text-results');if(t)t.innerHTML='<p class="small muted">Tryck Enter för att öppna lagrummet direkt.</p>';return;}
    setTimeout(()=>{if(state.searchEpoch===epoch)populateTextResults(q,epoch);},220);
  }
  function openFind(){
    const r=route();if(r.page!=='law'||!state.laws.get(r.sfs))return;
    if(!state.find||state.find.sfs!==r.sfs)state.find={sfs:r.sfs,q:'',tokens:[],hits:[],i:-1,scope:'law'};
    renderKeep().then(()=>{const i=$('#find-input');if(i)i.focus();});
  }
  function chapterReader(meta,data,capid){
    const ch=data.chapters.find(c=>String(c.number)===String(capid));
    if(!ch)return '<div class="page"><div class="empty">Kapitlet hittades inte.</div></div>';
    const short=ch.unit==='artikel'?chapShort(meta.sfs,ch.number):ch.number==='0'?'Bestämmelser':ch.number+' kap.';
    const byNumber=new Map((ch.items||[]).filter(i=>i.type==='para').map(i=>[String(i.number),i]));
    let parent=null;
    const content=tocModel.chapterGroups(meta.sfs,ch).map(g=>{
      let head='';
      if(g.parent&&g.parent!==parent)head+='<h2 class="reader-section">'+html(g.parent)+'</h2>';
      parent=g.parent||null;
      if(g.origin!=='kapitel')head+='<h2 class="reader-subhead" id="g-'+attr(searchCore.paraKey(g.first))+'">'+html(g.title)+'</h2>';
      return head+g.paragraphs.map(p=>paraHtml(meta,ch,byNumber.get(p.number))).join('');
    }).join('');
    const index=data.chapters.indexOf(ch),next=data.chapters[index+1];
    // Sök, penna och innehåll sitter i rubrikraden; här visas bara sökraden när den är öppen.
    const context=(state.focus?'<button type="button" class="focus-return" data-action="toggle-focus">Avsluta läsläge</button>':'')+findBar(meta);
    const reader=readerMain(meta,data,ch,content,short,next);
    // Bred layout (stort fönster): innehållet till vänster, lagtexten i mitten, kopplingarna till höger.
    if(isWide()&&!state.focus){wideShown=null;}
    if(isWide()&&!state.focus)return (context?'<div class="reader-context">'+context+'</div>':'')+
      '<div class="wide-law"><nav class="wide-toc" aria-label="Innehåll"><div class="wide-toc-head"><span class="source-label">'+html(meta.name)+'</span></div>'+
        '<div class="toc-results">'+tocEntries(meta,data,route(),'')+'</div></nav>'+reader+
        '<aside class="wide-side" id="wide-side" aria-label="Kopplingar">'+wideSideHtml(meta.sfs,ch.number,state.visibleParagraph||route().paragraph)+'</aside></div>';
    return (context?'<div class="reader-context">'+context+'</div>':'')+reader;
  }
  // Bred layout när fönstret är stort nog (inte i snabbpanelen). html[data-wide] styr stilarna.
  const WIDE=1100;
  function isWide(){return window.innerWidth>=WIDE&&document.documentElement.dataset.panel!=='true';}
  function syncWide(){document.documentElement.dataset.wide=isWide()?'true':'false';}
  syncWide();
  let wideWas=isWide();
  window.addEventListener('resize',()=>{
    syncWide();
    if(isWide()!==wideWas){wideWas=isWide();if(route().page==='law')renderKeep();}
  });
  // Högerspalten: paragrafen man läser, dess kopplingar och anteckning.
  function wideSideHtml(sfs,cap,num){
    const data=state.laws.get(sfs),ch=data&&data.chapters.find(c=>String(c.number)===String(cap));
    const paras=ch?ch.items.filter(i=>i.type==='para'&&!i.repealed):[];
    const item=(num&&paras.find(i=>searchCore.paraKey(i.number)===searchCore.paraKey(num)))||paras[0];
    if(!item)return '';
    const key=sfs+'|'+ch.number+'|'+item.number,title=tocModel.curatedTitle(sfs,ch.number,item.number)||'';
    return '<div class="wide-side-head" data-key="'+attr(key)+'"><span class="source-label">Paragrafen du läser</span>'+
      '<h2>'+html(numLabel(sfs,item.number,ch.number))+'</h2>'+(title?'<p>'+html(title)+'</p>':'')+'</div>'+
      connectionsHtml(sfs,ch.number,item.number)+
      '<div class="section-title">Anteckning</div>'+
      (pref.notes[key]?'<button type="button" class="paragraph-note" data-action="note" data-key="'+attr(key)+'"><span class="note-label">Anteckning</span>'+html(pref.notes[key])+'</button>':
        '<button type="button" class="button" data-action="note" data-key="'+attr(key)+'">Skriv anteckning</button>');
  }
  // När man läser vidare följer innehållet till vänster och högerspalten med.
  let wideShown=null;
  function updateWide(){
    const side=$('#wide-side');if(!side)return;
    const r=route(),num=state.visibleParagraph||r.paragraph,id=r.sfs+'|'+r.chapter+'|'+num;
    if(id===wideShown)return;wideShown=id;
    side.innerHTML=wideSideHtml(r.sfs,r.chapter,num);
    const toc=$('.wide-toc');if(!toc)return;
    $$('.toc-current',toc).forEach(a=>{a.classList.remove('toc-current');a.removeAttribute('aria-current');});
    const here=$$('.toc-current-chapter + .toc-chapter-body .toc-paragraph',toc).find(a=>{const m=/\/([^/]+)$/.exec(a.getAttribute('href')||'');return m&&searchCore.paraKey(decodeURIComponent(m[1]))===searchCore.paraKey(num||'');});
    if(here){here.classList.add('toc-current');here.setAttribute('aria-current','location');
      const box=toc.getBoundingClientRect(),b=here.getBoundingClientRect();if(b.top<box.top+40||b.bottom>box.bottom-20)here.scrollIntoView({block:'center',behavior:'instant'});}
  }
  function readerMain(meta,data,ch,content,short,next){
    return '<main class="law-reader reading-mode-'+html(pref.readingMode)+'">'+
      (state.atDate?'<div class="date-banner" role="status">◷ Visar lydelsen '+html(lawModel.formatDate(state.atDate))+' <button type="button" class="link-button" data-action="date-clear">Visa dagens</button> <button type="button" class="link-button" data-action="date-change">Byt datum</button></div>':'')+
      '<header class="reader-heading">'+(ch.division?'<div class="chapter-number division-label">'+html(ch.division)+'</div>':'')+'<h1>'+html(ch.title||(ch.number==='0'?meta.name:'Kapitel '+ch.number))+
        favStar(ch.number!=='0'?meta.sfs+'|'+ch.number:meta.sfs,ch.number!=='0'?'kapitlet':meta.type==='förordning'?'förordningen':'lagen')+'</h1>'+(hasRealChapters(data)?'':futureNotice(data)+repealNotice(data)+preambleHtml(data)+lawRelations(meta))+'</header>'+
      '<div class="statute-body">'+content+'</div>'+
      '<footer class="reader-end"><span class="small muted">Slut på '+html(ch.number==='0'?meta.name:short).replace(/\.$/,'')+'.</span>'+
      (next?'<a class="reader-next" data-link="1" href="'+attr(urlFor(meta.sfs,next.number))+'"><span class="small muted">Nästa kapitel</span>'+
        '<span>'+html(next.unit==='artikel'?next.title:next.number+' kap. '+(next.title||''))+' ›</span></a>':appendixHtml(data)+transitionsHtml(meta,data))+'</footer></main>';
  }
  function tocHtml(meta,data,needle){
    const here=route(),q=needle||'';
    return '<header class="toc-header"><div class="toc-header-title"><span class="source-label">'+html(meta.name)+'</span>'+
      '<h2>Innehåll</h2><p>Välj kapitel eller paragraf</p></div>'+
      '<button class="icon-button" data-action="close" aria-label="Stäng innehållsförteckning">×</button></header>'+
      '<div class="toc-search"><div class="searchbox">'+iconSearch()+
      '<input id="toc-query" type="search" enterkeyhint="search" autocomplete="off" placeholder="Sök rubrik, kapitel eller paragraf" value="'+attr(q)+'"></div></div>'+
      '<div class="toc-results" id="toc-results">'+tocEntries(meta,data,here,q)+'</div>'+
      '';
  }
  function tocEntries(meta,data,here,needle){
    const q=norm(needle||''),currentPara=state.visibleParagraph||here.paragraph||null;
    const all=[];
    for(const ch of data.chapters){
      const groups=tocModel.chapterGroups(meta.sfs,ch);
      const chapMatch=q&&(norm([ch.number+' kap.',ch.title].join(' ')).includes(q));
      const shownGroups=groups.map(g=>{
        const groupMatch=q&&norm(g.title).includes(q);
        return {...g,paragraphs:(!q||chapMatch||groupMatch)?g.paragraphs:
          g.paragraphs.filter(p=>norm([p.number+' §',p.title,p.excerpt].join(' ')).includes(q))};
      }).filter(g=>g.paragraphs.length);
      if(q&&!shownGroups.length)continue;
      const active=ch.number===here.chapter;
      const expanded=!!q||active||data.chapters.length===1;
      const chapterTitle=ch.unit==='artikel'?(ch.title||meta.name):(ch.number==='0'?meta.name:ch.number+' kap. '+(ch.title||''));
      const rows=shownGroups.map(g=>'<section class="toc-subgroup">'+(g.parent?'<div class="toc-subgroup-parent">'+html(g.parent)+'</div>':'')+
        '<h3 class="toc-subgroup-title"><a data-link="1" href="'+attr(urlFor(meta.sfs,ch.number,searchCore.paraKey(g.first)))+'">'+html(g.title)+'</a></h3>'+
        '<div class="toc-paragraphs">'+g.paragraphs.map(p=>{
          const isCurrent=active&&currentPara&&searchCore.paraKey(currentPara)===searchCore.paraKey(p.number);
          return '<a data-link="1" class="toc-paragraph'+(isCurrent?' toc-current':'')+'"'+
            (isCurrent?' aria-current="location"':'')+
            ' href="'+attr(urlFor(meta.sfs,ch.number,p.number))+'"><span class="toc-paragraph-number">'+html(ch.unit==='artikel'?'Art. '+p.number:/^\d+(?:\.\d+)+$/.test(p.number)?'TB '+p.number:p.number+' §')+'</span>'+
            '<span class="toc-paragraph-title">'+html(p.title)+'</span></a>';
        }).join('')+'</div></section>').join('');
      if(ch.division&&!q)all.push('<div class="toc-division">'+html(ch.division)+'</div>');
      all.push('<details class="toc-chapter" '+(expanded?'open':'')+'>'+
        '<summary class="toc-chapter-summary'+(active?' toc-current-chapter':'')+'"><span class="toc-chapter-heading">'+html(chapterTitle)+
        '</span><span class="toc-chapter-info">'+groups.reduce((n,g)=>n+g.paragraphs.length,0)+(ch.unit==='artikel'?' artiklar':' paragrafer')+'</span>'+
        '<span class="toc-chevron" aria-hidden="true">⌄</span></summary><div class="toc-chapter-body">'+rows+'</div></details>');
    }
    return all.length?all.join(''):'<div class="empty">Inga kapitel eller paragrafer matchar sökningen.</div>';
  }
  function menu() {
    const r=route(),law=r.page==='law'?lawById(r.sfs):null;
    const chapterKey=law&&r.chapter!=null?r.sfs+'|'+r.chapter:null;
    showSheet('<div class="sheet-title">Mer <button class="icon-button" data-action="close">×</button></div>'+
      '<div class="card-list">'+
      (chapterKey?'<button class="list-row sheet-menu-row" type="button" data-action="fav" data-key="'+attr(chapterKey)+'">'+
        '<span class="grow"><span class="row-title">'+(pref.favourites.includes(chapterKey)?'Ta bort sparat kapitel':'Spara kapitel')+'</span></span>☆</button>':'')+
      (law?'<button class="list-row sheet-menu-row" type="button" data-action="source-info">'+
        '<span class="grow"><span class="row-title">Källa och versionsinformation</span><span class="row-sub">'+html(law.name)+'</span></span>›</button>':'')+
      listRow('Inställningar','Läsning, offline och säkerhetskopia','#/settings')+
      listRow('Om '+APP_NAME,'Källa, ansvar och kontakt','#/about')+'</div>'+
      '<p class="small muted menu-version">'+APP_NAME+' '+html(APP_VERSION)+'</p>');
  }
  function sourceInfo(){
    const r=route(),meta=lawById(r.sfs),data=state.laws.get(r.sfs);
    if(!meta||!data)return;
    const number=data.chapters.reduce((acc,c)=>acc+(c.items||[]).filter(x=>x.type==='para').length,0);
    showSheet('<div class="sheet-title">Källa och version <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p>'+html(meta.name)+' (SFS '+html(meta.sfs)+')</p>'+
      '<p class="small muted">'+number+' importerade paragrafer. Hämtad: '+html((data.fetchedAt||'okänt').slice(0,10))+'.</p>'+
      '<div class="notice">Den importerade texten kan innehålla olika lydelser och övergångsregler. Kontrollera alltid tillämplig version mot den officiella källan.</div>'+
      '<a class="button primary" href="'+attr(sourceUrl(meta.sfs))+'" rel="noopener noreferrer" target="_blank">Öppna på riksdagen.se ↗</a>');
  }
  // Hur stor del av svensk lag som finns i appen (räknas vid varje import mot förteckningen på riksdagen.se).
  function coverageHtml(){
    const c=state.coverage;if(!c||!c.laws)return '';
    const lagar=state.catalog.filter(l=>l.type==='lag').length,regs=state.catalog.filter(l=>l.type==='förordning').length,all=state.catalog.length;
    const pct=(a,b)=>(Math.min(100,a*100/b)).toLocaleString('sv-SE',{maximumFractionDigits:1})+' %';
    return '<div class="section-title">Innehåll</div><div class="coverage">'+
      '<div class="coverage-row"><span>Gällande lagar</span><b>'+lagar+' av '+c.laws+'</b><em>'+pct(lagar,c.laws)+'</em></div>'+
      '<div class="meter"><span style="width:'+Math.min(100,lagar*100/c.laws)+'%"></span></div>'+
      (c.regs?'<div class="coverage-row"><span>Gällande förordningar</span><b>'+regs+' av '+c.regs+'</b><em>'+pct(regs,c.regs)+'</em></div>'+
      '<div class="meter"><span style="width:'+Math.min(100,regs*100/c.regs)+'%"></span></div>':'')+
      '<div class="coverage-row"><span>Alla gällande författningar</span><b>'+all+' av '+c.all+'</b><em>'+pct(all,c.all)+'</em></div>'+
      '<div class="meter"><span style="width:'+Math.min(100,all*100/c.all)+'%"></span></div>'+
      '<p class="small muted">Räknat mot förteckningen över SFS på riksdagen.se '+html(String(c.date||'').slice(0,10))+'.</p></div>';
  }
  function settingsPage(){
    return '<div class="page"><h1 class="page-title">Inställningar</h1>'+
      '<div class="field"><label for="theme">Färgtema</label><select data-setting="theme" id="theme">'+
      [['light','Mjukvitt med elegant grön (standard)'],['dark','Mörkt'],['system',DESKTOP?'Följ Windows':'Följ iPhone']].map(x=>'<option value="'+x[0]+'"'+(pref.theme===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reading-mode">Lästäthet</label><select data-setting="readingMode" id="reading-mode">'+
      [['standard','Standard – bekväm läsning'],['compact','Kompakt – fler paragrafer samtidigt']].map(x=>'<option value="'+x[0]+'"'+(pref.readingMode===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reader-focus-setting">Läsläge</label><select data-setting="focusReader" id="reader-focus-setting">'+
      [['off','Visa vanliga verktygsfält'],['on','Dölj verktygsfält vid läsning']].map(x=>'<option value="'+x[0]+'"'+(pref.focusReader===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="size">Textstorlek <span class="range-value" id="size-value">'+Math.round(Number(pref.fontSize)*100)+' %</span></label>'+
      '<input type="range" data-setting="fontSize" id="size" min="0.85" max="1.5" step="0.05" value="'+attr(pref.fontSize)+'">'+
      '<p class="font-preview" id="font-preview">Den som på sannolika skäl är misstänkt för ett brott …</p></div>'+
      '<div class="field"><label for="font-family">Typsnitt i lagtexten</label><select data-setting="fontFamily" id="font-family">'+
      [['sans','Rakt (systemtypsnitt)'],['serif','Bok (serif)']].map(x=>'<option value="'+x[0]+'"'+(pref.fontFamily===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="height">Radavstånd</label><select data-setting="lineHeight" id="height">'+
      [[1.43,'Kompakt'],[1.55,'Normal'],[1.75,'Luftigt']].map(x=>'<option value="'+x[0]+'"'+(Number(pref.lineHeight)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      coverageHtml()+
      '<div class="section-title">Offline</div>'+
      '<p class="small muted">Spara alla författningar på telefonen så att de går att läsa utan internet.</p>'+
      '<div class="actions"><button type="button" class="button primary" data-action="offline">Ladda ner hela lagboken</button></div>'+
      '<div class="actions offline-areas">'+state.sections.map(a=>'<button type="button" class="button" data-action="offline" data-area="'+attr(a.id)+'">'+html(a.name)+'</button>').join('')+'</div>'+
      '<p class="small muted" id="offline-status">Kontrollerar sparade lagar …</p>'+
      '<div class="section-title">Om appen</div><div class="card-list">'+listRow('Om '+APP_NAME,'Källa, ansvar och kontakt','#/about')+
      listRow('Polisens FAP','Polismyndighetens författningssamling, separat register','#/fap')+'</div>'+
      '<div class="section-title">Introduktion</div><p class="small muted">Genomgången av appens funktioner som visades första gången.</p>'+
      '<div class="actions"><button type="button" class="button" data-action="tutorial">Visa introduktionen igen</button></div>'+
      '<div class="section-title">Säkerhetskopia</div>'+backupNotice()+
      '<p class="small muted">Favoriter, anteckningar och inställningar sparas bara på den här enheten. Spara en kopia som fil och läs in den igen vid behov.</p>'+
      '<div class="actions"><button type="button" class="button" data-action="export">Exportera</button>'+
      '<button type="button" class="button" data-action="import">Importera</button>'+
      '<input type="file" id="import-file" accept="application/json,.json" hidden></div>'+
      (DESKTOP&&window.LagbokDesktop?window.LagbokDesktop.settingsHtml():'')+
      '<div class="section-title">Om appen</div><p class="small muted">'+html(startTime())+'</p><p class="small muted">'+APP_NAME+' version '+APP_VERSION+' · Lagtext hämtad från riksdagen.se '+html(String(window.LAGBOK_GENERATED||'').slice(0,10)||'okänt datum')+' · '+state.catalog.length+' författningar.</p>'+
      '<div class="actions"><button type="button" class="button" data-action="check-update">Leta efter ny version</button></div></div>';
  }
  // Påminnelse om säkerhetskopia när det finns egna markeringar eller anteckningar.
  function backupNotice(){
    const own=Object.keys(pref.highlights).length+Object.keys(pref.notes).length+pref.collections.length;
    if(!own)return '';
    const days=pref.lastBackup?Math.floor((Date.now()-Date.parse(pref.lastBackup))/864e5):null;
    if(days!==null&&days<30)return '<p class="small muted">Senaste säkerhetskopia: för '+(days===0?'mindre än en dag':days+(days===1?' dag':' dagar'))+' sedan.</p>';
    return '<div class="notice backup-notice">'+(days===null?'Du har inte gjort någon säkerhetskopia ännu.':'Det var '+days+' dagar sedan din senaste säkerhetskopia.')+' Exportera för att inte riskera dina markeringar och anteckningar.</div>';
  }
  const DATA_CACHE='lagboken-data';
  const lawUrl=(id)=>'data/laws/'+sfsFile(id)+'.json';
  async function offlineStatus(){
    const box=$('#offline-status');if(!box)return;
    if(!window.caches){box.textContent='Webbläsaren stöder inte offlinelagring.';return;}
    try{
      const cache=await caches.open(DATA_CACHE);
      let saved=0;
      let bytes=0;
      for(const req of await cache.keys()){
        const res=await cache.match(req);
        const len=Number(res&&res.headers.get('content-length'))||((res&&await res.clone().blob()).size||0);
        bytes+=len;if(req.url.includes('/data/laws/'))saved++;
      }
      box.innerHTML=html(saved+' av '+state.catalog.length+' författningar sparade för offline · '+(bytes/1048576).toFixed(1).replace('.',',')+' MB.')+
        (saved?' <button type="button" class="link-button" data-action="offline-clear">Rensa offlinedata</button>':'');
    }catch(_){box.textContent='Status för offlinelagring kunde inte läsas.';}
  }
  async function downloadAll(area){
    if(!window.caches){toast('Offlinelagring stöds inte här.');return;}
    const box=$('#offline-status');let done=0,failed=0;
    const cache=await caches.open(DATA_CACHE);
    const laws=state.catalog.filter(l=>!area||l.section===area);
    // Lagtext, register över hänvisningar och sökindexet behövs för full funktion utan nät.
    const files=laws.flatMap(l=>[lawUrl(l.sfs),'data/index/backlinks/'+sfsFile(l.sfs)+'.json']);
    try{
      files.push('data/index/meta.json','data/index/status.json','data/index/upcoming.json','data/index/relations.json');
      const meta=await fetchJson('data/index/meta.json');
      for(let c=0;c*meta.chunk<meta.count;c++)files.push('data/index/paras/'+c+'.json');
      for(const n of meta.shards)files.push('data/index/terms/'+n+'.json');
    }catch(_){}
    // Sex hämtningar åt gången: hela lagboken är omkring 2 000 filer.
    let n=0,next=0;
    async function worker(){
      while(next<files.length){
        const url=files[next++];
        try{
          const res=await fetch(url,{cache:'no-store'});
          if(!res.ok)throw Error('saknas');
          await cache.put(url,res);if(url.includes('/laws/'))done++;
        }catch(_){if(url.includes('/laws/'))failed++;}
        if(box&&++n%20===0)box.textContent='Laddar ner … '+Math.round(n*100/files.length)+' %';
      }
    }
    await Promise.all(Array.from({length:6},worker));
    try{await cache.addAll(['data/catalog.json','data/index/catalog.json']);}catch(_){}
    toast(failed?failed+' författningar kunde inte hämtas':'Alla lagar finns nu offline');
    offlineStatus();
  }
  function exportData(){
    const payload={app:'Lagboken',version:state.version,exported:new Date().toISOString(),
      favourites:pref.favourites,notes:pref.notes,recents:pref.recents,highlights:pref.highlights,collections:pref.collections,watch:pref.watch,
      settings:{theme:pref.theme,fontSize:pref.fontSize,lineHeight:pref.lineHeight,readingMode:pref.readingMode,focusReader:pref.focusReader,fontFamily:pref.fontFamily}};
    pref.lastBackup=new Date().toISOString();savePrefs();
    const name='lagboken-'+new Date().toISOString().slice(0,10)+'.json';
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const file=window.File?new File([blob],name,{type:'application/json'}):null;
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],title:'Lagboken – säkerhetskopia'}).catch(()=>{});return;
    }
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  }
  async function importData(file){
    try{
      const data=JSON.parse(await file.text());
      if(data.app!=='Lagboken')throw Error('fel format');
      const favs=Array.isArray(data.favourites)?data.favourites.filter(x=>typeof x==='string'):[];
      pref.favourites=Array.from(new Set(pref.favourites.concat(favs)));
      if(data.notes&&typeof data.notes==='object')for(const [k,v] of Object.entries(data.notes))if(typeof v==='string'&&v.trim())pref.notes[k]=v;
      if(data.highlights&&typeof data.highlights==='object')for(const [k,list] of Object.entries(data.highlights)){
        if(!Array.isArray(list))continue;const mine=pref.highlights[k]=pref.highlights[k]||[];
        for(const h of list)if(h&&h.id&&typeof h.quote==='string'&&!mine.some(x=>x.id===h.id))mine.push(h);
      }
      if(Array.isArray(data.collections))for(const c of data.collections){
        if(!c||!c.id||!Array.isArray(c.items))continue;const mine=collectionById(c.id);
        if(mine)mine.items=Array.from(new Set(mine.items.concat(c.items)));else pref.collections.push({id:c.id,name:String(c.name||'Samling'),items:c.items.filter(x=>typeof x==='string')});
      }
      if(data.watch&&typeof data.watch==='object')for(const [k,v] of Object.entries(data.watch))if(!pref.watch[k]&&v&&v.paras)pref.watch[k]=v;
      if(Array.isArray(data.recents)&&!pref.recents.length)pref.recents=data.recents.filter(x=>typeof x==='string').slice(0,15);
      if(data.settings&&typeof data.settings==='object')for(const k of ['theme','fontSize','lineHeight','readingMode','focusReader','fontFamily'])if(k in data.settings)pref[k]=data.settings[k];
      savePrefs();applyPrefs();toast('Säkerhetskopian är inläst');render(false);
    }catch(_){toast('Filen kunde inte läsas som en säkerhetskopia från Lagboken.');}
  }
  const CONTACT='jonathanlindblom@rocketmail.com';
  function aboutPage(){
    const checked=window.LAGBOK_GENERATED?lawModel.formatDate(String(window.LAGBOK_GENERATED).slice(0,10)):'';
    return '<div class="page"><h1 class="page-title">Om '+APP_NAME+'</h1>'+
      '<p class="intro">Svensk lag samlad i telefonen, gjord för att vara snabb att slå i och lätt att läsa.</p>'+
      '<div class="notice">Lagboken är ett privat projekt och har ingen koppling till riksdagen.se, Regeringskansliet eller någon myndighet. '+
      'Texten kan ligga efter eller innehålla fel. Kontrollera alltid mot <b>Svensk författningssamling</b> innan du använder den rättsligt.</div>'+
      '<div class="section-title">Var texten kommer ifrån</div><p class="small">Lagtexten hämtas från riksdagen.se via deras öppna data och kontrolleras automatiskt den 1 varje månad.'+
      (checked?' Senaste kontroll: '+html(checked)+'.':'')+' Varje lag visas i den lydelse riksdagen.se anger ("Ändrad t.o.m. SFS …"), och vid varje import jämförs texten ord för ord med riksdagen.se så att inget faller bort.</p>'+
      '<div class="section-title">Rubriker och kopplingar</div><p class="small muted">En del rubriker, förkortningar och kopplingar mellan lagar och förordningar är tillagda för att göra det lättare att hitta. De är inte en del av lagtexten.</p>'+
      '<div class="section-title">Det du sparar</div><p class="small muted">Favoriter, understrykningar och anteckningar sparas bara '+(DESKTOP?'på den här datorn':'i din telefon')+'. Appen har inga konton och ingen spårning.</p>'+
      '<div class="section-title">Kontakt</div><p class="small">Hittar du ett fel eller har en idé? Skriv till <a href="mailto:'+CONTACT+'">'+CONTACT+'</a>, eller välj <b>Rapportera fel i texten</b> i menyn vid en paragraf.</p>'+
      '<p class="small muted">'+APP_NAME+' '+html(APP_VERSION)+' · Jonathan</p></div>';
  }
  function findDirect(q){return searchCore.parseQuick(q,state.catalog,state.fap);}
  function quickUrl(d){
    return d.type==='fap'?'#/fap/'+encodeURIComponent(d.fap.id):urlFor(d.meta.sfs,d.chapter,d.para);
  }
  function quickLabel(d){
    return d.type==='fap'?d.fap.id:d.chapter==null?d.meta.name:d.meta.name+' · '+placeLabel(d.meta.sfs,d.chapter,d.para);
  }
  async function goQuick(q){
    const direct=findDirect(q);if(!direct)return false;
    if(direct.type==='fap'){state.query='';navigate(quickUrl(direct));return true;}
    try{
      const doc=await loadLaw(direct.meta.sfs);
      const found=searchCore.resolvedQuick(direct,doc);
      if(!found){toast('Kapitlet eller paragrafen finns inte i den importerade författningen.');return true;}
      state.query='';navigate(quickUrl(found));return true;
    }catch(_){toast('Lagtexten kunde inte läsas just nu.');return true;}
  }
  function searchLawMatches(query){
    const n=norm(query);
    if(n.length<3)return searchCore.rankSuggestions(query,state.catalog,[],[],[]).filter(x=>x.type==='law').map(x=>x.law);
    return state.catalog.filter(l=>norm([l.name,l.sfs,(l.aliases||[]).join(' ')].join(' ')).includes(n)).sort((a,b)=>Number(norm(b.name).startsWith(n))-Number(norm(a.name).startsWith(n)));
  }
  function searchPage(){return catalogPage();}
  function resultsHtml(query){
    const direct=findDirect(query),laws=searchLawMatches(query);
    const faps=state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(query)));
    const intro=direct?'<div class="section-title">Direkt till</div><div class="card-list"><a class="list-row" href="'+attr(quickUrl(direct))+'" data-quick="'+attr(query)+'"><div class="grow"><div class="row-title">'+html(quickLabel(direct))+'</div><div class="row-sub">Tryck här eller använd Enter för snabbkod</div></div><span class="chevron">›</span></a></div>':'';
    const lhtml=laws.length?'<div class="section-title">Författningar</div><div class="card-list">'+laws.map(lawRow).join('')+'</div>':'';
    const fhtml=faps.length?'<div class="section-title">Polisens FAP</div><div class="card-list">'+fapResults(faps.slice(0,5))+'</div>':'';
    return intro+lhtml+fhtml+'<div class="section-title">Träffar i lagtext</div><div id="text-results" class="search-results"><div class="loading">Söker i lagtexten …</div></div>';
  }
  function suggestionsHtml(query){
    const topics=[
      {term:'Husrannsakan',code:'RB 28:1'},
      {term:'Häktning',code:'RB 24:1'},
      {term:'Stöld',code:'BrB 8:1'},
      {term:'Ringa stöld',code:'BrB 8:2'},
      {term:'Nödvärn',code:'BrB 24:1'},
      {term:'Offentlig försvarare',code:'RB 21:3a'},
      {term:'Kroppsvisitation',code:'RB 28:11'},
      {term:'Gripande',code:'RB 24:7'},
      {term:'Anhållande',code:'RB 24:6'},
      {term:'Beslag',code:'RB 27:1'},
      {term:'Förundersökning',code:'RB 23:1'},
      {term:'Misshandel',code:'BrB 3:5'},
      {term:'Olaga hot',code:'BrB 4:5'},
      {term:'Hemfridsbrott',code:'BrB 4:6'},
      {term:'Ofredande',code:'BrB 4:7'},
      {term:'Våldtäkt',code:'BrB 6:1'},
      {term:'Snatteri',code:'BrB 8:2'},
      {term:'Rån',code:'BrB 8:5'},
      {term:'Bedrägeri',code:'BrB 9:1'},
      {term:'Skadegörelse',code:'BrB 12:1'},
      {term:'Våld mot tjänsteman',code:'BrB 17:1'},
      {term:'Rattfylleri',code:'TBL 4'},
      {term:'Olovlig körning',code:'TBL 3'},
      {term:'Narkotikabrott',code:'NSL 1'},
      {term:'Uppsägning',code:'LAS 7'},
      {term:'Bodelning',code:'ÄktB 9:1'}
    ];
    const recent=pref.recents.filter(x=>lawById(x.split('|')[0])).slice(0,5).map(x=>({title:favTitle(x),url:favRoute(x)}));
    const matches=searchCore.rankSuggestions(query,state.catalog,state.fap,topics,recent);
    return matches.map(item=>{
      let target='', icon='§',extra='';
      if(item.type==='law'){target=urlFor(item.law.sfs);icon='▤';extra='data-link="1"';}
      if(item.type==='quick'){target=quickUrl(item.quick);icon='↗';extra='data-quick="'+attr(query)+'"';}
      if(item.type==='fap'){target='#/fap/'+encodeURIComponent(item.fap.id);icon='▤';extra='data-link="1"';}
      if(item.type==='topic'){const quick=findDirect(item.code);if(!quick)return '';target=quickUrl(quick);icon='§';extra='data-quick="'+attr(item.code)+'"';}
      if(item.type==='recent'){target=item.url;icon='◷';extra='data-link="1"';}
      return '<a class="suggestion" role="option" href="'+attr(target)+'" '+extra+'><span class="suggestion-icon">'+icon+'</span>'+
        '<span class="suggestion-info"><span class="suggestion-title">'+html(item.title)+'</span>'+
        '<span class="suggestion-sub">'+html(item.subtitle)+'</span></span></a>';
    }).join('');
  }
  function updateSuggestions(){
    const el=$('#search-suggest'),input=$('#query');if(!el||!input)return;
    const markup=suggestionsHtml(state.query);el.innerHTML=markup;el.hidden=!markup;input.setAttribute('aria-expanded',String(!!markup));
  }
  // Filter för fritextsökningen: lagbokens avdelningar, de stora balkarna och egna samlingar.
  function searchFiltersHtml(){
    const opts=[['','Alla'],['typ:lag','Bara lagar'],['typ:förordning','Bara förordningar'],['balk:1962:700','BrB m.fl.'],['balk:1942:740','RB m.fl.'],...state.sections.filter(s=>s.id!=='balkar').map(s=>[s.id,s.name.split(/,| och /)[0]])];
    if(pref.collections.length)opts.push(['samlingar','Mina samlingar']);
    return '<div class="chips search-filters">'+opts.map(([id,label])=>'<button type="button" class="chip'+(state.searchFilter===id?' active':'')+'" data-action="search-filter" data-id="'+attr(id)+'">'+html(label)+'</button>').join('')+'</div>';
  }
  function passesFilter(h){
    const f=state.searchFilter;if(!f)return true;
    const law=lawById(h.sfs);if(!law)return false;
    if(f.startsWith('typ:'))return law.type===f.slice(4);
    if(f.startsWith('balk:')){const b=f.slice(5);return law.sfs===b||law.parent===b;}
    if(f==='samlingar'){const k=searchCore.paraKey(h.number);return pref.collections.some(c=>c.items.some(x=>{const [s,ch,n]=x.split('|');return s===h.sfs&&ch===h.chapter&&searchCore.paraKey(n)===k;}));}
    return law.section===f;
  }
  async function populateTextResults(q,epoch) {
    const box=()=>epoch===state.searchEpoch?$('#text-results'):null;
    if(!searchIndex||!searchIndex){return;}
    let result;
    try{result=await searchIndex.query(q,{limit:400});}
    catch(_){if(box())box().innerHTML='<div class="empty">Sökindexet kunde inte läsas. Försök igen med internetanslutning.</div>';return;}
    if(!box())return;
    if(!result.tokens.length){box().innerHTML='<p class="muted small">Skriv minst två tecken för fritextsökning.</p>';return;}
    if(!result.total){box().innerHTML=(state.find&&state.find.scope==='all'?'':searchFiltersHtml())+'<div class="empty">Inga paragrafer innehåller alla sökorden.</div>';return;}
    // Inifrån en lag visas träffarna utan filterknappar, för att hålla listan kort och lugn.
    const inLaw=!!(state.find&&state.find.scope==='all'),searchFilters=inLaw?()=>'':searchFiltersHtml;
    const all=result.hits.filter(h=>inLaw||passesFilter(h)),hits=all.slice(0,30);
    if(!hits.length){box().innerHTML=searchFilters()+'<div class="empty">Inga träffar med det här filtret.</div>';return;}
    const rows=hits.map((h,i)=>{
      const meta=lawById(h.sfs);if(!meta)return '';
      return '<a class="list-row" href="'+attr(urlFor(h.sfs,h.chapter,searchCore.paraKey(h.number)))+'" data-link="1" data-terms="'+attr(result.tokens.join(' '))+'"><div class="grow"><div class="row-title">'+
        html(shortRef(h.sfs,h.chapter,h.number))+(h.title?' · '+html(h.title):'')+'</div><div class="row-sub">'+html(meta.name)+'</div>'+
        '<div class="search-excerpt" id="hit-'+i+'"></div></div><span class="chevron">›</span></a>';
    }).join('');
    box().innerHTML=searchFilters()+'<p class="small muted">'+all.length+' paragrafer'+(all.length>hits.length?' · visar de '+hits.length+' mest relevanta':'')+'</p><div class="card-list">'+rows+'</div>';
    // Utdrag fylls i när respektive lagtext har lästs in.
    hits.forEach((h,i)=>loadLaw(h.sfs).then(doc=>{
      const el=$('#hit-'+i);if(!el||epoch!==state.searchEpoch)return;
      const ch=doc.chapters.find(c=>c.number===h.chapter),item=ch&&ch.items.find(x=>x.type==='para'&&String(x.number)===h.number);
      if(item)el.innerHTML=window.LagbokIndex.snippet(lawModel.resolve(item).current.text,result.tokens,html);
    }).catch(()=>{}));
  }
  function onSearch(val){
    state.query=val;
    const r=route();
    if(r.page==='fap'){
      const box=$('#fap-results');if(box)box.innerHTML=fapResults(state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(val))));
      return;
    }
    const target=$('#search-results'),directory=$('#catalog-directory');if(!target)return;
    const active=!!val.trim();if(directory)directory.hidden=active;
    if(!active){target.innerHTML='';state.searchEpoch++;updateSuggestions();return;}
    target.innerHTML=resultsHtml(val);updateSuggestions();
    const epoch=++state.searchEpoch;
    if(findDirect(val)){const box=$('#text-results');if(box)box.innerHTML='<p class="small muted">Tryck Enter för att öppna lagrummet direkt.</p>';return;}
    setTimeout(()=>{if(state.searchEpoch===epoch)populateTextResults(val,epoch);},220);
  }
  // Ersatta lydelser (data/history/<sfs>.json) sparas av den månatliga importen. Med dem och Riksdagens
  // datummarkeringar kan appen visa paragrafen som den löd ett visst datum.
  function withHistory(sfs,chapter,item){
    const hist=state.atDate&&state.history.get(sfs);
    const old=hist?hist.filter(h=>h.chapter===chapter&&searchCore.paraKey(h.number)===searchCore.paraKey(item.number)).sort((a,b)=>a.until.localeCompare(b.until)):[];
    if(!old.length)return item;
    const now=(item.versions&&item.versions.length?item.versions:[{text:item.text,amendedBy:item.amendedBy}]);
    const last=old[old.length-1].until;
    const past=old.map((h,i)=>({text:h.text,amendedBy:h.amendedBy,expires:{date:h.until,label:h.until},inForce:i?{date:old[i-1].until,label:old[i-1].until}:undefined}));
    return Object.assign({},item,{versions:past.concat(now.map(v=>v.inForce||v.superseded?v:Object.assign({},v,{inForce:{date:last,label:last}})))});
  }
  function showDatePicker(key){
    const today=lawModel.today();
    showSheet('<div class="sheet-title">Lydelse vid datum <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">Visar lagtexten som den löd ett visst datum, till exempel när en gärning begicks. Bygger på datummarkeringarna på riksdagen.se och de lydelser appen sparat sedan oktober 2026. Äldre ändringar kan saknas – kontrollera alltid mot källan.</p>'+
      '<form id="date-form" class="actions"><input type="date" id="at-date" max="2100-12-31" value="'+attr(state.atDate||today)+'" required> '+
      '<button type="submit" class="button primary">Visa</button>'+(state.atDate?' <button type="button" class="button" data-action="date-clear">I dag</button>':'')+'</form>');
    const f=$('#date-form');if(f)f.addEventListener('submit',async e=>{e.preventDefault();const v=$('#at-date').value;await setAtDate(v&&v!==today?v:null,key);});
  }
  async function setAtDate(day,key){
    state.atDate=day;closeSheet();
    const sfs=(key||'').split('|')[0]||route().sfs;
    if(day&&sfs&&!state.history.has(sfs)){try{state.history.set(sfs,await fetchJson('data/history/'+sfsFile(sfs)+'.json'));}catch(_){state.history.set(sfs,[]);}}
    renderKeep();toast(day?'Visar lydelse '+lawModel.formatDate(day):'Visar dagens lydelse');
  }
  async function lawPage(r){
    const meta=lawById(r.sfs);
    if(!meta) return '<div class="page"><h1>Okänd författning</h1><p>Författningen finns inte i katalogen.</p></div>';
    const data=await loadLaw(meta.sfs);
    if(state.atDate&&!state.history.has(meta.sfs)){try{state.history.set(meta.sfs,await fetchJson('data/history/'+sfsFile(meta.sfs)+'.json'));}catch(_){state.history.set(meta.sfs,[]);}}
    if(r.chapter==null) {
      if(!hasRealChapters(data)) return chapterReader(meta,data,'0');
      // Sökraden fungerar även på lagens startsida; ↑ ↓ öppnar kapitlet där träffen finns.
      return (state.find&&state.find.sfs===meta.sfs?'<div class="reader-context">'+findBar(meta)+'</div>':'')+chapterList(meta,data);
    }
    return chapterReader(meta,data,r.chapter);
  }
  async function render(reset,keep){
    const r=route();state.current=r;
    if(r.page==='law'&&pref.focusReader==='on')state.focus=true;
    document.documentElement.dataset.focus=(state.focus&&r.page==='law')?'true':'false';
    const tab = ['catalog','saved'].includes(r.page)?r.page:null;
    $$('.bottom-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
    $('#back').hidden=['home','catalog','search','saved'].includes(r.page);
    hideHighlightBar();
    const meta=lawById(r.sfs);
    syncLawTools(r,meta);
    $('#top-title').textContent = r.page==='law'?(meta?meta.name:'Lagbok'):({home:'Lagbok',catalog:'Lagbok',search:'Lagbok',saved:'Sparat',fap:r.sfs?'FAP':'Polisens FAP',settings:'Inställningar',about:'Om',collection:'Samling',upcoming:'Kommande ändringar',register:'Register',nytt:'Nytt i lagen'}[r.page]||'Lagbok');
    if(r.page!=='law'){state.returnStack=[];}
    if(state.find&&(r.page!=='law'||r.sfs!==state.find.sfs))state.find=null;
    else while(state.returnStack.length&&state.returnStack[state.returnStack.length-1].hash===location.hash)state.returnStack.pop();
    let markup;
    switch(r.page) {
      case 'home': markup=catalogPage();break;
      case 'catalog': markup=catalogPage();break;
      case 'search': markup=searchPage();break;
      case 'saved': markup=savedPage();break;
      case 'fap': markup=r.sfs?fapReader(r.sfs):fapPage();break;
      case 'settings': markup=settingsPage();break;
      case 'about': markup=aboutPage();break;
      case 'collection': markup=await collectionPage(r.sfs);break;
      case 'upcoming': markup=await upcomingPage();break;
      case 'register': markup=registerPage();break;
      case 'nytt': markup=await newsPage();break;
      case 'law':
        if(!state.laws.has(r.sfs))view.innerHTML=skeleton();
        try {markup=await lawPage(r);}
        catch(e) {
          markup='<div class="page"><h1 class="page-title">'+html(meta?meta.name:'Lagtext')+'</h1>'+
            '<div class="notice">Fullständig lagtext är ännu inte tillgänglig i appens datakatalog. Inga ofullständiga utdrag visas som om de vore kompletta.</div>'+
            '<a class="button primary" href="'+attr(sourceUrl(r.sfs))+'" target="_blank" rel="noopener noreferrer">Läs aktuell text på riksdagen.se ↗</a>'+
            '<p class="small muted">Importprocessen publicerar författningarna som separata versionshanterade filer.</p></div>';
        }
        break;
      default: markup=home();
    }
    if(state.current!==r)return;
    // Vid start visas katalogen redan från en sparad ögonblicksbild (index.html); är den likadan behöver den inte ritas om.
    const snap=window.LAGBOK_SNAPSHOT;window.LAGBOK_SNAPSHOT=null;
    if(!(snap&&snap===markup))view.innerHTML=markup+(r.page==='law'?returnChip():'');
    if(r.page==='catalog'&&!state.query&&!state.editFavs)saveSnapshot(markup);
    syncLawTools(r,meta);
    animateView(keep?'':state.navDir);state.navDir='';
    const tb=$('.topbar');if(tb&&tb.classList&&!keep)tb.classList.toggle('titled',!(typeof view.querySelector==='function'&&view.querySelector('.page-title,.law-head h1,.reader-heading h1')));
    applyHighlights();applySearchMarks();applyFindMarks();clearNewHighlight();
    if(state.find&&state.find.scope==='all'&&r.page==='law')runAll(state.find.q);
    if(r.page==='law'&&meta)addRecent(meta.sfs+(r.chapter==null?'':'|'+r.chapter)+(r.paragraph?'|'+r.paragraph:''));
    if(keep){/* Omritning på plats: renderKeep återställer scrollposition. */}
    else if(r.page==='law'&&r.paragraph) {
      const remembered=!reset&&Object.prototype.hasOwnProperty.call(state.positions,location.hash)?state.positions[location.hash]:null;
      requestAnimationFrame(()=>{
        if(remembered!==null){view.scrollTop=remembered;return;}
        const key=CSS.escape(searchCore.paraKey(r.paragraph)),target=$('#p-'+key);
        if(!target){toast('Lagrummet finns inte i den importerade texten.');return;}
        const heading=$('#g-'+key);
        (heading||target).scrollIntoView({block:'start',behavior:'instant'});
        // Diskret markering av paragrafnumret, bara när man kommer hit via länk, sökning eller innehåll.
        if(reset&&target.classList&&target.classList.add){target.classList.add('is-target');setTimeout(()=>target.classList.remove('is-target'),900);}
      });
    } else if(reset){view.scrollTop=0;}
    else {view.scrollTop=state.positions[location.hash]||0;}
    // Efter ett hopp till ett annat kapitel med ↑ ↓ visas ordet i fokus, inte bara paragrafens början.
    if(state.find&&state.find.scrollPending&&r.page==='law'){state.find.scrollPending=false;requestAnimationFrame(()=>requestAnimationFrame(()=>{const m=$('mark.find-focus');if(m&&m.scrollIntoView)m.scrollIntoView({block:'center',behavior:'instant'});}));}
    if((r.page==='catalog'||r.page==='search'||r.page==='home'||(r.page==='fap'&&!r.sfs))&&state.query) onSearch(state.query);
    if(r.page==='settings')offlineStatus();
    if(r.page==='saved')fillWatchUpdates();
    updateNavBadge();
  }
  function lawSearchResults(doc,meta,q) {
    const query=norm(q);
    if(query.length<2)return '<div class="empty">Skriv ett sökord eller en paragraf.</div>';
    const hits=[];
    for(const ch of doc.chapters) {
      for(const item of ch.items||[]) {
        if(item.type!=='para')continue;
        const text=searchText(item);
        const needle=norm(text);
        if(needle.includes(query)||norm(item.number+' §').includes(query)) {
          const start=Math.max(0,needle.indexOf(query)-60);
          hits.push({ch,item,preview:text.slice(start,start+185)});
          if(hits.length>=100)break;
        }
      }
      if(hits.length>=100)break;
    }
    if(!hits.length)return '<div class="empty">Inga sökträffar i denna författning.</div>';
    return '<p class="small muted">'+hits.length+(hits.length===100?'+':'')+' träffar</p><div class="card-list">'+
      hits.slice(0,45).map(x=>listRow(placeLabel(meta.sfs,x.ch.number,x.item.number),x.preview,urlFor(meta.sfs,x.ch.number,x.item.number))).join('')+
      '</div>'+(hits.length>45?'<p class="small muted">Visar de första 45 träffarna. Skriv fler ord för att avgränsa.</p>':'');
  }
  // Snabbhopp: skriv t.ex. "rb 23 8b" eller "fuk 13" från vilken vy som helst.
  function quickJump(){
    const r=route(),meta=r.page==='law'?lawById(r.sfs):null;
    showSheet('<div class="sheet-title">Gå till eller sök <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<form id="jump-form" class="searchbox">'+iconSearch()+'<input id="jump-query" type="search" enterkeyhint="go" autocomplete="off" spellcheck="false" placeholder="T.ex. rb 23 8b, fuk 13 eller ett ord'+(meta?' i '+html(meta.name):'')+'"></form>'+
      '<div id="jump-results"><p class="small muted">Skriv en förkortning och ett lagrum, så öppnas det direkt.'+(meta?' Ord söks i '+html(meta.name)+'.':'')+'</p></div>');
  }
  function jumpResults(q){
    const r=route(),meta=r.page==='law'?lawById(r.sfs):null,doc=meta&&state.laws.get(r.sfs);
    const direct=q.trim()?findDirect(q):null;
    let out=direct?'<div class="card-list"><a class="list-row" data-quick="'+attr(q)+'" href="'+attr(quickUrl(direct))+'"><div class="grow"><div class="row-title">'+html(quickLabel(direct))+'</div><div class="row-sub">Öppna direkt (Enter)</div></div><span class="chevron">›</span></a></div>':'';
    if(!direct&&doc&&norm(q).length>=2)out+=lawSearchResults(doc,meta,q);
    if(!direct&&norm(q).length>=2)out+='<div class="card-list"><a class="list-row" href="#/catalog" data-action="jump-all" data-q="'+attr(q)+'"><div class="grow"><div class="row-title">Sök ”'+html(q)+'” i hela lagboken</div></div><span class="chevron">›</span></a></div>';
    return out||'<p class="small muted">Skriv en förkortning och ett lagrum, så öppnas det direkt.</p>';
  }
  function findWithinLaw() {
    const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
    if(!doc||!meta)return toast('Lagtexten är ännu inte inläst.');
    showSheet('<div class="sheet-title">Sök i '+html(meta.name)+' <button class="icon-button" data-action="close">×</button></div>'+
      '<div class="searchbox">'+iconSearch()+'<input id="local-query" type="search" placeholder="Sök i alla kapitel" autocomplete="off"></div>'+
      '<div id="local-results"><div class="empty">Sök bland samtliga paragrafer i författningen.</div></div>');
  }
  function toc() {
    const r=route(),meta=lawById(r.sfs);
    if(!meta)return;
    loadLaw(r.sfs).then(data=>{
      showSheet(tocHtml(meta,data),false);
      sheet.dataset.kind='toc';
      requestAnimationFrame(()=>{
        const selected=$('.toc-current',sheet)||$('.toc-current-chapter',sheet);
        if(selected&&selected.scrollIntoView)selected.scrollIntoView({block:'center',behavior:'instant'});
      });
    }).catch(()=>toast('Innehållsförteckningen kunde inte läsas.'));
  }
  function note(key) {
    closeSheet();
    const [sfs,cap,num]=key.split('|'),r=route();
    // Anteckningen skrivs direkt under paragrafen i läsvyn.
    state.editingNote=key;
    const here=r.page==='law'&&r.sfs===sfs&&String(r.chapter)===String(cap);
    const focus=()=>{const f=$('textarea.note-input');if(f){f.focus();const el=f.closest('.paragraph');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});}};
    if(here)renderKeep().then(focus);
    else{navigate(urlFor(sfs,cap,searchCore.paraKey(num)));setTimeout(focus,350);}
  }
  function saveNote(key,value,quiet){
    const before=pref.notes[key]||'';
    const t=String(value||'').trim();
    if(t)pref.notes[key]=t;else delete pref.notes[key];
    savePrefs();
    if(!quiet&&before&&!t)toast('Anteckningen är borttagen',()=>{pref.notes[key]=before;savePrefs();renderKeep();});
  }
  function menuRow(action,key,label,icon,extra){
    return '<button type="button" class="list-row sheet-menu-row" data-action="'+action+'" data-key="'+attr(key)+'"'+(extra||'')+'><span class="grow"><span class="row-title">'+label+'</span></span><span class="chevron">'+icon+'</span></button>';
  }
  function paraMenu(key){
    const [id,cap,num]=key.split('|');
    showSheet('<div class="sheet-title">'+html(favTitle(key))+
      '<button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<div class="card-list">'+
      menuRow('copy-ref',key,'Kopiera hänvisning <span class="muted">('+html(shortRef(id,cap,num))+')</span>','⧉')+
      menuRow('copy',key,'Kopiera lagtext med hänvisning','⧉')+
      menuRow('share',key,'Dela länk till lagrummet','↗')+
      menuRow('fav',key,pref.favourites.includes(key)?'Ta bort från favoriter':'Spara som favorit','☆')+
      menuRow('collect',key,'Lägg till i samling','▤')+
      menuRow('note',key,pref.notes[key]?'Redigera anteckning':'Skriv anteckning','✎')+
      menuRow('backlinks',key,'Visa vad som hänvisar hit','↩\uFE0E')+
      menuRow('history',key,'Visa lydelse vid ett datum','◷')+
      menuRow('report',key,'Rapportera fel i texten','⚑')+'</div>'+
      '<p class="small muted sheet-hint">Tips: markera text i paragrafen för att stryka under den.</p>');
  }
  // Felrapport: öppnar ett färdigt ärende i projektets GitHub med lagrum, text och källa.
  // Felrapport: öppnar ett färdigt mejl med lagrum, text och länk.
  async function reportError(key){
    const [id,cap,num]=key.split('|'),meta=lawById(id);
    let text='';
    try{const doc=await loadLaw(id),ch=doc.chapters.find(c=>c.number===cap),item=ch&&ch.items.find(i=>i.type==='para'&&searchCore.paraKey(i.number)===searchCore.paraKey(num));
      if(item)text=lawModel.resolve(item).current.text;}catch(_){}
    const subject='Lagboken: fel i '+shortRef(id,cap,num);
    const body='Vad är fel?\n\n\n\n---\nLagrum: '+shortRef(id,cap,num)+' ('+(meta?meta.name:id)+', SFS '+id+')\nLänk: '+location.origin+location.pathname+urlFor(id,cap,num)+
      '\nKälla: '+sourceUrl(id)+'\nVersion: '+APP_VERSION+'\n\nTexten i appen:\n'+text.slice(0,1200);
    location.href='mailto:'+CONTACT+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    closeSheet();
  }
  function shortRef(sfs,chapter,para){
    const meta=lawById(sfs),name=meta?((meta.aliases||[]).find(a=>/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö]{1,5}$/.test(a))||meta.name):sfs;
    if(isArt(sfs,chapter))return name+' '+(chapter==='K'?'':chapShort(sfs,chapter)+' ')+(para?'art. '+para:'');
    return name+' '+(chapter&&chapter!=='0'?chapter+(para?':'+para:' kap.'):(para?para+' §':''));
  }
  // Hänvisningar öppnas direkt. En knapp tar läsaren tillbaka till stället där länken fanns.
  // Ett intervall ("7–9 §§", "24–28 kap.") öppnar en liten meny där man väljer vilken paragraf eller vilket kapitel.
  async function rangeSheet(link){
    const d=link.dataset,from=link.closest&&link.closest('.paragraph'),origin=from&&from.dataset?from.dataset.paragraph:'';
    let doc;try{doc=await loadLaw(d.refSfs);}catch(_){return toast('Lagtexten kunde inte läsas just nu.');}
    const meta=lawById(d.refSfs),rank=k=>{const m=/^(\d+)([a-z]*)$/.exec(searchCore.paraKey(k));return m?Number(m[1])*100+(m[2]?m[2].charCodeAt(0)-96:0):null;};
    const row=(chapter,para,title,sub)=>'<a class="list-row" href="'+attr(urlFor(d.refSfs,chapter,para))+'" data-ref="1" data-ref-sfs="'+attr(d.refSfs)+'" data-ref-chapter="'+attr(chapter)+'"'+
      (para?' data-ref-para="'+attr(para)+'"':'')+' data-from-para="'+attr(origin)+'"><div class="grow"><div class="row-title">'+html(title)+'</div>'+(sub?'<div class="row-sub">'+html(sub)+'</div>':'')+'</div><span class="chevron">›</span></a>';
    let rows=[],heading;
    if(d.refChapterTo){
      const list=doc.chapters.map(c=>String(c.number)),i=list.indexOf(d.refChapter),j=list.indexOf(d.refChapterTo);
      rows=(i>=0&&j>=i?doc.chapters.slice(i,j+1):[]).map(c=>row(c.number,null,c.number+' kap.'+(c.title?' '+c.title:''),''));
      heading=shortRef(d.refSfs,d.refChapter).replace(/ kap\.$/,'')+'–'+d.refChapterTo+' kap.';
    }else{
      const ch=doc.chapters.find(c=>String(c.number)===String(d.refChapter)),lo=rank(d.refPara),hi=rank(d.refTo);
      rows=(ch?ch.items:[]).filter(i=>i.type==='para'&&rank(i.number)!=null&&rank(i.number)>=lo&&rank(i.number)<=hi).map(i=>{
        const title=tocModel.curatedTitle(d.refSfs,ch.number,i.number)||'',text=lawModel.resolve(i).current.text||'';
        return row(ch.number,searchCore.paraKey(i.number),placeLabel(d.refSfs,ch.number,i.number).replace(/^a/,'A')+(title?' · '+title:''),i.repealed?'Upphävd':text.replace(/\s+/g,' ').slice(0,90)+(text.length>90?' …':''));
      });
      heading=shortRef(d.refSfs,d.refChapter,d.refPara)+'–'+String(d.refTo).replace(/^(\d+)([a-z])$/,'$1 $2')+(d.refChapter==='0'?' §§':'');
    }
    if(!rows.length){navigate(urlFor(d.refSfs,d.refChapter,d.refPara));return;}
    showSheet('<div class="sheet-title">'+html(heading)+' <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">'+html(meta?meta.name:'')+' · välj '+(d.refChapterTo?'kapitel':'paragraf')+'</p><div class="card-list">'+rows.join('')+'</div>',false);
  }
  function followRef(link){
    if(link.dataset&&(link.dataset.refTo||link.dataset.refChapterTo)&&!link.closest('.sheet')){rangeSheet(link);return;}
    if(link.closest&&link.closest('.sheet'))closeSheet();
    const r=route(),from=link.closest&&link.closest('.paragraph');
    const para=link.dataset&&link.dataset.fromPara?link.dataset.fromPara:from&&from.dataset?from.dataset.paragraph:r.paragraph;
    state.returnStack.push({hash:location.hash,label:shortRef(r.sfs,r.chapter,para)});
    state.returnStack=state.returnStack.slice(-20);
    navigate(urlFor(link.dataset.refSfs,link.dataset.refChapter,link.dataset.refPara));
  }
  function returnChip(){
    const top=state.returnStack[state.returnStack.length-1];
    if(!top||top.hash===location.hash)return '';
    return '<button type="button" class="return-chip" data-action="return">‹ Tillbaka till '+html(top.label)+'</button>';
  }
  async function changeReaderMode(mode){
    if(!['standard','compact'].includes(mode))return;
    pref.readingMode=mode;savePrefs();applyPrefs();
    const position=view.scrollTop;
    await render(false);view.scrollTop=position;
  }
  async function toggleFocus(){
    const position=view.scrollTop;
    state.focus=!state.focus;
    pref.focusReader=state.focus?'on':'off';savePrefs();
    await render(false);view.scrollTop=position;
  }
  async function copyParagraph(key) {
    const [id,cap,num]=key.split('|');
    try {
      const doc=await loadLaw(id);
      const ch=doc.chapters.find(x=>x.number===cap);
      const p=ch && ch.items.find(x=>x.type==='para'&&x.number===num);
      if(!p)throw Error('Saknas');
      const text=isArt(id,cap)?placeLabel(id,cap,num)+' · '+lawById(id).name+' (SFS '+id+')\n\n'+lawModel.resolve(p).current.text:
        (cap==='0'?'':cap+' kap. ')+num+' § '+lawById(id).name+' (SFS '+id+')\n\n'+lawModel.resolve(p).current.text;
      if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}
      toast('Lagrum kopierat');
    }catch(_){toast('Det gick inte att kopiera paragrafen');}
  }
  // ---------- 0.6: kopiera, dela och samlingar ----------
  async function copyText(text,message){
    try{
      if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
      else{const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}
      closeSheet();toast(message);
    }catch(_){toast('Det gick inte att kopiera');}
  }
  function shareRef(key){
    const [id,cap,num]=key.split('|'),url=location.href.split('#')[0]+urlFor(id,cap,num);
    const title=shortRef(id,cap,num)+' – '+((lawById(id)||{}).name||'');
    if(navigator.share){navigator.share({title,url}).catch(()=>{});closeSheet();}
    else copyText(url,'Länk kopierad');
  }
  function collectionById(id){return pref.collections.find(c=>c.id===id);}
  function collectSheet(key){
    showSheet('<div class="sheet-title">Lägg till i samling <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">'+html(favTitle(key))+'</p><div class="card-list">'+
      pref.collections.map(c=>'<button type="button" class="list-row sheet-menu-row" data-action="collect-into" data-id="'+attr(c.id)+'" data-key="'+attr(key)+'">'+
        '<span class="grow"><span class="row-title">'+html(c.name)+'</span><span class="row-sub">'+c.items.length+' paragrafer'+(c.items.includes(key)?' · finns redan':'')+'</span></span><span class="chevron">+</span></button>').join('')+
      '</div><div class="field"><label for="collection-name">Ny samling</label><input id="collection-name" type="text" maxlength="60" placeholder="T.ex. LOB-ingripande"></div>'+
      '<button type="button" class="button primary" data-action="collect-new" data-key="'+attr(key)+'">Skapa och lägg till</button>',false);
  }
  function addToCollection(id,key){
    const c=collectionById(id);if(!c)return;
    if(!c.items.includes(key))c.items.push(key);
    savePrefs();closeSheet();toast('Tillagd i ”'+c.name+'”');
  }
  // Samlingen som ren text med hänvisningar, för att dela eller klistra in någon annanstans.
  async function collectionText(id){
    const c=collectionById(id);if(!c)return;
    const parts=[c.name,''];
    for(const key of c.items){
      const [sfs,cap,num]=key.split('|'),meta=lawById(sfs);
      try{const {item}=findPara(await loadLaw(sfs),cap,num);if(!item)continue;
        parts.push(shortRef(sfs,cap,num)+' '+(meta?meta.name:'')+' (SFS '+sfs+')',lawModel.resolve(item).current.text);
        if(pref.notes[key])parts.push('Anteckning: '+pref.notes[key]);parts.push('');}catch(_){}
    }
    const text=parts.join('\n')+'\nKälla: Sveriges riksdag. Kontrollera gällande lydelse.';
    if(navigator.share)navigator.share({title:c.name,text}).catch(()=>{});else copyText(text,'Samlingen är kopierad som text');
  }
  function removeFromCollection(id,key){
    const c=collectionById(id);if(!c)return;
    c.items=c.items.filter(x=>x!==key);savePrefs();renderKeep();
  }
  function renameCollection(id){
    const c=collectionById(id);if(!c)return;
    const name=window.prompt('Nytt namn på samlingen',c.name);
    if(name&&name.trim()){c.name=name.trim().slice(0,60);savePrefs();renderKeep();}
  }
  function deleteCollection(id){
    const c=collectionById(id);if(!c||!window.confirm('Ta bort samlingen ”'+c.name+'”? Paragraferna påverkas inte.'))return;
    pref.collections=pref.collections.filter(x=>x!==c);savePrefs();navigate('#/saved',true);
  }
  function findPara(doc,cap,num){
    const ch=doc.chapters.find(c=>String(c.number)===String(cap));
    return {ch,item:ch&&ch.items.find(x=>x.type==='para'&&searchCore.paraKey(x.number)===searchCore.paraKey(num))};
  }
  async function collectionPage(id){
    const c=collectionById(id);
    if(!c)return '<div class="page"><div class="empty">Samlingen finns inte längre.</div></div>';
    const parts=await Promise.all(c.items.map(async key=>{
      const [sfs,cap,num]=key.split('|'),meta=lawById(sfs);
      try{
        const {ch,item}=findPara(await loadLaw(sfs),cap,num);
        if(!meta||!item)throw Error('saknas');
        return '<section class="collection-item"><div class="collection-head"><a data-link="1" href="'+attr(favRoute(key))+'">'+html(shortRef(sfs,cap,num))+' · '+html(meta.name)+' ›</a>'+
          '<button type="button" class="link-button" data-action="collect-remove" data-id="'+attr(c.id)+'" data-key="'+attr(key)+'">Ta bort</button></div>'+paraHtml(meta,ch,item)+'</section>';
      }catch(_){
        return '<section class="collection-item"><div class="notice">'+html(favTitle(key))+' finns inte i den importerade texten. <button type="button" class="link-button" data-action="collect-remove" data-id="'+attr(c.id)+'" data-key="'+attr(key)+'">Ta bort</button></div></section>';
      }
    }));
    return '<div class="page collection-page"><span class="source-label">Samling</span><h1 class="page-title">'+html(c.name)+'</h1>'+
      '<div class="actions"><button type="button" class="button" data-action="collection-rename" data-id="'+attr(c.id)+'">Byt namn</button>'+
      '<button type="button" class="button" data-action="collection-text" data-id="'+attr(c.id)+'">Dela som text</button>'+
      '<button type="button" class="button" data-action="collection-print" data-id="'+attr(c.id)+'">Skriv ut / PDF</button>'+
      '<button type="button" class="button" data-action="collection-delete" data-id="'+attr(c.id)+'">Ta bort samling</button></div>'+
      (parts.length?'<div class="law-reader collection-reader">'+parts.join('')+'</div>':'<div class="empty" style="margin-top:18px">Samlingen är tom. Lägg till paragrafer via menyn ⋯ vid en paragraf.</div>')+'</div>';
  }
  // ---------- 0.6: hänvisat från ----------
  // Kopplingar för en paragraf: kompletterande föreskrifter, vad den kompletterar och hänvisningar hit.
  // Visas i menyn under paragrafen och, i den breda layouten, i högerspalten.
  function connectionsHtml(sfs,cap,num){
    const list=(state.backlinks.get(sfs)||{})[cap+'|'+searchCore.paraKey(num)]||[];
    const rows=items=>'<div class="card-list">'+items.map(([s,c,n])=>listRow(shortRef(s,c,n)+((tocModel.curatedTitle(s,c,n))?' · '+tocModel.curatedTitle(s,c,n):''),(lawById(s)||{}).name||s,urlFor(s,c,searchCore.paraKey(n)))).join('')+'</div>';
    const reg=list.filter(e=>e[3]==='föreskrift'),comp=list.filter(e=>e[3]==='kompletterar'),refs=list.filter(e=>!e[3]||e[3]==='ref');
    return (reg.length?'<div class="section-title regulation-title">Kompletterande föreskrifter</div><p class="small muted">Förordningsparagrafer som fyller ut bestämmelsen.</p>'+rows(reg):'')+
      (comp.length?'<div class="section-title regulation-title">Kompletterar</div><p class="small muted">Lagparagrafer som den här föreskriften fyller ut.</p>'+rows(comp):'')+
      (refs.length?'<div class="section-title">Hänvisar hit</div>'+rows(refs):'')+
      (!list.length?'<div class="empty">Inga kopplingar till andra paragrafer.</div>':'');
  }
  async function backlinksSheet(key){
    const [sfs,cap,num]=key.split('|');
    try{await loadLaw(sfs);}catch(_){}
    showSheet('<div class="sheet-title">Kopplingar för '+html(shortRef(sfs,cap,num))+' <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+connectionsHtml(sfs,cap,num),false);
  }
  // ---------- 0.6: ändringsbevakning ----------
  function watchedLaws(){return Object.keys(pref.watch).filter(lawById);}
  function changedLaws(){return watchedLaws().filter(sfs=>state.status[sfs]&&state.status[sfs].hash!==pref.watch[sfs].hash);}
  function updateNavBadge(){
    const n=changedLaws().length,b=$('.bottom-nav button[data-tab="saved"]');
    if(b&&b.classList)b.classList.toggle('has-updates',n>0);
    const c=$('.bottom-nav button[data-tab="catalog"]');if(c&&c.classList)c.classList.toggle('has-updates',unseenNews()>0);
  }
  async function toggleWatch(sfs){
    if(pref.watch[sfs]){delete pref.watch[sfs];savePrefs();toast('Bevakningen är avslutad');renderKeep();return;}
    try{const doc=await loadLaw(sfs);pref.watch[sfs]=Object.assign(lawModel.snapshot(doc),{at:lawModel.today()});savePrefs();
      toast('Du får se ändringar i '+((lawById(sfs)||{}).name||sfs)+' under Sparat');renderKeep();}
    catch(_){toast('Lagen kunde inte läsas just nu');}
  }
  async function acknowledge(sfs){
    try{const doc=await loadLaw(sfs);pref.watch[sfs]=Object.assign(lawModel.snapshot(doc),{at:lawModel.today()});savePrefs();renderKeep();}catch(_){}
  }
  function watchSummary(){
    const laws=watchedLaws();
    if(!laws.length)return '<div class="empty">Bevaka en lag via knappen ”Bevaka ändringar” på lagens startsida. Lagar där du sparat favoriter bevakas automatiskt.</div>';
    return '<div id="watch-updates"><p class="small muted">Kontrollerar '+laws.length+' bevakade författningar …</p></div><div id="watch-upcoming"></div>';
  }
  async function fillWatchUpdates(){
    const box=$('#watch-updates');if(!box)return;
    const laws=watchedLaws(),rows=[];
    for(const sfs of laws){
      const meta=lawById(sfs);
      if(state.status[sfs]&&state.status[sfs].hash===pref.watch[sfs].hash){rows.push({sfs,meta,clean:true});continue;}
      try{const d=lawModel.diff(pref.watch[sfs],await loadLaw(sfs));rows.push({sfs,meta,d,clean:!d.added.length&&!d.changed.length&&!d.removed.length});}
      catch(_){rows.push({sfs,meta,error:true});}
    }
    if(!$('#watch-updates'))return;
    const changed=rows.filter(r=>!r.clean&&!r.error);
    const link=(sfs,k)=>{const [c,n]=k.split('|');return '<a data-link="1" href="'+attr(urlFor(sfs,c,searchCore.paraKey(n)))+'">'+html(shortRef(sfs,c,n).replace(/^\S+\s/,''))+'</a>';};
    $('#watch-updates').innerHTML=(changed.length?'<div class="watch-news"><div class="watch-news-title">Nytt sedan sist</div>'+changed.map(r=>
      '<div class="watch-law"><div class="row-title">'+html(r.meta.name)+'</div>'+
      (r.d.changed.length?'<p class="small">Ändrade: '+r.d.changed.slice(0,12).map(k=>link(r.sfs,k)).join(', ')+(r.d.changed.length>12?' …':'')+'</p>':'')+
      (r.d.added.length?'<p class="small">Nya: '+r.d.added.slice(0,12).map(k=>link(r.sfs,k)).join(', ')+(r.d.added.length>12?' …':'')+'</p>':'')+
      (r.d.removed.length?'<p class="small">Borttagna: '+r.d.removed.slice(0,12).map(k=>html(k.replace('|',':'))).join(', ')+'</p>':'')+
      '<button type="button" class="link-button" data-action="watch-ack" data-key="'+attr(r.sfs)+'">Markera som läst</button></div>').join('')+'</div>':
      '<p class="small muted">Inga ändringar sedan du senast tittade i '+(rows.length===1?'den bevakade författningen':rows.length+' bevakade författningar')+'.</p>')+
      '<div class="chips">'+rows.map(r=>'<a class="chip" data-link="1" href="'+attr(urlFor(r.sfs))+'">'+html(shortRef(r.sfs,'0',null).trim())+'</a>').join('')+'</div>';
    const up=await upcomingFor(laws);
    const target=$('#watch-upcoming');
    if(target)target.innerHTML=up.length?'<div class="watch-news-title">Kommande ändringar i det du bevakar</div>'+timeline(up,8)+(up.length>8?'<p class="small muted"><a href="#/upcoming" data-link="1">Visa alla '+up.length+'</a></p>':''):'';
    updateNavBadge();
  }
  async function upcomingFor(laws){
    if(!state.upcoming){try{state.upcoming=await fetchJson('data/index/upcoming.json');}catch(_){state.upcoming=[];}}
    const today=lawModel.today(),seen=new Set();
    const future=state.upcoming.filter(u=>{const k=u.join('|');if(seen.has(k)||(u[0]&&u[0]<=today))return false;seen.add(k);return true;});
    return laws?future.filter(u=>laws.includes(u[1])):future;
  }
  function timeline(list,limit){
    const groups=new Map();
    for(const u of list){const k=u[0]||'';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(u);}
    return '<div class="timeline">'+[...groups].map(([date,items])=>'<div class="timeline-group"><div class="timeline-date">'+
      html(date?lawModel.formatDate(date):'Datum ej bestämt')+'<span>'+items.length+(items.length===1?' paragraf':' paragrafer')+'</span></div><div class="chips">'+
      items.slice(0,limit||items.length).map(([,s,c,n])=>'<a class="chip" data-link="1" href="'+attr(urlFor(s,c,searchCore.paraKey(n)))+'">'+html(shortRef(s,c,n))+'</a>').join('')+
      (limit&&items.length>limit?'<a class="chip more" data-link="1" href="#/upcoming">+'+(items.length-limit)+' till</a>':'')+'</div></div>').join('')+'</div>';
  }
  // Nytt i lagen: vad den månatliga importen har ändrat (data/changes.json) och vad som snart träder i kraft.
  async function loadChanges(){
    if(!state.changes){try{state.changes=await fetchJson('data/changes.json');}catch(_){state.changes=[];}}
    return state.changes;
  }
  function unseenNews(){
    const list=state.changes||[];return list.filter(c=>c.date>(pref.newsSeen||'')).length;
  }
  async function newsPage(){
    const list=(await loadChanges()).slice().reverse();
    const favLaws=new Set(pref.favourites.map(t=>t.split('|')[0]).concat(Object.keys(pref.watch||{})));
    const label=k=>(k[0]&&k[0]!=='0'?k[0]+' kap. ':'')+k[1]+' §';
    const row=c=>{
      const meta=lawById(c.sfs);if(!meta)return '';
      const parts=[c.new?'Ny i lagboken':'',c.changed.length?'Ändrade: '+c.changed.slice(0,8).map(label).join(', ')+(c.changed.length>8?' …':''):'',
        c.added.length?'Nya: '+c.added.slice(0,6).map(label).join(', ')+(c.added.length>6?' …':''):'',c.removed.length?'Borttagna: '+c.removed.slice(0,6).map(label).join(', '):''].filter(Boolean).join(' · ');
      const first=c.changed[0]||c.added[0];
      return '<a class="list-row" data-link="1" href="'+attr(first?urlFor(c.sfs,first[0],searchCore.paraKey(first[1])):urlFor(c.sfs))+'">'+
        (favLaws.has(c.sfs)?'<span class="pill">★</span>':'')+'<div class="grow"><div class="row-title">'+html(meta.name)+'</div><div class="row-sub">'+html(parts)+
        (c.amendedBy?' · SFS '+html(c.amendedBy):'')+'</div></div><span class="chevron">›</span></a>';
    };
    const mine=list.filter(c=>favLaws.has(c.sfs)),rest=list.filter(c=>!favLaws.has(c.sfs));
    const byDate=new Map();for(const c of rest.slice(0,300)){if(!byDate.has(c.date))byDate.set(c.date,[]);byDate.get(c.date).push(c);}
    const soon=(await upcomingFor(null)).filter(u=>u[0]&&u[0]<=lawModel.today().replace(/^(\d{4})/,y=>String(Number(y)+1)));
    pref.newsSeen=lawModel.today();savePrefs();updateNavBadge();
    return '<div class="page"><h1 class="page-title">Nytt i lagen</h1><p class="intro">Ändringar som Lagboken har hämtat från riksdagen.se, senaste först, och lydelser som träder i kraft det närmaste året.</p>'+
      (mine.length?'<div class="section-title">Dina favoriter och bevakningar</div><div class="card-list">'+mine.slice(0,40).map(row).join('')+'</div>':'')+
      (soon.length?'<div class="section-title">Träder i kraft snart</div>'+timeline(soon,8):'')+
      [...byDate].map(([d,cs])=>'<div class="section-title">'+html(lawModel.formatDate(d))+' · '+cs.length+' författningar</div><div class="card-list">'+cs.slice(0,60).map(row).join('')+
        (cs.length>60?'<div class="empty">… och '+(cs.length-60)+' till</div>':'')+'</div>').join('')+
      (list.length?'':'<div class="empty">Inga ändringar har registrerats ännu. Listan fylls på vid nästa månadsimport.</div>')+footer()+'</div>';
  }
  async function upcomingPage(){
    const future=await upcomingFor(null);
    return '<div class="page"><h1 class="page-title">Kommande ändringar</h1><p class="intro">Paragrafer i lagboken med en ny lydelse som ännu inte har trätt i kraft, enligt markeringarna på riksdagen.se.</p>'+
      (future.length?timeline(future):'<div class="empty">Inga kommande ändringar är kända.</div>')+footer()+'</div>';
  }
  // ---------- 0.6: överstrykningar ----------
  let hlBar=null;
  function highlightBar(){
    if(hlBar)return hlBar;
    hlBar=document.createElement('div');hlBar.className='hl-bar';hlBar.hidden=true;
    hlBar.innerHTML=highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+'" data-action="hl-add" data-color="'+c+'" aria-label="Stryk under med '+label.toLowerCase()+'"></button>').join('')+
      '<button type="button" class="hl-note-button" data-action="hl-add-note">Anteckning</button>';
    // Behåll markeringen när knapparna trycks på iPhone.
    hlBar.addEventListener('pointerdown',e=>e.preventDefault());hlBar.addEventListener('mousedown',e=>e.preventDefault());
    document.body.appendChild(hlBar);return hlBar;
  }
  function hideHighlightBar(){if(hlBar)hlBar.hidden=true;state.pendingHighlight=null;}
  function onSelection(){
    const sel=window.getSelection&&window.getSelection();
    if(!sel||!sel.rangeCount||sel.isCollapsed){hideHighlightBar();return;}
    const range=sel.getRangeAt(0),node=range.commonAncestorContainer;
    const el=node.nodeType===1?node:node.parentElement;
    const content=el&&el.closest&&el.closest('.paragraph-content');
    const article=content&&content.parentElement;
    if(!content||!article||!article.classList.contains('paragraph')||!view.contains(article)){hideHighlightBar();return;}
    const pos=highlights.offsets(content,range);
    if(!pos){hideHighlightBar();return;}
    const quote=content.textContent.slice(pos.start,pos.end);
    if(!quote.trim()){hideHighlightBar();return;}
    state.pendingHighlight={key:article.dataset.key,start:pos.start,end:pos.end,quote};
    highlightBar().hidden=false;
  }
  function addHighlight(color,withNote){
    const p=state.pendingHighlight;if(!p)return;
    const h=createHighlight(p.key,p.start,p.end,p.quote,color);
    const sel=window.getSelection&&window.getSelection();if(sel)sel.removeAllRanges();
    hideHighlightBar();renderKeep().then(()=>{if(withNote)highlightSheet(p.key,h.id,true);});
  }
  function createHighlight(key,start,end,quote,color){
    const h={id:Date.now().toString(36),start,end,quote,color,note:'',created:lawModel.today()};
    (pref.highlights[key]=pref.highlights[key]||[]).push(h);pref.lastColor=color;savePrefs();state.newHighlight=h.id;
    toast('Markerat',()=>{pref.highlights[key]=(pref.highlights[key]||[]).filter(x=>x.id!==h.id);if(!pref.highlights[key].length)delete pref.highlights[key];savePrefs();renderKeep();});
    return h;
  }
  // Liten ruta vid markeringen: färg, anteckning och ta bort.
  function highlightSheet(key,id,openNote){
    const h=(pref.highlights[key]||[]).find(x=>x.id===id);if(!h)return;
    const mark=document.querySelector&&document.querySelector('mark.hl[data-hl="'+id+'"]');
    if(mark&&mark.getBoundingClientRect&&window.innerHeight){
      closePopover();
      const pop=document.createElement('div');pop.className='hl-pop';pop.setAttribute('role','dialog');
      pop.innerHTML='<div class="hl-pop-row">'+highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+(h.color===c?' selected':'')+'" data-action="hl-pop-color" data-color="'+c+'" data-id="'+attr(id)+'" data-key="'+attr(key)+'" aria-label="'+label+'"></button>').join('')+
        '<button type="button" class="hl-pop-button" data-action="hl-pop-note">✎ Anteckning</button><button type="button" class="hl-pop-button danger" data-action="hl-pop-remove" data-id="'+attr(id)+'" data-key="'+attr(key)+'" aria-label="Ta bort markering">Ta bort</button></div>'+
        '<div class="hl-pop-note"'+(openNote||h.note?'':' hidden')+'><textarea rows="2" placeholder="Anteckning till markeringen …">'+html(h.note||'')+'</textarea>'+
        '<button type="button" class="button primary" data-action="hl-pop-save" data-id="'+attr(id)+'" data-key="'+attr(key)+'">Spara</button></div>';
      document.body.appendChild(pop);
      const r=mark.getBoundingClientRect(),w=Math.min(340,window.innerWidth-24);
      pop.style.width=w+'px';
      pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12,r.left+r.width/2-w/2))+'px';
      const below=r.bottom+10,height=pop.offsetHeight||120;
      pop.style.top=(below+height>window.innerHeight-80?Math.max(60,r.top-height-10):below)+'px';
      if(openNote){const f=pop.querySelector('textarea');if(f)f.focus();}
      return;
    }
    showSheet('<div class="sheet-title">Markering <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">'+html(favTitle(key))+'</p><blockquote class="hl-quote hl-'+attr(h.color)+'">'+html(h.quote)+'</blockquote>'+
      '<div class="hl-colors">'+highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+(h.color===c?' selected':'')+'" data-action="hl-color" data-color="'+c+'" data-id="'+attr(id)+'" data-key="'+attr(key)+'" aria-label="'+label+'"></button>').join('')+'</div>'+
      '<div class="field"><label for="hl-note">Anteckning till markeringen</label><textarea id="hl-note" placeholder="Valfri anteckning …">'+html(h.note||'')+'</textarea></div>'+
      '<div class="actions"><button type="button" class="button primary" data-action="hl-save-note" data-id="'+attr(id)+'" data-key="'+attr(key)+'">Spara</button>'+
      '<button type="button" class="button" data-action="hl-remove" data-id="'+attr(id)+'" data-key="'+attr(key)+'">Ta bort markering</button></div>',false);
  }
  function closePopover(){$$('.hl-pop').forEach(x=>x.remove());}
  function updateHighlight(key,id,changes){
    const h=(pref.highlights[key]||[]).find(x=>x.id===id);if(!h)return;
    Object.assign(h,changes);savePrefs();closeSheet();closePopover();renderKeep();if('note' in changes)toast('Anteckningen är sparad');
  }
  function removeHighlight(key,id){
    const list=pref.highlights[key]||[],removed=list.find(x=>x.id===id);
    pref.highlights[key]=list.filter(x=>x.id!==id);
    if(!pref.highlights[key].length)delete pref.highlights[key];
    savePrefs();closeSheet();closePopover();renderKeep();
    if(removed)toast('Markeringen är borttagen',()=>{(pref.highlights[key]=pref.highlights[key]||[]).push(removed);savePrefs();renderKeep();});
  }
  // ---------- 0.7: penna – tryck på första och sista ordet för att markera ----------
  let penBar=null;
  function updatePenBar(){
    if(!penBar){
      penBar=document.createElement('div');penBar.className='hl-bar pen-bar';
      document.body.appendChild(penBar);
    }
    penBar.hidden=!state.pen;
    penBar.innerHTML='<span class="pen-hint">'+(state.penAnchor?'Tryck på sista ordet':'Dra över texten')+'</span>'+
      highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+(pref.lastColor===c?' selected':'')+'" data-action="pen-color" data-color="'+c+'" aria-label="'+label+'"></button>').join('')+
      '<button type="button" class="hl-note-button" data-action="pen-done">Klar</button>';
  }
  function togglePen(){
    state.pen=!state.pen;state.penAnchor=null;
    document.documentElement.dataset.pen=state.pen?'on':'off';
    hideHighlightBar();updatePenBar();syncLawTools();renderKeep();
    if(state.pen)toast('Penna på: dra över texten, eller tryck på första och sista ordet');
  }
  function caretAt(x,y){
    if(document.caretRangeFromPoint)return document.caretRangeFromPoint(x,y);
    if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(!p)return null;const r=document.createRange();r.setStart(p.offsetNode,p.offset);return r;}
    return null;
  }
  // Ordets gränser runt en tryckpunkt, som teckenpositioner i paragrafens text.
  function wordAt(content,e){
    const caret=caretAt(e.clientX,e.clientY);
    if(!caret||!content.contains(caret.startContainer))return null;
    const probe=document.createRange();probe.setStart(caret.startContainer,caret.startOffset);probe.setEnd(caret.startContainer,caret.startOffset);
    let pos=null,offset=0;
    for(const node of highlights.textNodes(content)){if(node===caret.startContainer){pos=offset+caret.startOffset;break;}offset+=node.data.length;}
    if(pos==null)return null;
    const text=content.textContent,isWord=c=>/[\p{L}\p{N}§-]/u.test(c||'');
    let start=pos,end=pos;
    if(!isWord(text[start])&&isWord(text[start-1]))start--;
    while(start>0&&isWord(text[start-1]))start--;
    while(end<text.length&&isWord(text[end]))end++;
    return end>start?{start,end}:null;
  }
  function penTap(e,content){
    const article=content.parentElement,key=article.dataset.key,w=wordAt(content,e);
    if(!w)return;
    const a=state.penAnchor;
    if(!a||a.key!==key){
      state.penAnchor={key,start:w.start,end:w.end};
      $$('mark.pen-anchor').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);m.remove();});
      highlights.wrap(content,w.start,w.end,()=>{const m=document.createElement('mark');m.className='pen-anchor';return m;});
      updatePenBar();return;
    }
    const start=Math.min(a.start,w.start),end=Math.max(a.end,w.end);
    state.penAnchor=null;
    $$('mark.pen-anchor').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);m.remove();});
    const text=content.textContent;
    createHighlight(key,start,end,text.slice(start,end),pref.lastColor||'yellow');
    renderKeep().then(updatePenBar);
  }
  // Dra med pennan: ett drag över texten markerar direkt, ett tryck fungerar som förut (första och sista ordet).
  // Vågräta drag tillhör pennan, lodräta rullar sidan (touch-action: pan-y i pennläge).
  let penDrag=null,penDragEnded=0;
  function clearPenAnchor(){$$('mark.pen-anchor').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);m.remove();});}
  document.addEventListener('pointerdown',e=>{
    if(!state.pen||e.button>0||e.target.closest('mark.hl'))return;
    const content=e.target.closest('.paragraph-content');
    if(!content||!content.parentElement||!content.parentElement.classList.contains('paragraph')||!view.contains(content))return;
    const w=wordAt(content,e);if(!w)return;
    penDrag={content,key:content.parentElement.dataset.key,x:e.clientX,y:e.clientY,first:w,last:w,moving:false};
  });
  document.addEventListener('pointermove',e=>{
    const d=penDrag;if(!d)return;
    if(!d.moving){
      if(Math.abs(e.clientX-d.x)<10&&Math.abs(e.clientY-d.y)<10)return;
      if(Math.abs(e.clientY-d.y)>Math.abs(e.clientX-d.x)*1.5&&e.pointerType==='touch'){penDrag=null;return;}
      d.moving=true;state.penAnchor=null;
    }
    const w=wordAt(d.content,e);if(w)d.last=w;
    clearPenAnchor();
    const start=Math.min(d.first.start,d.last.start),end=Math.max(d.first.end,d.last.end);
    highlights.wrap(d.content,start,end,()=>{const m=document.createElement('mark');m.className='pen-anchor';return m;});
  });
  function endPenDrag(cancel){
    const d=penDrag;penDrag=null;if(!d||!d.moving)return;
    penDragEnded=Date.now();clearPenAnchor();
    if(cancel)return;
    const start=Math.min(d.first.start,d.last.start),end=Math.max(d.first.end,d.last.end);
    createHighlight(d.key,start,end,d.content.textContent.slice(start,end),pref.lastColor||'yellow');
    renderKeep().then(updatePenBar);
  }
  document.addEventListener('pointerup',()=>endPenDrag(false));
  document.addEventListener('pointercancel',()=>endPenDrag(true));
  function applyHighlights(){
    if(typeof view.querySelectorAll!=='function'||!highlights)return;
    for(const article of view.querySelectorAll('article.paragraph[data-key]')){
      const list=pref.highlights[article.dataset.key];if(!list||!list.length)continue;
      const content=article.querySelector(':scope > .paragraph-content');if(!content)continue;
      const text=content.textContent;
      for(const h of list){
        const at=highlights.locate(text,h);
        if(!at){article.classList.add('has-stale-highlight');continue;}
        highlights.wrap(content,at.start,at.end,()=>{const m=document.createElement('mark');m.className='hl hl-'+h.color+(h.note?' has-note':'')+(state.newHighlight===h.id?' hl-new':'');m.dataset.hl=h.id;m.dataset.key=article.dataset.key;return m;});
      }
    }
  }
  function clearNewHighlight(){setTimeout(()=>{state.newHighlight=null;},400);}
  // Markerar sökorden i paragrafen som öppnades från en sökträff.
  function applySearchMarks(){
    const m=state.markTerms;
    if(!m||m.hash!==location.hash||typeof view.querySelector!=='function'||!highlights)return;
    const r=route(),article=r.paragraph&&$('#p-'+CSS.escape(searchCore.paraKey(r.paragraph)));
    const content=article&&article.querySelector&&article.querySelector(':scope > .paragraph-content');
    if(!content)return;
    const folded=window.LagbokIndex.fold(content.textContent),ranges=[];
    for(const t of m.tokens){const re=new RegExp('(^|[^a-z0-9])('+t+'[a-z0-9]*)','g');let x;while((x=re.exec(folded))){const s=x.index+x[1].length;ranges.push([s,s+x[2].length]);}}
    ranges.sort((a,b)=>b[0]-a[0]).forEach(([s,e])=>highlights.wrap(content,s,e,()=>{const el=document.createElement('mark');el.className='search-hit';return el;}));
  }
  // Kort övergång när en ny vy visas: in från höger framåt, från vänster bakåt, övertoning mellan flikar.
  function animateView(dir){
    if(!dir||!view.classList||typeof view.classList.remove!=='function')return;
    const cls={forward:'anim-forward',back:'anim-back',fade:'anim-fade'}[dir];if(!cls)return;
    view.classList.remove('anim-forward','anim-back','anim-fade');void view.offsetWidth;view.classList.add(cls);
    clearTimeout(animateView.t);animateView.t=setTimeout(()=>view.classList.remove(cls),320);
  }
  function skeleton(){
    const line=w=>'<span class="sk-line" style="width:'+w+'%"></span>';
    return '<div class="skeleton" aria-label="Hämtar författning" role="status"><span class="sk-title"></span>'+
      [0,1,2].map(()=>'<div class="sk-para"><span class="sk-num"></span>'+line(96)+line(92)+line(98)+line(64)+'</div>').join('')+'</div>';
  }
  // Katalogsidan sparas så att nästa start kan visa den innan skripten har lästs in.
  let snapTimer=null;
  function saveSnapshot(markup){
    clearTimeout(snapTimer);
    snapTimer=setTimeout(()=>{try{localStorage.setItem('lagboken-snapshot',markup);}catch(_){}},800);
  }
  // Starttid mätt i telefonen (från att appen öppnas tills katalogen syns och tills appen är klar); visas under Inställningar.
  function noteStart(){
    const t=window.LAGBOK_T||{},ready=Math.round(performance.now());
    const shown=Math.round(t.paint||ready);
    try{localStorage.setItem('lagboken-start',JSON.stringify({shown,ready,snapshot:!!t.snapshot,at:new Date().toISOString()}));}catch(_){}
  }
  function startTime(){
    let s=null;try{s=JSON.parse(localStorage.getItem('lagboken-start')||'null');}catch(_){}
    return s?'Senaste start: katalogen syntes efter '+s.shown+' ms, appen klar efter '+s.ready+' ms.':'';
  }
  function renderKeep(){const position=view.scrollTop;return Promise.resolve(render(false,true)).then(()=>{view.scrollTop=position;});}
  // ---------- 0.6: svep mellan kapitel ----------
  let swipe=null;
  function chapterStep(dir){
    const r=route(),data=state.laws.get(r.sfs);if(r.page!=='law'||!data||r.chapter==null)return;
    const i=data.chapters.findIndex(c=>c.number===r.chapter),next=data.chapters[i+dir];
    if(next){navigate(urlFor(r.sfs,next.number));toast(next.number==='0'?'':next.number+' kap.'+(next.title?' '+next.title:''));}
  }
  // Kommer ihåg var i varje författning man läste senast.
  function rememberPosition(){
    clearTimeout(rememberPosition.t);
    rememberPosition.t=setTimeout(()=>{
      const r=route();if(r.page!=='law'||!lawById(r.sfs)||r.chapter==null)return;
      pref.readPos[r.sfs]={chapter:r.chapter,para:state.visibleParagraph||r.paragraph||null};
      pref.lastRead=r.sfs;savePrefs();
    },700);
  }
  // Sidans stora rubrik krymper in i rubrikraden när man scrollar, som i iPhones egna appar.
  let titlePending=false;
  view.addEventListener('scroll',()=>{
    if(titlePending||typeof view.querySelector!=='function')return;titlePending=true;
    requestAnimationFrame(()=>{
      titlePending=false;
      const big=view.querySelector('.page-title,.law-head h1,.reader-heading h1');
      const top=$('.topbar');if(!top||!top.classList)return;
      const hidden=!big||big.getBoundingClientRect().bottom<view.getBoundingClientRect().top+8;
      top.classList.toggle('titled',hidden);
    });
  },{passive:true});
  let readerScrollPending=false;
  view.addEventListener('scroll',()=>{
    if(route().page!=='law'||readerScrollPending||typeof view.querySelectorAll!=='function')return;
    readerScrollPending=true;
    requestAnimationFrame(()=>{
      readerScrollPending=false;
      const paragraphs=view.querySelectorAll('.paragraph');
      if(!paragraphs||!paragraphs.length)return;
      const top=view.getBoundingClientRect().top+80;
      for(const el of paragraphs){
        if(el.getBoundingClientRect().bottom>top){
          state.visibleParagraph=el.dataset.paragraph;
          rememberPosition();
          if(isWide())updateWide();
          break;
        }
      }
    });
  },{passive:true});
  document.addEventListener('toggle',e=>{
    const d=e.target;if(!d||!d.dataset||!d.dataset.appendix||!d.open)return;
    const body=d.querySelector('.appendix-body');if(!body||body.dataset.filled)return;
    const r=route(),meta=lawById(r.sfs),data=state.laws.get(r.sfs);if(!meta||!data)return;
    body.dataset.filled='1';body.innerHTML='<div class="paragraph-content">'+textHtml(data.appendix,meta,{number:'0'})+'</div>';
  },true);
  document.addEventListener('selectionchange',()=>{clearTimeout(onSelection.t);onSelection.t=setTimeout(onSelection,120);});
  // Svep från vänsterkanten för att gå tillbaka, som i iPhones egna appar.
  let edge=null;
  document.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    edge=(e.touches.length===1&&t.clientX<24&&!$('#back').hidden&&sheet.hidden)?{x:t.clientX,y:t.clientY,t:Date.now()}:null;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!edge||!e.changedTouches.length)return;
    const t=e.changedTouches[0],dx=t.clientX-edge.x,dy=Math.abs(t.clientY-edge.y),dt=Date.now()-edge.t;edge=null;
    if(dx>70&&dy<60&&dt<700)back();
  },{passive:true});
  // Dra ned menyer och innehållsförteckning för att stänga dem.
  let drag=null;
  sheet.addEventListener('touchstart',e=>{
    const handle=e.target.closest('.sheet-title,.toc-header,.sheet-grabber');
    drag=handle&&e.touches.length===1?{y:e.touches[0].clientY,dy:0}:null;
  },{passive:true});
  sheet.addEventListener('touchmove',e=>{
    if(!drag)return;drag.dy=Math.max(0,e.touches[0].clientY-drag.y);sheet.classList.add('dragging');sheet.style.translate='0 '+drag.dy+'px';
  },{passive:true});
  sheet.addEventListener('touchend',()=>{
    if(!drag)return;const close=drag.dy>90;drag=null;
    sheet.classList.remove('dragging');
    if(close)closeSheet();else sheet.style.translate='';
  },{passive:true});
  view.addEventListener('touchstart',e=>{
    if(route().page!=='law'||e.touches.length!==1||e.touches[0].clientX<30)return;
    swipe={x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()};
  },{passive:true});
  view.addEventListener('touchend',e=>{
    if(!swipe||!e.changedTouches.length)return;
    const dx=e.changedTouches[0].clientX-swipe.x,dy=e.changedTouches[0].clientY-swipe.y,dt=Date.now()-swipe.t;swipe=null;
    const sel=window.getSelection&&window.getSelection();
    if(dt<600&&Math.abs(dx)>90&&Math.abs(dy)<45&&(!sel||sel.isCollapsed))chapterStep(dx<0?1:-1);
  },{passive:true});
  view.addEventListener('input',e=>{
    if(e.target.id==='find-input'){clearTimeout(runFind.t);const v=e.target.value;
      if(state.find&&state.find.scope==='all'){state.find.q=v;runFind.t=setTimeout(()=>runAll(v),180);return;}
      runFind.t=setTimeout(()=>runFind(v),180);return;}
    if(e.target.classList&&e.target.classList.contains('note-input')){
      const k=e.target.dataset.noteKey,v=e.target.value;clearTimeout(saveNote.t);saveNote.t=setTimeout(()=>saveNote(k,v,true),400);return;
    }
    if(e.target.id==='marks-query'){state.marksQuery=e.target.value;const box=$('#marks-list');if(box)box.innerHTML=marksHtml();return;}
    if(e.target.id==='query'||e.target.id==='fap-query')onSearch(e.target.value);
  });
  view.addEventListener('submit',async e=>{
    if(e.target.id==='find-form'){
      e.preventDefault();const q=$('#find-input').value;if(!state.find)return;
      // Ett lagrum ("2:1", "3 §", "rb 23 8b") öppnas direkt; annars hoppar Enter till nästa träff.
      if(/\d/.test(q)){const meta=lawById(state.find.sfs),bare=q.replace(/kap\.?|§/g,' ').trim();
        if(await goQuick(q)||(meta&&abbrOf(meta)&&/^\d/.test(bare)&&await goQuick(abbrOf(meta)+' '+bare))){state.find=null;return;}}
      if(state.find.scope==='all'){state.find.q=q;const i=$('#find-input');if(i)i.blur();return;}
      if(q!==state.find.q)runFind(q);
      stepFind(1);return;
    }
    if(e.target.id!=='global-search')return;
    e.preventDefault();
    const field=$('#query');if(!field)return;
    const val=field.value.trim();if(!val)return;
    const done=await goQuick(val);
    if(!done){onSearch(val);const sug=$('#search-suggest');if(sug)sug.hidden=true;}
    field.blur();
  });
  view.addEventListener('keydown',e=>{
    if(e.target.id==='query'&&e.key==='ArrowDown'){
      const first=$('.suggestion');if(first){e.preventDefault();first.focus();}
    }else if(e.target.classList.contains('suggestion')&&['ArrowDown','ArrowUp'].includes(e.key)){
      e.preventDefault();const list=$('.suggestion'),index=list.indexOf(e.target);
      const next=list[index+(e.key==='ArrowDown'?1:-1)];if(next)next.focus();else $('#query')?.focus();
    }
  });
  sheet.addEventListener('submit',e=>{
    if(e.target.id!=='jump-form')return;e.preventDefault();
    const q=$('#jump-query').value.trim();if(!q)return;
    goQuick(q).then(done=>{if(!done){closeSheet();state.query=q;navigate('#/catalog');}});
  });
  sheet.addEventListener('input',e=>{
    if(e.target.id==='jump-query'){$('#jump-results').innerHTML=jumpResults(e.target.value);return;}
    if(e.target.id==='local-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(meta&&doc)$('#local-results').innerHTML=lawSearchResults(doc,meta,e.target.value);
    }
    if(e.target.id==='toc-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(doc&&meta){$('#toc-results').innerHTML=tocEntries(meta,doc,r,e.target.value);$('#toc-results').scrollTop=0;}
    }
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='size'){document.documentElement.style.setProperty('--fontscale',e.target.value);const v=$('#size-value');if(v)v.textContent=Math.round(e.target.value*100)+' %';}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='import-file'){const f=e.target.files&&e.target.files[0];if(f)importData(f);e.target.value='';return;}
    if(e.target.dataset.setting){
      const key=e.target.dataset.setting;
      pref[key]=(key==='theme'||key==='readingMode'||key==='focusReader'||key==='fontFamily')?e.target.value:Number(e.target.value);
      if(key==='focusReader')state.focus=(e.target.value==='on');
      if(key==='theme')pref.themeChosen=true;
      savePrefs();applyPrefs();toast('Inställning sparad');
    }
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.hl-pop')&&!e.target.closest('mark.hl'))closePopover();
    const close=e.target.closest('[data-action="close"]'); if(close){closeSheet();return;}
    if(state.pen&&Date.now()-penDragEnded<500&&e.target.closest('.paragraph-content')){e.preventDefault();return;}
    if(state.pen&&!e.target.closest('mark.hl')){
      const content=e.target.closest('.paragraph-content');
      if(content&&content.parentElement&&content.parentElement.classList.contains('paragraph')&&view.contains(content)){e.preventDefault();penTap(e,content);return;}
    }
    const reference=e.target.closest('[data-ref]');if(reference){e.preventDefault();followRef(reference);return;}
    const quickAnchor=e.target.closest('[data-quick]');if(quickAnchor){e.preventDefault();goQuick(quickAnchor.dataset.quick);return;}
    const mark=e.target.closest('mark.hl');if(mark&&!e.target.closest('a')){highlightSheet(mark.dataset.key,mark.dataset.hl);return;}
    const anchor=e.target.closest('a[data-link]');
    if(anchor){e.preventDefault();const dest=anchor.getAttribute('href');if(dest==='#/fap')state.query='';
      const terms=anchor.dataset&&anchor.dataset.terms;state.markTerms=terms?{hash:dest,tokens:terms.split(' ')}:null;
      const title=anchor.querySelector&&/^#\/law\/[^/]+$/.test(dest)?anchor.querySelector('.row-title'):null;
      state.sharedTitle=title||null;
      navigate(dest);return;}
    const btn=e.target.closest('[data-action]');
    if(!btn)return;
    const a=btn.dataset.action,k=btn.dataset.key;
    if(a==='clear-search'){const field=$('#query');if(field){field.value='';onSearch('');field.focus();}return;}
    if(a==='para-menu'){paraMenu(k);return;}
    if(a==='source-info'){sourceInfo();return;}
    if(a==='read-mode'){changeReaderMode(btn.dataset.mode);return;}
    if(a==='toggle-focus'){toggleFocus();return;}
    if(a==='fav')favToggle(k);
    if(a==='copy')copyParagraph(k);
    if(a==='note')note(k);
    if(a==='save-note'){
      const field=$('#note-text');
      if(field){const t=field.value.trim();if(t)pref.notes[k]=t;else delete pref.notes[k];savePrefs();closeSheet();const position=view.scrollTop;Promise.resolve(render(false)).then(()=>{view.scrollTop=position;});toast('Anteckning sparad');}
    }
    if(a==='toc')toc();
    if(a==='find-open'){if(state.find&&state.find.sfs===route().sfs){state.find=null;clearFindMarks();renderKeep();}else openFind();return;}
    if(a==='find-scope'){const f=state.find;if(!f)return;const input=$('#find-input');if(input)f.q=input.value;
      f.scope=btn.dataset.scope==='all'?'all':'law';clearFindMarks();
      if(f.scope==='law')runFind(f.q);
      renderKeep().then(()=>{const i=$('#find-input');if(i&&!f.q)i.focus();});return;}
    if(a==='find-next'){stepFind(1);return;}
    if(a==='find-prev'){stepFind(-1);return;}
    if(a==='find-close'){state.find=null;renderKeep();return;}
    if(a==='offline-clear'){if(window.caches&&window.confirm('Ta bort nedladdad lagtext från telefonen? Dina markeringar och anteckningar påverkas inte.'))caches.delete(DATA_CACHE).then(()=>{toast('Offlinedata är borttagen');offlineStatus();});return;}
    if(a==='check-update'&&DESKTOP&&window.LagbokDesktop){window.LagbokDesktop.checkUpdate();return;}
    if(a==='check-update'){if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration)navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).then(()=>toast('Du har den senaste versionen om inget meddelande visas')).catch(()=>{});else location.reload();return;}
    if(a==='toast-undo'){const fn=toast.undo;$('#toast').hidden=true;toast.undo=null;if(fn)fn();return;}
    if(a==='note-done'){const f=$('textarea.note-input');if(f)saveNote(k,f.value);state.editingNote=null;renderKeep();return;}
    if(a==='pen'){togglePen();return;}
    if(a==='pen-color'){pref.lastColor=btn.dataset.color;savePrefs();updatePenBar();return;}
    if(a==='pen-done'){if(state.pen)togglePen();return;}
    if(a==='hl-pop-color'){updateHighlight(k,btn.dataset.id,{color:btn.dataset.color});pref.lastColor=btn.dataset.color;savePrefs();return;}
    if(a==='hl-pop-note'){const box=$('.hl-pop-note');if(box){box.hidden=!box.hidden;const f=$('.hl-pop-note textarea');if(f&&!box.hidden)f.focus();}return;}
    if(a==='hl-pop-save'){const f=$('.hl-pop-note textarea');updateHighlight(k,btn.dataset.id,{note:f?f.value.trim():''});return;}
    if(a==='hl-pop-remove'){removeHighlight(k,btn.dataset.id);return;}
    if(a==='marks-filter'){state.marksFilter=state.marksFilter===btn.dataset.id?'':btn.dataset.id;renderKeep();return;}
    if(a==='search-filter'){state.searchFilter=btn.dataset.id;if(state.find&&state.find.scope==='all')runAll(state.find.q);else onSearch(state.query);return;}
    if(a==='jump'){quickJump();return;}
    if(a==='jump-all'){e.preventDefault();closeSheet();state.query=btn.dataset.q;navigate('#/catalog');return;}
    if(a==='collection-text'){collectionText(btn.dataset.id);return;}
    if(a==='collection-print'){window.print();return;}
    if(a==='return'){history.back();return;}
    if(a==='offline'){downloadAll(btn.dataset.area||null);return;}
    if(a==='fav-edit'){state.editFavs=!state.editFavs;renderKeep();return;}
    if(a==='show-sections'){state.showSections=!state.showSections;renderKeep();return;}
    if(a==='fav-move'){if(!pref.favOrdered){const use=t=>pref.usage[t.split('|')[0]]||0;const lists=pref.favourites.filter(t=>t.split('|').length<=2).map((t,i)=>[t,i]).sort((a,b)=>use(b[0])-use(a[0])||a[1]-b[1]).map(x=>x[0]);
      pref.favourites=lists.concat(pref.favourites.filter(t=>t.split('|').length>2));pref.favOrdered=true;}
      const i=pref.favourites.indexOf(k);if(i>0){const list=pref.favourites.filter(t=>t.split('|').length<=2);const j=list.indexOf(k);
      if(j>0){const prev=list[j-1],pi=pref.favourites.indexOf(prev);pref.favourites[pi]=k;pref.favourites[i]=prev;savePrefs();renderKeep();}}return;}
    if(a==='open-section'){const d=$('#sec-'+CSS.escape(btn.dataset.id));if(d){d.open=true;fillSection(d);d.scrollIntoView({block:'start',behavior:'smooth'});}return;}
    if(a==='letter'){const t=$('#letter-'+CSS.escape(btn.dataset.id));if(t)t.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(a==='report'){reportError(k);return;}
    if(a==='show-regs'){showRegs(k);return;}
    if(a==='tutorial'){if(window.LagbokTutorial)window.LagbokTutorial.show();return;}
    if(a==='date-clear'){setAtDate(null);return;}
    if(a==='date-change'){showDatePicker(route().sfs);return;}
    if(a==='history'){closeSheet();showDatePicker(k);return;}
    if(a==='copy-ref'){const [id,cap,num]=k.split('|');copyText(shortRef(id,cap,num),'Hänvisning kopierad');return;}
    if(a==='share'){shareRef(k);return;}
    if(a==='collect'){collectSheet(k);return;}
    if(a==='collect-into'){addToCollection(btn.dataset.id,k);return;}
    if(a==='collect-new'){const f=$('#collection-name');const name=f&&f.value.trim();if(!name){toast('Skriv ett namn på samlingen');return;}
      const c={id:Date.now().toString(36),name,items:[]};pref.collections.push(c);addToCollection(c.id,k);return;}
    if(a==='collect-remove'){removeFromCollection(btn.dataset.id,k);return;}
    if(a==='collection-rename'){renameCollection(btn.dataset.id);return;}
    if(a==='collection-delete'){deleteCollection(btn.dataset.id);return;}
    if(a==='backlinks'){backlinksSheet(k);return;}
    if(a==='watch'){toggleWatch(k);return;}
    if(a==='watch-ack'){acknowledge(k);return;}
    if(a==='hl-add'){addHighlight(btn.dataset.color,false);return;}
    if(a==='hl-add-note'){addHighlight('yellow',true);return;}
    if(a==='hl-color'){updateHighlight(k,btn.dataset.id,{color:btn.dataset.color});return;}
    if(a==='hl-save-note'){const f=$('#hl-note');updateHighlight(k,btn.dataset.id,{note:f?f.value.trim():''});return;}
    if(a==='hl-remove'){removeHighlight(k,btn.dataset.id);return;}
    if(a==='export'){exportData();return;}
    if(a==='import'){const input=$('#import-file');if(input)input.click();return;}
    if(a==='find-local')findWithinLaw();
  });
  view.addEventListener('change',e=>{
    if(e.target.id==='jump-para'){
      const r=route();if(e.target.value)navigate(urlFor(r.sfs,r.chapter,searchCore.paraKey(e.target.value)));
    }
  });
  $$('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{state.query='';state.navDir='fade';navigate('#/'+b.dataset.tab);}));
  $('#back').addEventListener('click',()=>{if(history.length>1)history.back();else navigate('#/catalog');});
  $('#menu-button').addEventListener('click',()=>sheet.hidden?menu():closeSheet());
  $('#toc-button').addEventListener('click',toc);
  $('#in-law-search').addEventListener('click',quickJump);
  scrim.addEventListener('click',closeSheet);
  window.addEventListener('popstate',()=>{closeSheet();state.navDir='back';render(false);});
  window.addEventListener('hashchange',()=>{closeSheet();render(false);});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
  // Avdelningar i katalogen: fylls när de öppnas, och appen minns vilka som är öppna.
  document.addEventListener('toggle',e=>{
    const d=e.target;if(!d||!d.classList||!d.classList.contains('cat-section'))return;
    if(d.open)fillSection(d);
    const id=d.dataset.section,set=new Set(pref.openSections||[]);
    if(d.open)set.add(id);else set.delete(id);
    pref.openSections=[...set];savePrefs();
  },true);
  if(window.matchMedia){window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPrefs);}
  // Ny version: när en ny service worker tar över visas en rad som laddar om appen.
  function registerWorker(){
    // I Windows-appen ligger allt redan på datorn; nya versioner kommer genom appens uppdateringar.
    if(DESKTOP||!('serviceWorker' in navigator))return;
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)showUpdateBanner();});
    // Service workern svarar från sparade kopior och meddelar när nätet har något nyare.
    navigator.serviceWorker.addEventListener('message',e=>{
      const msg=e.data||{};
      if(msg.type==='shell-updated')showUpdateBanner();
      if(msg.type==='catalog-updated')loadCatalog().then(()=>renderKeep()).catch(()=>{});
      // En lag eller dess hänvisningar har ändrats sedan den sparade kopian visades: läs om och rita om på plats.
      const changed=msg.type==='data-updated'&&/^data\/(?:laws|index\/backlinks)\/(.+)\.json$/.exec(msg.path||'');
      if(changed){
        const id=[...state.laws.keys(),...state.loading.keys()].find(x=>sfsFile(x)===changed[1]);
        if(id)Promise.resolve(state.loading.get(id)).catch(()=>{}).then(()=>{state.laws.delete(id);return loadLaw(id);})
          .then(()=>{if(route().page==='law'&&route().sfs===id)renderKeep();}).catch(()=>{});
      }
    });
    const go=()=>navigator.serviceWorker.register('sw.js').then(reg=>{
      // Leta efter uppdateringar när appen öppnas igen från hemskärmen.
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});});
    }).catch(()=>{});
    if(document.readyState==='complete')go();else window.addEventListener('load',go);
  }
  function showUpdateBanner(){
    if($('#update-banner'))return;
    const b=document.createElement('button');b.id='update-banner';b.type='button';b.className='update-banner';
    b.innerHTML='<strong>Ny version av Lagboken</strong><span>Tryck för att uppdatera</span>';
    b.addEventListener('click',()=>location.reload());
    document.body.appendChild(b);
  }
  async function loadCatalog(){
    // Första gången används hämtningen som index.html startade direkt, parallellt med skripten.
    const early=window.LAGBOK_EARLY&&window.LAGBOK_EARLY.catalog;if(early)window.LAGBOK_EARLY.catalog=null;
    let resp=await (early||fetch('data/index/catalog.json')).catch(()=>null);
    if(!resp||!resp.ok)resp=await fetch('data/catalog.json');
    if(!resp.ok)throw Error('Katalog saknas');
    const data=await resp.json();
    // Den kompakta katalogen lagrar lagarna i kolumner (scripts/build_indexes.js).
    if(data.rows&&data.cols)data.laws=data.rows.map(r=>{const o={};data.cols.forEach((c,i)=>{const v=r[i];if(v!=null)o[c]=data.values&&data.values[c]?data.values[c][v]:v;});return o;});
    state.catalog=(data.laws||[]).filter(l=>l.available!==false);state.fap=data.fap||[];state.version=data.version||'';state.sections=data.sections||[];state.coverage=data.coverage||null;window.LAGBOK_GENERATED=data.generated;
    linksReady=false;
  }
  // Sökfältet i katalogen stannar under toppfältet när man scrollar; skugga när det ligger över listan.
  view.addEventListener('scroll',()=>{
    const bar=view.querySelector('.searchbar-wrap');
    if(bar&&bar.classList)bar.classList.toggle('stuck',bar.getBoundingClientRect().top<=view.getBoundingClientRect().top+1&&view.scrollTop>0);
  },{passive:true});
  async function boot(){
    const v=$('#top-version');if(v)v.textContent=(DESKTOP?'':'Beta ')+APP_VERSION;
    try {
      await loadCatalog();
    } catch(_) {
      view.innerHTML='<div class="page offline-first"><div class="tut-mark small" aria-hidden="true">⇣</div><h1 class="page-title">Ingen anslutning</h1>'+
        '<p class="intro">Första gången behöver Lagboken internet för att hämta lagarna. Efter det fungerar det du har läst även utan nät.</p>'+
        '<button type="button" class="button primary" onclick="location.reload()">Försök igen</button></div>';
      return;
    }
    if(!location.hash||location.hash==='#/home'||location.hash==='#/search')history.replaceState(null,'','#/catalog');
    // Första bilden ritas innan något annat hämtas eller tolkas.
    await Promise.resolve(render(true)).catch(()=>{});
    await new Promise(r=>{requestAnimationFrame(()=>setTimeout(r,0));setTimeout(r,100);});
    noteStart();
    // Det som inte behövs för första bilden hämtas när appen har startat klart, utan att konkurrera med de första trycken.
    const later=(fn,ms)=>setTimeout(()=>(window.requestIdleCallback||(f=>f()))(fn,{timeout:2000}),ms);
    later(()=>fetchJson('data/index/relations.json').then(r=>{state.relations=r;if(route().page==='law')renderKeep();}).catch(()=>{}),route().page==='law'?0:600);
    later(()=>{
      fetchJson('data/index/status.json').then(st=>{state.status=st;updateNavBadge();}).catch(()=>{});
      loadChanges().then(()=>{updateNavBadge();if(unseenNews()&&route().page==='catalog')renderKeep();}).catch(()=>{});
    },900);
    registerWorker();
    // Sökindexets bas läses in i bakgrunden så att första sökningen svarar direkt.
    later(()=>{if(searchIndex&&searchIndex.warm)searchIndex.warm();prepareLinks();},2500);
    // Första gången: introduktionen (i huvudfönstret, aldrig i snabbpanelen). Den visas aldrig igen när man har tryckt "Jag förstår".
    if(!pref.tutorialDone&&window.LagbokTutorial&&!/[?&]notutorial\b/.test(location.search)&&document.documentElement.dataset.panel!=='true')
      window.LagbokTutorial.show(()=>{pref.tutorialDone=new Date().toISOString();savePrefs();});
  }
  // Källhänvisning som den skrivs i juridisk text: "3 kap. 8 § brottsbalken", "5 § lagen (1998:620) om belastningsregister".
  function citation(id,cap,num){
    const meta=lawById(id);if(!meta)return shortRef(id,cap,num);
    const place=isArt(id,cap)?placeLabel(id,cap,num):(cap&&cap!=='0'?cap+' kap. ':'')+(num?num+' §':'');
    let name=meta.name.charAt(0).toLowerCase()+meta.name.slice(1);
    // Balkar och grundlagar citeras utan SFS-nummer, övriga med numret efter första ordet eller sist.
    const plain=/\(\d{4}:\d+\)/.test(name)||/(?:balken|formen|ordningen|grundlagen|konventionen)$/.test(name);
    if(!plain)name=/^(?:lagen|förordningen|kungörelsen) /.test(name)?name.replace(/^(\S+) /,'$1 ('+id+') '):name+' ('+id+')';
    return (place?place+' ':'')+name;
  }
  // Rubrik för fönstret och aktivitetsfältet: "BrB 3:8", "Polislagen", "Sparat".
  function currentTitle(){
    const r=route(),meta=r.page==='law'?lawById(r.sfs):null;
    if(meta)return r.chapter==null?meta.name:shortRef(meta.sfs,r.chapter,r.paragraph||null);
    return ({saved:'Sparat',settings:'Inställningar',about:'Om',register:'Register',nytt:'Nytt i lagen',upcoming:'Kommande ändringar'})[r.page]||'';
  }
  // Förhandsvisning av en paragraf (desktop: när musen hålls över en hänvisning).
  async function paragraphPreview(sfs,cap,num){
    const doc=await loadLaw(sfs),ch=doc.chapters.find(c=>String(c.number)===String(cap));
    const item=ch&&ch.items.find(i=>i.type==='para'&&searchCore.paraKey(i.number)===searchCore.paraKey(num));
    if(!item)return null;
    const meta=lawById(sfs),text=lawModel.resolve(item).current.text||'',title=tocModel.curatedTitle(sfs,ch.number,item.number)||'';
    return '<div class="preview-head"><b>'+html(shortRef(sfs,ch.number,item.number))+'</b>'+(title?' · '+html(title):'')+'<span class="muted"> · '+html(meta?meta.name:sfs)+'</span></div>'+
      (item.repealed?'<p class="muted">Upphävd.</p>':'<div class="paragraph-content">'+textHtml(text.length>1400?text.slice(0,1400).replace(/\s+\S*$/,'')+' …':text,meta,ch)+'</div>');
  }
  // Textstorlek med Ctrl + hjulet eller Ctrl + plus/minus (samma inställning som reglaget under Inställningar).
  function fontStep(dir){
    pref.fontSize=dir===0?1:Math.round(Math.min(1.5,Math.max(0.85,Number(pref.fontSize)+dir*0.05))*100)/100;
    savePrefs();applyPrefs();toast('Textstorlek '+Math.round(pref.fontSize*100)+' %');
  }
  // Det Windows-delen (desktop.js) behöver: snabbkoder, navigering, favoriter/senaste för hopplistan med mera.
  window.LagbokApp={
    version:APP_VERSION,
    goQuick,navigate,toast,showSheet,closeSheet,chapterStep,fontStep,currentTitle,paragraphPreview,
    route:()=>route(),
    citation:key=>{const [id,cap,num]=String(key).split('|');return citation(id,cap,num);},
    favourites:()=>pref.favourites.filter(t=>lawById(t.split('|')[0])).map(t=>({title:favTitle(t),hash:favRoute(t)})),
    recents:()=>pref.recents.filter(t=>lawById(t.split('|')[0])).map(t=>({title:favTitle(t),hash:favRoute(t)})),
    ready:()=>state.catalog.length>0
  };
  boot();
})();
;
// ---- desktop.js ----
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
;
