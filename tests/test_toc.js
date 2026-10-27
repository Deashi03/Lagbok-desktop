const assert=require('node:assert/strict');
const toc=require('../assets/toc-model.js');
const data={
 number:'28',title:'Om husrannsakan',
 items:[
 {type:'heading',text:'Husrannsakan',editorial:true,nextPara:'1'},
 {type:'para',number:'1',text:'Om det finns anledning att anta att ett brott har begåtts.'},
 {type:'para',number:'2',text:'För att söka efter den som ska gripas.'},
 {type:'para',number:'3 a',text:'Husrannsakan får beslutas endast om skälen för åtgärden uppväger intrånget.'},
 {type:'heading',text:'Genomsökning på distans',editorial:false,nextPara:'10 a'},
 {type:'para',number:'10 a',text:'Genomsökning på distans innebär att söka efter handlingar.'}
 ]};
const groups=toc.chapterGroups('1942:740',data);
// Källans egna rubriker har företräde i kapitel som har sådana.
assert.equal(groups[0].title,'Husrannsakan');
assert.equal(groups[0].first,'1');
assert.equal(groups[0].paragraphs[0].title,'Reell husrannsakan');
assert.equal(groups[0].paragraphs[1].title,'Personell husrannsakan');
assert.equal(groups[0].paragraphs[2].title,'Proportionalitet');
assert.equal(groups[1].title,'Genomsökning på distans');
assert.equal(groups[1].origin,'källa');
assert.equal(groups[1].first,'10 a');
// Redaktionella grupper används i kapitel utan rubriker.
const brb3=toc.chapterGroups('1962:700',{number:'3',title:'Om brott mot liv och hälsa',items:[
 {type:'para',number:'1',text:'Den som berövar annan livet'},{type:'para',number:'2',text:'Dråp'},
 {type:'para',number:'5',text:'Misshandel'},{type:'para',number:'7',text:'Vållande'}]});
assert.deepEqual(brb3.map(g=>g.title),['Uppsåtligt dödande','Misshandel','Vållande- och farebrott']);
assert.equal(brb3[0].paragraphs[0].title,'Mord');
// Underrubriker behåller sin överordnade rubrik.
const nested=toc.chapterGroups('1942:740',{number:'27',title:'',items:[
 {type:'heading',text:'Hemliga tvångsmedel'},{type:'heading',text:'Hemlig avlyssning'},{type:'para',number:'18',text:'Text om avlyssning.'}]});
assert.equal(nested[0].title,'Hemlig avlyssning');
assert.equal(nested[0].parent,'Hemliga tvångsmedel');
assert.equal(toc.description('1962:700','3',{number:'4',text:'Text',repealed:true}).text,'Upphävd paragraf');
assert.equal(toc.chapterMatches(data,groups,'reell husrannsakan'),true);
assert.equal(toc.chapterMatches(data,groups,'10 a §'),true);
assert.equal(toc.chapterMatches(data,groups,'häktning'),false);
assert.equal(toc.description('1962:700','8',{number:'3',text:'Har upphävts.'}).text,'Upphävd paragraf');
assert.equal(toc.description('1962:700','9',{number:'6 a',text:'Utförselhäleri'}).text,'Utförselhäleri');
assert.equal(toc.description('1962:700','9',{number:'3 d',text:'Företagskapning'}).text,'Företagskapning');
const others=toc.chapterGroups('1998:1276',{number:'1',title:'Allmänt',items:[{type:'para',number:'1',text:'Denna förordning gäller trafik på väg.'}]});
assert.ok(others[0].paragraphs[0].title.includes('Denna förordning'));
console.log('Innehållsförteckning: rubriceringar och grupper godkända');

const fs=require('node:fs');
const path=require('node:path');
const catalog=require('../data/catalog.json');
let total=0;
for(const law of catalog.laws.filter(l=>l.available!==false)){
 const pathname=path.join(__dirname,'..','data','laws',law.sfs.replace(/[: ]/g,'-')+'.json');
 if(!fs.existsSync(pathname))continue;
 const source=JSON.parse(fs.readFileSync(pathname,'utf8'));
 for(const chapter of source.chapters){
   const grouped=toc.chapterGroups(law.sfs,chapter);
   const input=chapter.items.filter(x=>x.type==='para').map(x=>String(x.number));
   const flattened=grouped.flatMap(g=>g.paragraphs.map(x=>x.number));
   assert.deepEqual(flattened,input,law.sfs+' kap. '+chapter.number);
   total+=input.length;
 }
}
assert.ok(total>2500,'Katalogen bör täcka alla importerade paragrafer');
console.log('Fullständighet: '+total+' paragrafer bevarade i innehållsförteckningen');
