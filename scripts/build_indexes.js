#!/usr/bin/env node
/* Bygger sökindex och register över hänvisningar ur data/laws.
   data/index/meta.json           – lagarnas ordning, antal paragrafer, blockstorlek och orddelarnas namn
   data/index/paras/<n>.json      – paragrafer i block: [lag, kapitel, paragraf, rubrik]
   data/index/terms/<xx>.json     – ord -> paragrafnummer (deltakodade), uppdelat på ordets två (eller tre) första tecken
   data/index/backlinks/<sfs>.json – "kapitel|paragraf" -> kopplingar [lag, kapitel, paragraf, typ] där typ är
                                    "ref" (hänvisar hit), "föreskrift" (förordning som kompletterar) eller
                                    "kompletterar" (lagparagraf som förordningsparagrafen kompletterar)
   data/index/catalog.json        – kompakt katalog som appen läser vid start
   data/index/relations.json      – förordningar och de lagar de ansluter till
   data/index/status.json         – per lag: senaste ändring och kontrollsumma (för ändringsbevakning)
   data/index/upcoming.json       – alla kommande lydelser med datum
   Körs av importen och kontrolleras i CI, så att indexet alltid matchar lagtexten. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const links=require(path.join(root,'assets/legal-links.js'));
const toc=require(path.join(root,'assets/toc-model.js'));
const search=require(path.join(root,'assets/search-core.js'));
const lawModel=require(path.join(root,'assets/law-model.js'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
links.configure(catalog.laws);
const out=path.join(root,'data/index');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'terms'),{recursive:true});
fs.mkdirSync(path.join(out,'backlinks'),{recursive:true});
const file=sfs=>path.join(root,'data/laws',sfs.replace(/[: ]/g,'-')+'.json');
const laws=catalog.laws.filter(l=>fs.existsSync(file(l.sfs)));
const docs=new Map(laws.map(l=>[l.sfs,JSON.parse(fs.readFileSync(file(l.sfs),'utf8'))]));
for(const [sfs,doc] of docs)toc.registerDoc(sfs,doc);
const key=search.paraKey;
const known=new Map();
for(const [sfs,doc] of docs)for(const ch of doc.chapters)known.set(sfs+'|'+ch.number,new Set(ch.items.filter(i=>i.type==='para').map(i=>key(i.number))));
const locate=links.locator(sfs=>docs.get(sfs));
const exists=(sfs,chapter,para)=>{const s=known.get(sfs+'|'+chapter);return !!s&&(para==null||s.has(key(para)));};
// Paragrafer och kapitel i ett intervall ("7–9 §§", "24–28 kap.") i lagtextens ordning.
const order=new Map();
for(const [sfs,doc] of docs)for(const ch of doc.chapters)order.set(sfs+'|'+ch.number,ch.items.filter(i=>i.type==='para').map(i=>key(i.number)));
const between=(list,a,b)=>{const i=list.indexOf(a),j=list.indexOf(b);return i>=0&&j>=i?list.slice(i,j+1):null;};
// Paragrafer ordnas efter nummer och bokstav, så att ett intervall fungerar även när en ändparagraf är upphävd.
const rank=k=>{const m=/^(\d+)([a-z]*)$/.exec(k);return m?Number(m[1])*100+(m[2]?m[2].charCodeAt(0)-96:0):null;};
const members=(sfs,chapter,a,b)=>{const lo=rank(key(a)),hi=rank(key(b));if(lo==null||hi==null||hi<lo)return null;
  const list=(order.get(sfs+'|'+chapter)||[]).filter(k=>{const r=rank(k);return r!=null&&r>=lo&&r<=hi;});return list.length?list:null;};
const chapters=(sfs,a,b)=>{const doc=docs.get(sfs);return doc?between(doc.chapters.map(c=>String(c.number)),String(a),String(b)):null;};
const fold=s=>String(s||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[̀-ͯ]/g,'');
const words=s=>fold(s).match(/[a-z0-9]{2,}/g)||[];
const paras=[],postings=new Map(),backlinks=new Map(),lawRefs=new Map();
const typeOf=new Map(laws.map(l=>[l.sfs,l.type]));
function addLink(sfs,chapter,para,entry){
  const k=sfs+'#'+chapter+'|'+key(para);
  if(!backlinks.has(k))backlinks.set(k,new Map());
  backlinks.get(k).set(entry.join('|'),entry);
}
// Paragrafnummer som det skrivs i lagtexten ("3 a"), inte som nyckel ("3a").
function displayNumber(sfs,chapter,num){
  const doc=docs.get(sfs),ch=doc&&doc.chapters.find(c=>c.number===chapter);
  const item=ch&&ch.items.find(i=>i.type==='para'&&key(i.number)===key(num));
  return item?String(item.number):String(num);
}
laws.forEach((law,li)=>{
  const doc=docs.get(law.sfs);
  for(const ch of doc.chapters){
    const groups=toc.chapterGroups(law.sfs,ch);
    const groupOf=new Map();
    for(const g of groups)for(const p of g.paragraphs)groupOf.set(p.number,g);
    for(const item of ch.items){
      if(item.type!=='para'||item.repealed)continue;
      const ordinal=paras.length;
      const title=toc.curatedTitle(law.sfs,ch.number,item.number)||'';
      const group=groupOf.get(String(item.number));
      const heading=group&&group.origin!=='kapitel'?group.title:'';
      paras.push([li,ch.number,String(item.number),title||heading]);
      const texts=(item.versions||[item]).map(v=>v.text);
      const terms=new Set(words([...texts,title,heading,ch.title].join(' ')));
      for(const t of terms){if(!postings.has(t))postings.set(t,[]);postings.get(t).push(ordinal);}
      for(const text of texts){
        for(const ref of links.parseRefs(text,{sfs:law.sfs,chapter:ch.number,exists,locate,members,chapters,unit:ch.unit||'',anchor:law.parent||law.anchor})){
          if(ref.id===law.sfs&&ref.chapter===ch.number&&ref.numbers.includes(key(item.number)))continue;
          const target=typeOf.get(ref.id);
          const complements=law.type==='förordning'&&target==='lag'&&ref.id!==law.sfs;
          for(const n of ref.numbers){
            addLink(ref.id,ref.chapter,n,[law.sfs,ch.number,String(item.number),complements?'föreskrift':'ref']);
            if(complements){
              addLink(law.sfs,ch.number,item.number,[ref.id,ref.chapter,displayNumber(ref.id,ref.chapter,n),'kompletterar']);
              lawRefs.set(law.sfs+'>'+ref.id,(lawRefs.get(law.sfs+'>'+ref.id)||0)+1);
            }
          }
        }
      }
    }
  }
});
// Redigerade kopplingar (data/relations.json) för förordningar som inte själva hänvisar till lagparagrafen.
const curated=JSON.parse(fs.readFileSync(path.join(root,'data/relations.json'),'utf8'));
for(const rel of curated.kompletterar){
  const [fs_,fc,fp]=rel.fran.split('|');
  if(!docs.has(fs_))continue;
  for(const to of rel.till){
    const [ts,tc,tp]=to.split('|');
    if(!docs.has(ts))continue;
    addLink(ts,tc,tp,[fs_,fc,fp,'föreskrift']);
    addLink(fs_,fc,fp,[ts,tc,tp,'kompletterar']);
    lawRefs.set(fs_+'>'+ts,(lawRefs.get(fs_+'>'+ts)||0)+3);
  }
}
// En förordning ansluter till en lag när den hänvisar dit ofta: minst fem gånger och minst 30 % av
// hänvisningarna till den mest hänvisade lagen. Enstaka hänvisningar ger ingen koppling på lagnivå.
// Nämner förordningen en lag i sina första paragrafer ("… med stöd av lagen (1998:620) …") är det den
// lag förordningen ansluter till, oavsett hur ofta andra lagar nämns längre ned.
const STOP=new Set(['instruktion','vissa','sarskilda','bestammelser','annat','andra','svenska','sverige']);
function stems(name){
  return (fold(name).match(/[a-z]{5,}/g)||[]).map(w=>w.replace(/(?:forordningen|kungorelsen|lagen|balken)$/,'').replace(/s$/,'')).filter(w=>w.length>=5&&!STOP.has(w));
}
function sameStem(a,b){
  const x=stems(a),y=stems(b);
  return x.some(u=>y.some(v=>u===v||(Math.min(u.length,v.length)>=7&&(u.startsWith(v)||v.startsWith(u)))));
}
const anchors=new Map();
for(const law of laws){
  if(law.type!=='förordning')continue;
  const first=docs.get(law.sfs).chapters.flatMap(c=>c.items.filter(i=>i.type==='para')).slice(0,2).map(i=>i.text).join(' ');
  const named=[...new Set([...first.matchAll(/\((\d{4}:\d+)\)/g)].map(m=>m[1]))].filter(s=>s!==law.sfs&&typeOf.get(s)==='lag');
  // Flera lagar nämns: välj den vars namn liknar förordningens (t.ex. "kontroll av narkotika").
  const words=n=>new Set(String(n).toLowerCase().match(/[a-zåäö]{5,}/g)||[]);
  const own=words(law.name),nameOf=s=>(laws.find(l=>l.sfs===s)||{}).name||'';
  const overlap=s=>[...words(nameOf(s))].filter(w=>own.has(w)||[...own].some(o=>o.slice(0,6)===w.slice(0,6))).length;
  const hit=named.slice().sort((a,b)=>overlap(b)-overlap(a))[0];
  if(hit){anchors.set(law.sfs,hit);continue;}
  // Annars: en lag med samma namnstam som förordningen ("Brottsskadeförordningen" – "Brottsskadelagen")
  // som förordningen hänvisar till minst en gång.
  const kin=[...lawRefs.keys()].filter(p=>p.startsWith(law.sfs+'>')).map(p=>p.split('>')[1]).filter(s=>sameStem(law.name,nameOf(s)));
  if(kin.length===1)anchors.set(law.sfs,kin[0]);
}
const relations={},top=new Map();
for(const [pair,count] of lawRefs){const f=pair.split('>')[0];top.set(f,Math.max(top.get(f)||0,count));}
for(const [f,l] of anchors)if(!lawRefs.has(f+'>'+l))lawRefs.set(f+'>'+l,5);
for(const [pair,count] of [...lawRefs].sort()){
  const [f0,l0]=pair.split('>');
  if(anchors.has(f0)){if(anchors.get(f0)!==l0)continue;}
  else if(count<5||count<0.3*top.get(f0))continue;
  const [f,l]=pair.split('>');
  (relations[f]=relations[f]||{kompletterar:[],kompletteras:[]}).kompletterar.push(l);
  (relations[l]=relations[l]||{kompletterar:[],kompletteras:[]}).kompletteras.push(f);
}
// Förordningar som följer lagens disposition ("Vanlig delgivning", "Kungörelsedelgivning"): paragrafer utan
// egen hänvisning kopplas till avsnittet med samma rubrik i lagen förordningen ansluter till.
const linked=(sfs,ch,num)=>{const m=backlinks.get(sfs+'#'+ch+'|'+key(num));return !!m&&[...m.values()].some(e=>e[3]==='kompletterar');};
const headingKey=t=>fold(t).replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
for(const [f,rel] of Object.entries(relations)){
  if(rel.kompletterar.length!==1)continue;
  const lawSfs=rel.kompletterar[0],sections=new Map();
  for(const ch of docs.get(lawSfs).chapters)for(const item of ch.items){
    if(item.type==='heading'&&item.nextPara&&!sections.has(headingKey(item.text)))sections.set(headingKey(item.text),[ch.number,String(item.nextPara)]);
  }
  for(const ch of docs.get(f).chapters){
    let section=null;
    for(const item of ch.items){
      if(item.type==='heading'){const k=headingKey(item.text);section=k.length>3&&!/^(?:inledande|allmanna|ovriga|overklagande|bemyndigande)/.test(k)?sections.get(k)||null:null;continue;}
      if(item.type!=='para'||item.repealed||!section||linked(f,ch.number,item.number))continue;
      const [lc,lp]=section;
      if(!exists(lawSfs,lc,lp))continue;
      addLink(f,ch.number,item.number,[lawSfs,lc,displayNumber(lawSfs,lc,lp),'kompletterar']);
      addLink(lawSfs,lc,lp,[f,ch.number,String(item.number),'föreskrift']);
    }
  }
}
// Kompakt katalog för appen (data/catalog.json är källan). Lagarna lagras i kolumner: "cols" anger fälten och
// varje rad i "rows" värdena i samma ordning (null när fältet saknas). Fält vars värden upprepas (typ, avdelning)
// pekar på en lista i "values". Ungefär en tredjedel mindre att läsa och tolka vid start; appen packar upp den.
const rowsOf=catalog.laws.map(l=>{
  const o={};for(const [k,v] of Object.entries(l)){if(k==='check'||v===false||v===''||v==null||(Array.isArray(v)&&!v.length))continue;o[k]=v;}
  return o;
});
const cols=[...new Set(rowsOf.flatMap(o=>Object.keys(o)))];
const values={};
for(const c of ['type','section'])if(cols.includes(c))values[c]=[...new Set(rowsOf.map(o=>o[c]).filter(v=>v!=null))];
const rows=rowsOf.map(o=>{const r=cols.map(c=>o[c]===undefined?null:values[c]?values[c].indexOf(o[c]):o[c]);while(r.length&&r[r.length-1]===null)r.pop();return r;});
const slim=Object.assign({},catalog,{laws:undefined,cols,values,rows});
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(slim));
// Förarbeten per ändringsförfattning (scripts/forarbeten.py), uppdelat på år: forarbeten/<år>.json.
const forarbetenFile=path.join(root,'data/forarbeten.json');
if(fs.existsSync(forarbetenFile)){
  const all=JSON.parse(fs.readFileSync(forarbetenFile,'utf8')).sfs||{};
  const used=new Set();
  for(const doc of docs.values())for(const ch of doc.chapters)for(const item of ch.items)if(item.type==='para')for(const v of item.versions||[item])if(v.amendedBy)used.add(v.amendedBy);
  for(const doc of docs.values())if(doc.latestAmendment)used.add(doc.latestAmendment);
  const byYear={};
  for(const s of used){const f=all[s];if(!f)continue;(byYear[s.slice(0,4)]=byYear[s.slice(0,4)]||{})[s]=[f.prop||'',f.propId||'',f.bet||'',f.betId||''];}
  fs.mkdirSync(path.join(out,'forarbeten'),{recursive:true});
  for(const [y,d] of Object.entries(byYear))fs.writeFileSync(path.join(out,'forarbeten',y+'.json'),JSON.stringify(d));
}
fs.writeFileSync(path.join(out,'relations.json'),JSON.stringify(relations));
// Paragrafregistret delas i block om CHUNK paragrafer som hämtas när en sökträff finns i blocket.
// Orddelar som blir större än SPLIT byte delas vidare ett tecken i taget ("fo" -> "for", "fos", "fo_"),
// så att varje fil förblir liten även när hela Sveriges Rikes Lag finns i appen.
const CHUNK=2000,SPLIT=60000;
fs.mkdirSync(path.join(out,'paras'),{recursive:true});
for(let c=0;c*CHUNK<paras.length;c++)fs.writeFileSync(path.join(out,'paras',c+'.json'),JSON.stringify(paras.slice(c*CHUNK,(c+1)*CHUNK)));
const encode=list=>{let prev=0;return list.map(n=>{const d=n-prev;prev=n;return d;});};
const byPrefix=new Map();
for(const [term,list] of [...postings].sort((a,b)=>a[0]<b[0]?-1:1)){
  const p=term.slice(0,2);
  if(!byPrefix.has(p))byPrefix.set(p,{});
  byPrefix.get(p)[term]=encode(list);
}
const shards=new Map();
function place(prefix,data){
  if(JSON.stringify(data).length<=SPLIT||prefix.length>=6){shards.set(prefix,data);return;}
  const parts=new Map();
  for(const [term,list] of Object.entries(data)){
    const name=term.length>prefix.length?term.slice(0,prefix.length+1):prefix+'_';
    if(!parts.has(name))parts.set(name,{});
    parts.get(name)[term]=list;
  }
  for(const [name,part] of parts)name.endsWith('_')?shards.set(name,part):place(name,part);
}
for(const [p,data] of byPrefix)place(p,data);
for(const [name,data] of shards)fs.writeFileSync(path.join(out,'terms',name+'.json'),JSON.stringify(data));
// Vikt per författning vid sökning: balkar och grundlagar först, sedan lagar, sist förordningar.
const weight=l=>l.type==='konvention'?((l.aliases||[]).length?0.8:0.3):l.type!=='lag'?0.25:l.section==='balkar'&&!l.parent?1:l.section==='grundlagar'?0.8:l.parent?0.75:0.5;
fs.writeFileSync(path.join(out,'meta.json'),JSON.stringify({laws:laws.map(l=>l.sfs),names:laws.map(l=>fold(l.name)),weights:laws.map(weight),count:paras.length,chunk:CHUNK,shards:[...shards.keys()].sort()}));
const bySfs=new Map();
for(const [k,sources] of backlinks){
  const [sfs,target]=k.split('#');
  if(!bySfs.has(sfs))bySfs.set(sfs,{});
  // Kompletterande föreskrifter först, sedan hänvisningar.
  const order={'föreskrift':0,'kompletterar':1,'ref':2};
  bySfs.get(sfs)[target]=[...sources.values()].sort((a,b)=>order[a[3]]-order[b[3]]);
}
for(const [sfs,data] of bySfs)fs.writeFileSync(path.join(out,'backlinks',sfs.replace(/[: ]/g,'-')+'.json'),JSON.stringify(data));
// Kontrollsumma per paragraf och lag: ändras när lydelserna ändras, inte när hämtningsdatum ändras.
const status={},upcoming=[];
for(const law of laws){
  const doc=docs.get(law.sfs);
  for(const ch of doc.chapters)for(const item of ch.items){
    if(item.type!=='para')continue;
    for(const v of item.versions||[]){
      if(!v.inForce)continue;
      upcoming.push([v.inForce.date||'',law.sfs,ch.number,String(item.number)]);
    }
  }
  status[law.sfs]={amended:doc.latestAmendment||null,hash:lawModel.snapshot(doc).hash};
}
// En paragraf kan ha flera kommande lydelser med samma datum; varje paragraf visas en gång per datum.
const uniqueUpcoming=[...new Map(upcoming.map(u=>[u.join('|'),u])).values()];
upcoming.length=0;upcoming.push(...uniqueUpcoming);
upcoming.sort((a,b)=>(a[0]||'9999').localeCompare(b[0]||'9999')||a[1].localeCompare(b[1]));
fs.writeFileSync(path.join(out,'status.json'),JSON.stringify(status));
fs.writeFileSync(path.join(out,'upcoming.json'),JSON.stringify(upcoming));
let refs=0;for(const v of backlinks.values())refs+=v.size;
console.log('Index: '+paras.length+' paragrafer, '+postings.size+' ord i '+shards.size+' delar, '+refs+' hänvisningar till '+backlinks.size+' paragrafer');
