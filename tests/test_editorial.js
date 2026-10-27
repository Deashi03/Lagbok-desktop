// Redaktionella rubriker måste peka på paragrafer som finns i den importerade lagtexten.
// Testet fallerar när en lagändring flyttar, tar bort eller upphäver en rubricerad paragraf.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {groups,titles}=require('../assets/editorial.js');
const key=s=>String(s).replace(/\s+/g,' ').trim().toLowerCase();
let checked=0;
for(const [kind,table] of Object.entries({groups,titles})){
 for(const [sfs,chapters] of Object.entries(table)){
  const file=path.join(__dirname,'..','data','laws',sfs.replace(/[: ]/g,'-')+'.json');
  const law=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const [chapter,entries] of Object.entries(chapters)){
   const ch=law.chapters.find(c=>c.number===chapter);
   assert.ok(ch,kind+': '+sfs+' saknar kapitel '+chapter);
   const paras=new Map(ch.items.filter(i=>i.type==='para').map(i=>[key(i.number),i]));
   for(const number of Object.keys(entries)){
    const p=paras.get(key(number));
    assert.ok(p,kind+': '+sfs+' '+chapter+' kap. '+number+' § finns inte');
    if(kind==='titles')assert.ok(!p.repealed,'titles: '+sfs+' '+chapter+' kap. '+number+' § är upphävd');
    checked++;
   }
  }
 }
}
console.log('Redaktionella rubriker: '+checked+' hänvisningar kontrollerade mot lagtexten');
