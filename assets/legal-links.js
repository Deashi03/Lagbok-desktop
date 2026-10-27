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
