// Redigerade kopplingar mellan förordning och lag måste peka på paragrafer som finns.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rel=require('../data/relations.json');
const catalog=require('../data/catalog.json');
const key=s=>String(s).replace(/\s+/g,'').toLowerCase();
const cache=new Map();
function exists(ref){
 const [sfs,ch,para]=ref.split('|');
 const file=path.join(__dirname,'..','data','laws',sfs.replace(/[: ]/g,'-')+'.json');
 if(!fs.existsSync(file))return null;
 if(!cache.has(sfs))cache.set(sfs,JSON.parse(fs.readFileSync(file,'utf8')));
 const c=cache.get(sfs).chapters.find(x=>x.number===ch);
 return !!c&&c.items.some(i=>i.type==='para'&&key(i.number)===key(para)&&!i.repealed);
}
let n=0;
for(const r of rel.kompletterar){
 const from=catalog.laws.find(l=>l.sfs===r.fran.split('|')[0]);
 assert.ok(from&&from.type==='förordning','källan ska vara en förordning: '+r.fran);
 assert.notEqual(exists(r.fran),false,'saknas: '+r.fran);
 for(const t of r.till){assert.notEqual(exists(t),false,'saknas: '+t+' (från '+r.fran+')');n++;}
}
console.log('Kopplingar lag–förordning: '+n+' redigerade kopplingar kontrollerade');
