/* Lagboken 0.6 – överstrykningar i lagtext.
   En markering sparas som teckenpositioner i paragrafens text plus den markerade texten.
   Om lagtexten ändras söks texten upp igen; hittas den inte visas markeringen som inaktuell. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokHighlights=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const COLORS=[['yellow','Gul'],['green','Grön'],['rose','Rosa']];
  // Hitta markeringens läge i aktuell text: först sparade positioner, annars sökning på texten.
  function locate(text,h){
    if(text.slice(h.start,h.end)===h.quote)return {start:h.start,end:h.end};
    const at=text.indexOf(h.quote);
    return at>=0?{start:at,end:at+h.quote.length}:null;
  }
  function textNodes(container){
    const out=[],walk=n=>{for(const c of n.childNodes){if(c.nodeType===3)out.push(c);else if(c.nodeType===1)walk(c);}};
    walk(container);return out;
  }
  // Teckenpositioner för ett markerat område, räknat i containerns textContent.
  function offsets(container,range){
    let pos=0,start=null,end=null;
    for(const node of textNodes(container)){
      if(node===range.startContainer)start=pos+range.startOffset;
      if(node===range.endContainer)end=pos+range.endOffset;
      pos+=node.data.length;
    }
    if(start==null&&container.contains(range.startContainer))start=0;
    if(end==null&&container.contains(range.endContainer))end=pos;
    if(start==null||end==null||end<=start)return null;
    return {start,end};
  }
  // Omsluter [start,end) med <mark>-element utan att ändra textens struktur (länkar bevaras).
  function wrap(container,start,end,make){
    let pos=0;
    for(const node of textNodes(container)){
      const len=node.data.length,from=Math.max(start,pos),to=Math.min(end,pos+len);
      if(from<to){
        let target=node;
        if(to-pos<len)target.splitText(to-pos);
        if(from-pos>0)target=target.splitText(from-pos);
        const mark=make();target.parentNode.insertBefore(mark,target);mark.appendChild(target);
      }
      pos+=len;
      if(pos>=end)break;
    }
  }
  return {COLORS,locate,offsets,wrap,textNodes};
});
