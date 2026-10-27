const assert=require('node:assert/strict');
const {locate}=require('../assets/highlights.js');
const text='Den som hotar någon annan med brottslig gärning döms för olaga hot.';
assert.deepEqual(locate(text,{start:8,end:13,quote:'hotar'}),{start:8,end:13});
assert.deepEqual(locate('Ny inledning. '+text,{start:8,end:13,quote:'hotar'}),{start:22,end:27});
assert.equal(locate('Helt ny text.',{start:0,end:5,quote:'hotar'}),null);
console.log('Överstrykningar: placering efter lagändring godkänd');
