/* Lagboken 0.5 – val av lydelse. Avgör vilken lydelse som gäller ett visst datum
   utifrån Riksdagens markeringar om ikraftträdande och upphörande. Gissar aldrig:
   ett obestämt datum ("den dag som regeringen bestämmer") räknas som ej inträffat. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokLaw=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function today(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function status(v,day){
    const started=!v.inForce||(!!v.inForce.date&&v.inForce.date<=day);
    const ended=!!(v.expires&&v.expires.date&&v.expires.date<=day);
    if(v.superseded)return started&&!ended?'superseded':ended?'expired':'upcoming';
    return !started?'upcoming':ended?'expired':'current';
  }
  function versions(item){
    return item.versions&&item.versions.length?item.versions:[{text:item.text,amendedBy:item.amendedBy}];
  }
  // {current, others, pending}: pending = paragrafen har ingen lydelse som gäller i dag.
  function resolve(item,day){
    day=day||today();
    const list=versions(item).map((v,i)=>Object.assign({},v,{index:i,status:status(v,day)}));
    const current=list.find(v=>v.status==='current')||list.find(v=>v.status==='upcoming')||list[0];
    const others=list.filter(v=>v!==current&&v.status!=='expired');
    return {current,others,pending:current.status!=='current'};
  }
  function formatDate(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
    if(!m)return iso||'';
    const months=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
    return Number(m[3])+' '+months[Number(m[2])-1]+' '+m[1];
  }
  function when(mark){return mark.date?formatDate(mark.date):'den dag regeringen bestämmer';}
  function describe(v){
    if(v.status==='upcoming')return 'Kommande lydelse · träder i kraft '+when(v.inForce);
    if(v.status==='expired')return 'Upphörd lydelse';
    if(v.status==='superseded')return 'Tidigare lydelse'+(v.amendedBy?' (SFS '+v.amendedBy+')':'')+' · kan gälla enligt övergångsbestämmelser';
    if(v.expires)return 'Gäller till '+(v.expires.date?formatDate(v.expires.date):'den dag regeringen bestämmer');
    return 'Annan lydelse i källan';
  }
  // Kontrollsummor för ändringsbevakning. Samma beräkning används i scripts/build_indexes.js.
  function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
  function paraHash(item){return hash(JSON.stringify(item.versions||[item.text]));}
  function snapshot(doc){
    const paras={},parts=[];
    for(const ch of doc.chapters)for(const item of ch.items){
      if(item.type!=='para')continue;
      const h=paraHash(item);paras[ch.number+'|'+item.number]=h;parts.push(ch.number+'|'+item.number+'|'+h);
    }
    return {hash:hash(parts.join(';')),paras};
  }
  function diff(before,doc){
    const now=snapshot(doc),added=[],changed=[],removed=[];
    for(const k in now.paras){if(!(k in before.paras))added.push(k);else if(before.paras[k]!==now.paras[k])changed.push(k);}
    for(const k in before.paras)if(!(k in now.paras))removed.push(k);
    return {added,changed,removed,snapshot:now};
  }
  // Ordvis jämförelse mellan två lydelser: [{type:'same'|'del'|'ins',text}]
  function diffWords(a,b){
    const A=String(a||'').split(/(\s+)/),B=String(b||'').split(/(\s+)/);
    if(A.length*B.length>4e6)return [{type:'del',text:a},{type:'ins',text:b}];
    const n=A.length,m=B.length,L=new Array((n+1)*(m+1)).fill(0),w=m+1;
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*w+j]=A[i]===B[j]?L[(i+1)*w+j+1]+1:Math.max(L[(i+1)*w+j],L[i*w+j+1]);
    const out=[],push=(type,text)=>{const last=out[out.length-1];if(last&&last.type===type)last.text+=text;else out.push({type,text});};
    let i=0,j=0;
    while(i<n&&j<m){
      if(A[i]===B[j]){push('same',A[i]);i++;j++;}
      else if(L[(i+1)*w+j]>=L[i*w+j+1])push('del',A[i++]);
      else push('ins',B[j++]);
    }
    while(i<n)push('del',A[i++]);while(j<m)push('ins',B[j++]);
    // Slå ihop ändringar som bara skiljs åt av mellanrum till ett struket och ett nytt block,
    // så att texten läses som "gammal formulering → ny formulering" i stället för ord för ord.
    const marked=out.map(x=>(/^\s+$/.test(x.text)?{type:'same',text:x.text}:x)),res=[];
    for(let k=0;k<marked.length;k++){
      const x=marked[k];
      if(x.type==='same'){res.push(x);continue;}
      let del='',ins='';
      while(k<marked.length){
        const y=marked[k];
        if(y.type==='del')del+=y.text;else if(y.type==='ins')ins+=y.text;
        else if(/^\s+$/.test(y.text)&&marked[k+1]&&marked[k+1].type!=='same'){del+=del?y.text:'';ins+=ins?y.text:'';}
        else break;
        k++;
      }
      k--;
      if(del)res.push({type:'del',text:del});
      if(ins)res.push({type:'ins',text:ins});
      if(marked[k+1]&&marked[k+1].type==='same'&&(del||ins))res.push({type:'same',text:''});
    }
    return res.filter(x=>x.text!=='');
  }
  return {today,status,resolve,describe,formatDate,hash,paraHash,snapshot,diff,diffWords};
});
