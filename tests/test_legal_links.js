const assert=require('node:assert/strict');
const {parseRefs,linkify}=require('../assets/legal-links.js');
const href=(s,c,p)=>'#/law/'+encodeURIComponent(s)+'/'+c+'/'+p;
const exists=(s,c,p)=>!!({
 '1962:700':{'8':['1','2'],'24':['1','2']},
 '1942:740':{'23':['1','2'],'28':['1']},
 '1947:948':{'0':['12']},
 '1984:387':{'0':['10']}
}[s]?.[c]?.includes(p));
const local={sfs:'1962:700',chapter:'8',href,exists};
const a=linkify('Är brott som avses i 1 § med hänsyn till värdet ringa.',local);
assert.match(a,/class="law-ref"/);
assert.match(a,/#\/law\/1962%3A700\/8\/1/);
assert.match(linkify('24 kap. 1 § brottsbalken',local),/#\/law\/1962%3A700\/24\/1/);
assert.match(linkify('23 kap. 1 § rättegångsbalken',local),/#\/law\/1942%3A740\/23\/1/);
assert.match(linkify('10 § polislagen',local),/#\/law\/1984%3A387\/0\/10/);
assert.doesNotMatch(linkify('Fråga enligt 7 § lagen (2020:123)',local),/class="law-ref"/);
assert.doesNotMatch(linkify('Se 99 § i detta kapitel',local),/class="law-ref"/);
assert.doesNotMatch(linkify('Lag (2017:442).',local),/class="law-ref"/);
assert.deepEqual(parseRefs('23 kap. 1 § rättegångsbalken',local)[0].numbers,['1']);
console.log('Juridiska länkar: 9 kontroller godkända');

assert.match(linkify('Se 1 och 2 §§ i detta kapitel',local),/data-ref-para="1"/);
assert.match(linkify('Se 1 och 2 §§ i detta kapitel',local),/data-ref-para="2"/);

const more={sfs:'1962:700',chapter:'24',href,exists:()=>true};
assert.match(linkify('enligt 10 § polislagen (1984:387)',more),/data-ref-sfs="1984:387"/);
assert.match(linkify('enligt 2 § lagen (1976:511) om omhändertagande av berusade personer',more),/data-ref-sfs="1976:511"[^>]*data-ref-chapter="0"/);
assert.match(linkify('35 kap. 21 § offentlighets- och sekretesslagen',more),/data-ref-sfs="2009:400"/);
assert.doesNotMatch(linkify('3 och 4 §§ lagen (2025:1062) om polisens användning av skjutvapen',more),/class="law-ref"/);
assert.match(linkify('24 kap. 7 § första stycket rättegångsbalken',more),/data-ref-sfs="1942:740"/);
console.log('Juridiska länkar: hänvisningar till andra författningar godkända');
const range=linkify('enligt 1-4 §§ detta kapitel',more);
assert.match(range,/data-ref-para="1" data-ref-to="4"[^>]*>1-4<\/a>/,'ett intervall länkas som en helhet');
const withMembers={...more,members:()=>['1','2','3','3a','4'],chapters:()=>['24','25','26','27','28']};
assert.deepEqual(parseRefs('enligt 1–4 §§',withMembers)[0].numbers,['1','2','3','3a','4'],'alla paragrafer i intervallet räknas');
assert.match(linkify('Om brott, som i 7--9 §§ sägs',withMembers),/>7--9<\/a> §§/);
const chap=linkify('ett tvångsmedel enligt 24-28 kap., om inte',{...withMembers,sfs:'1942:740',chapter:'23'});
assert.match(chap,/data-ref-chapter="24" data-ref-chapter-to="28"[^>]*>24-28<\/a> kap\./,'kapitelintervall länkas');
assert.deepEqual(parseRefs('enligt 24–28 kap.',{...withMembers,sfs:'1942:740',chapter:'23'})[0].chapters,['24','25','26','27','28']);
assert.equal((linkify('3 och 4 kap. brottsbalken',{...more,sfs:'1942:740',chapter:'23'}).match(/class="law-ref"/g)||[]).length,2,'kapitel i uppräkning länkas var för sig');
console.log('Juridiska länkar: intervall godkända');

// 0.6: uppräkningar med ett paragraftecken, listor, kapitel, stycken och "samma balk"
const all={sfs:'1942:740',chapter:'23',href,exists:()=>true};
const list=linkify('Ska enligt 21 kap. 3 a eller 3 b § en offentlig försvarare',all);
assert.match(list,/data-ref-chapter="21" data-ref-para="3a"[^>]*>3 a<\/a> eller <a[^>]*data-ref-para="3b"/);
const four=linkify('enligt 3 kap. 1, 2, 5 eller 6 § brottsbalken',all);
assert.equal((four.match(/data-ref-sfs="1962:700" data-ref-chapter="3"/g)||[]).length,4);
assert.match(linkify('brott enligt 6 kap. brottsbalken',all),/data-ref-sfs="1962:700" data-ref-chapter="6" aria-label/);
assert.match(linkify('enligt 8 § första stycket 2 polislagen',all),/data-ref-sfs="1984:387" data-ref-chapter="0" data-ref-para="8"/);
const chain=linkify('Bestämmelserna i 21 kap. 5-8 §§, 9 § tredje stycket, 10 § och 10 a § rättegångsbalken',{...all,sfs:'1964:167',chapter:'0'});
assert.match(chain,/data-ref-chapter="21" data-ref-para="9"/);
assert.match(chain,/data-ref-chapter="21" data-ref-para="10a"/);
const same=linkify('insyn i 23 kap. 18 § rättegångsbalken och 23 kap. 21 a § samma balk',{...all,sfs:'1964:167',chapter:'0'});
assert.equal((same.match(/data-ref-sfs="1942:740"/g)||[]).length,2);
assert.doesNotMatch(linkify('1 kap. 1 och 7 §§ tryckfrihetsförordningen',{...all,sfs:'2009:400'}),/class="law-ref"/);
assert.match(linkify('Ett kvarhållande enligt 8 a § får',all),/>8 a §<\/a>/);
console.log('Juridiska länkar 0.6: uppräkningar, kapitel, stycken och samma balk godkända');
