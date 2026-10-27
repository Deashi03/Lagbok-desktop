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
