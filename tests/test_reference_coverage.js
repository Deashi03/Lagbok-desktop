// Går igenom all importerad lagtext och mäter hur stor del av hänvisningarna som länkas.
// Hänvisningar till författningar som inte finns i appen räknas inte.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const links=require('../assets/legal-links.js');
const catalog=require('../data/catalog.json');
links.configure(catalog.laws);
const key=n=>String(n).toLowerCase().replace(/\s+/g,'');
const laws=new Map();
for(const law of catalog.laws){
 const file=path.join(__dirname,'..','data','laws',law.sfs.replace(/[: ]/g,'-')+'.json');
 if(fs.existsSync(file))laws.set(law.sfs,JSON.parse(fs.readFileSync(file,'utf8')));
}
const index=new Map();
for(const [sfs,doc] of laws)for(const ch of doc.chapters)
 index.set(sfs+'|'+ch.number,new Set(ch.items.filter(i=>i.type==='para').map(i=>key(i.number))));
const exists=(sfs,chapter,para)=>{
 if(!laws.has(sfs))return true;
 const set=index.get(sfs+'|'+chapter);
 return !!set&&(para==null||set.has(key(para)));
};
const locate=links.locator(sfs=>laws.get(sfs));
let total=0,linked=0;const misses=[];
const external=/^[^.;]{0,160}?(?:lagen|förordningen|balken|kungörelsen|ordningen|grundlagen|förordning|lag)\s*\((\d{4}:\d+)\)|^\s*(?:i\s+|enligt\s+)?(?:\S+\s+){0,3}?(?:EU|EG|direktiv|förordning \()/i;
// Konventionstext (kapitel med artiklar) har egen styckeindelning ("§ 1") som inte är svenska paragrafhänvisningar.
for(const [sfs,doc] of laws)for(const ch of doc.chapters.filter(c=>c.unit!=='artikel'))for(const item of ch.items){
 if(item.type!=='para'||item.repealed)continue;
 for(const v of item.versions||[item]){
  const meta=catalog.laws.find(l=>l.sfs===sfs)||{},anchor=meta.parent||meta.anchor,text=v.text,refs=links.parseRefs(text,{sfs,chapter:ch.number,exists,locate,anchor});
  for(const m of text.matchAll(/§/g)){
   if(text[m.index-1]==='§')continue;
   const after=text.slice(m.index+1,m.index+200).replace(/^§/,'');
   const ext=external.exec(after);
   if(ext&&ext[1]&&!laws.has(ext[1]))continue;
   if(!links.targetLaw(after,{sfs,chapter:ch.number,anchor},null))continue; // annan författning som inte finns i appen
   total++;
   if(refs.some(r=>m.index>=r.start&&m.index<r.end))linked++;
   else misses.push(sfs+' '+ch.number+':'+item.number+' … '+text.slice(Math.max(0,m.index-40),m.index+50).replace(/\s+/g,' '));
  }
 }
}
const share=linked/total;
if(process.argv.includes('--verbose'))console.log(misses.join('\n'));
console.log('Hänvisningstäckning: '+linked+' av '+total+' paragraftecken länkade ('+(share*100).toFixed(1)+' %)');
assert.ok(share>=0.95,'För låg andel länkade hänvisningar');
