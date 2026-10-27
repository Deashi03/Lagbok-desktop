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
