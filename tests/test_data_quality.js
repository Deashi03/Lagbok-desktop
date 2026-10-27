// Kvalitetskontroll av all importerad lagtext: tecken på tolkningsfel ska upptäckas före publicering.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const catalog=require('../data/catalog.json');
const file=sfs=>path.join(__dirname,'..','data','laws',sfs.replace(/[: ]/g,'-')+'.json');
const sfsSet=new Set();let laws=0,paras=0;
for(const law of catalog.laws){
 assert.ok(!sfsSet.has(law.sfs),'dubblett i katalogen: '+law.sfs);sfsSet.add(law.sfs);
 assert.ok(catalog.sections.some(s=>s.id===law.section),law.sfs+' saknar giltig sektion');
 if(law.parent)assert.ok(catalog.laws.some(l=>l.sfs===law.parent&&!l.parent),law.sfs+': okänd överordnad balk '+law.parent);
 if(!fs.existsSync(file(law.sfs)))continue;
 const doc=JSON.parse(fs.readFileSync(file(law.sfs),'utf8'));laws++;
 const keys=new Set();
 for(const ch of doc.chapters)for(const p of ch.items){
  if(p.type!=='para')continue;paras++;
  const k=ch.number+'|'+p.number;assert.ok(!keys.has(k),law.sfs+' dubblerad paragraf '+k);keys.add(k);
  for(const v of p.versions||[p]){
   assert.ok(!/\n\s*(?:Ikraftträdande- och )?Övergångsbestämmelser\s*\n/.test(v.text),law.sfs+' '+k+': övergångsbestämmelser i paragraftext');
   // Lång text är tecken på sammanslagna paragrafer bara om den innehåller nya paragrafnummer
   // (vissa äldre kungörelser och avtalsförordningar består av en enda lång text).
   assert.ok(v.text.length<15000||!/\n\s*\d+\s*[a-z]?\s*§\s+[A-ZÅÄÖ]/.test(v.text),law.sfs+' '+k+': ovanligt lång paragraf ('+v.text.length+' tecken) med inbäddade paragrafer');
   assert.ok(!/\r/.test(v.text),law.sfs+' '+k+': vagnretur i text');
  }
 }
 assert.ok(keys.size>0,law.sfs+' saknar paragrafer');
}
console.log('Datakvalitet: '+laws+' författningar och '+paras+' paragrafer kontrollerade');
// Förkortningar: vedertagna förkortningar finns och är unika (snabbkoder som "SkolL 7:2" måste vara entydiga).
const ABBR=/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö]{1,5}$/;const abbrSeen=new Map();
for(const law of catalog.laws)for(const a of law.aliases||[]){
 if(!ABBR.test(a))continue;const k=a.toLowerCase();
 assert.ok(!abbrSeen.has(k)||abbrSeen.get(k)===law.sfs,'förkortningen '+a+' används av både '+abbrSeen.get(k)+' och '+law.sfs);abbrSeen.set(k,law.sfs);
}
const curated=require('../data/abbreviations.json');
for(const [sfs,a] of Object.entries(curated)){
 const law=catalog.laws.find(l=>l.sfs===sfs);
 if(law)assert.ok(law.aliases.includes(a),law.name+' saknar förkortningen '+a);
}
for(const [name,a] of [['Skollagen','SkolL'],['Vapenlagen','VL'],['Delgivningsförordningen','DelgF'],['Delgivningslagen','DelgL'],['Inkomstskattelagen','IL'],['Handelsbalken','HB']]){
 const law=catalog.laws.find(l=>l.name===name);assert.ok(law&&law.aliases.includes(a),name+' ska ha förkortningen '+a);
}
console.log('Förkortningar: '+abbrSeen.size+' unika');
