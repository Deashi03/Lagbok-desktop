const assert=require('node:assert/strict');
const {parseQuick,resolvedQuick}=require('../assets/search-core.js');
const laws=[
 {sfs:'1962:700',name:'Brottsbalken',aliases:['BrB'],chaptered:true},
 {sfs:'1942:740',name:'Rättegångsbalken',aliases:['RB'],chaptered:true},
 {sfs:'1947:948',name:'Förundersökningskungörelsen',aliases:['FuK'],chaptered:false},
 {sfs:'1984:387',name:'Polislagen',aliases:['PL'],chaptered:false}
];
const faps=[{id:'FAP 104-04',name:'OC-spray'}];
const doc={chapters:[{number:'1',items:[{type:'para',number:'1'}]},{number:'24',items:[{type:'para',number:'1'},{type:'para',number:'2 a'}]}]};
const q=s=>parseQuick(s,laws,faps);
assert.deepEqual([q('BrB 1').chapter,q('BrB 1').para],['1',null]);
assert.deepEqual([q('BrB 24:1').chapter,q('BrB 24:1').para],['24','1']);
assert.deepEqual([q('brb24:1').chapter,q('brb24:1').para],['24','1']);
assert.deepEqual([q('BrB 24 kap. 1 §').chapter,q('BrB 24 kap. 1 §').para],['24','1']);
assert.deepEqual([q('RB 28:1').chapter,q('RB 28:1').para],['28','1']);
assert.deepEqual([q('FuK 12').chapter,q('FuK 12').para],['0','12']);
assert.deepEqual([q('PL 10').chapter,q('PL 10').para],['0','10']);
assert.equal(q('FAP 104-4').fap.id,'FAP 104-04');
assert.deepEqual([q('rb 23 8b').chapter,q('rb 23 8b').para],['23','8b']);
assert.deepEqual([q('RB 23 8 b').chapter,q('RB 23 8 b').para],['23','8b']);
assert.equal(q('husrannsakan'),null);
assert.equal(q('BrB 24:'),null);
assert.equal(q('BrB 1a'),null);
assert.equal(q('FuK 12:1'),null);
assert.equal(resolvedQuick(q('BrB 24:1'),doc).para,'1');
assert.equal(resolvedQuick(q('BrB 24:2a'),doc).para,'2a');
assert.equal(resolvedQuick(q('BrB 24:7'),doc),null);
assert.equal(resolvedQuick(q('BrB 30'),doc),null);
console.log('Snabbkoder: 16 kontroller godkända');

const {rankSuggestions}=require('../assets/search-core.js');
const rankedLaws=[
 {sfs:'1942:740',name:'Rättegångsbalken',aliases:['RB','husrannsakan','häktning']},
 {sfs:'1974:152',name:'Regeringsformen',aliases:['RF','grundlag']},
 {sfs:'1951:649',name:'Lagen om straff för vissa trafikbrott',aliases:['TBL','rattfylleri']}
];
const topic=[{term:'Husrannsakan',code:'RB 28:1'}];
const one=rankSuggestions('R',rankedLaws,[],topic,[]);
assert.deepEqual(one.map(x=>x.title).sort(),['Regeringsformen','Rättegångsbalken'].sort());
assert.equal(rankSuggestions('RB',rankedLaws,[],topic,[])[0].title,'Rättegångsbalken');
assert.equal(rankSuggestions('husr',rankedLaws,[],topic,[])[0].type,'topic');
assert.equal(rankSuggestions('BrB 24:1',laws,[],[],[])[0].type,'quick');
console.log('Sökrankning: 4 kontroller godkända');
// 1.6: bara förkortningen eller namnet öppnar författningens början, och artiklar i konventioner.
const all=require('../data/catalog.json').laws;
const lawOnly=s=>{const r=parseQuick(s,all,[]);return r&&[r.meta.sfs,r.chapter,r.para];};
assert.deepEqual(lawOnly('PL'),['1984:387',null,null]);
assert.deepEqual(lawOnly('brb'),['1962:700',null,null]);
assert.deepEqual(lawOnly('Polislagen'),['1984:387',null,null]);
assert.equal(lawOnly('husrannsakan'),null,'ämnesord är inte förkortningar');
assert.deepEqual(lawOnly('EKMR 8'),['1994:1219','K','8'],'artikeln ligger i lagen, i kapitlet för konventionen');
assert.deepEqual(lawOnly('EKMR art. 6'),['1994:1219','K','6']);
assert.deepEqual(lawOnly('EKMR'),['1994:1219',null,null]);
assert.deepEqual(lawOnly('Barnkonventionen'),['2018:1197',null,null]);
assert.deepEqual(lawOnly('PL 10'),['1984:387','0','10'],'vanliga lagar påverkas inte');
console.log('Snabbkoder 1.6: lag utan lagrum och konventionsartiklar godkända');
