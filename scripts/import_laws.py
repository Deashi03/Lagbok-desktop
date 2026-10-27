#!/usr/bin/env python3
"""SFS-import: hämta kompletta författningar från Riksdagens öppna data."""
import datetime as dt
import html
import collections
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parent))
import conventions

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/catalog.json"
OUT=ROOT/"data/laws"
MIN={"1942:740":250,"1962:700":150,"1984:387":30,"1947:948":15,"1998:1276":90,"1951:649":4,"2009:400":180,"2017:900":30,"1964:167":15,"1976:511":7,"1993:1617":20,"1968:64":8,"1996:67":20,"1974:152":80}
# Kapitel kan ha bokstav, t.ex. "1 a kap." med ankaret K1a.
CAP=re.compile(r'<a\s+name="K(\d+[a-z]?)"[^>]*>\s*\d+\s*[a-z]?\s*kap\.\s*(.*?)</a>',re.I|re.S)
PAR=re.compile(r'<a\s+class="paragraf"\s+name="(?:K(\d+[a-z]?))?P(\d+[a-z]?)"[^>]*>\s*<b>\s*(\d+\s*[a-z]?)\s*§\s*</b>\s*</a>',re.I|re.S)
HEAD=re.compile(r'<h4\b[^>]*>(.*?)</h4>',re.I|re.S)
# Riksdagen markerar lydelser med t.ex. "/Träder i kraft I:2027-01-01/" först i paragrafen.
MARK=re.compile(r'^/\s*(Träder i kraft I|Upphör att gälla U)\s*:\s*([^/\n]*?)\s*/\s*',re.I)
# Markeringar för rubriker och kapitel hamnar i föregående paragrafs text och tas bort därifrån.
NOTE=re.compile(r'\s*/\s*(?:Rubriken|Kapitlet)\s+(?:träder i kraft|upphör att gälla)[^/\n]*/\s*',re.I)
AMEND=re.compile(r'(?:(?<=[.\n])|^)\s*((?:Lag|Förordning)\s*\((\d{4}:\d+)\)\.?)\s*$')
REPEALED=re.compile(r'^(?:Kapitlet\s+)?(?:Har upphävts|Har upphört att gälla|Upphävd|Ny beteckning)\b',re.I)
LEGACY_SPLIT="\n\nALTERNATIV LYDELSE – KONTROLLERA IKRAFTTRÄDANDE:\n"
DATE=re.compile(r'\d{4}-\d{2}-\d{2}')
# Övergångsbestämmelser hamnar i Riksdagens text efter sista paragrafen och flyttas till en egen del.
TRANSITIONS=re.compile(r'\n\s*(?:Ikraftträdande- och )?[ÖO]vergångsbestämmelser\s*\n')
TRANSITION_SFS=re.compile(r'^(\d{4}:\d+(?: \d)?)\s*$',re.M)
LONG_PARAGRAPH=15000
def slug(sfs):return sfs.replace(":","-").replace(" ","-")
def clear(s):
    s=re.sub(r"<br\s*/?>","\n",s,flags=re.I)
    s=re.sub(r"</?(?:p|div|li|ol|ul)\b[^>]*>","\n",s,flags=re.I)
    s=html.unescape(re.sub(r"<[^>]*>","",s)).replace("\xa0"," ")
    s=re.sub(r"[ \t]+"," ",s)
    return re.sub(r"\n{3,}","\n\n",re.sub(r" *\n *","\n",s)).strip()
def tidy(s):
    s=str(s or "").replace("\r","").replace("\xa0"," ")
    s="\n".join(re.sub(r"[ \t]+"," ",line).strip() for line in s.split("\n"))
    return re.sub(r"\n{3,}","\n\n",s).strip()
def when(label):
    label=re.sub(r"\s+genom\s+(?:lag|förordning)\s*\(\d{4}:\d+\)\.?$","",label.strip(),flags=re.I).rstrip(".")
    m=DATE.search(label)
    return {"date":m[0] if m else None,"label":label}
ANNEX=re.compile(r"\n\s*(?:Bilaga\b[^\n]{0,80}|(?:AVTAL|Avtal|KONVENTION|Konvention|PROTOKOLL|Protokoll|AGREEMENT|CONVENTION)\b[^\n]{0,200}|(?:Art\.|Artikel|ARTIKEL)\s*\d+\.?)\s*\n")
def annex_start(text):
    """Var en lång bilaga (t.ex. barnkonventionen eller ett skatteavtal som gäller som lag) börjar, eller None."""
    if len(text)<=LONG_PARAGRAPH:return None
    m=re.search(r"\n\s*Bilaga\s*\n",text) or ANNEX.search(text,40)
    return m.start() if m else None
def version(raw):
    """En lydelse: ren text, ändringsförfattning och eventuellt ikraftträdande/upphörande."""
    text=tidy(raw);out={}
    cut=TRANSITIONS.search("\n"+text)
    if cut:
        out["_transitions"]=text[cut.end()-1:].strip();text=text[:max(0,cut.start()-1)].rstrip()
    # Långa bilagor (t.ex. barnkonventionens text) läggs i en egen del i stället för i paragrafen.
    while (cut:=annex_start(text)) is not None:
        rest=re.sub(r"^\s*Bilaga\s*\n","",text[cut:].strip()).strip()
        out["_appendix"]=rest+("\n\n"+out["_appendix"] if "_appendix" in out else "");text=text[:cut].rstrip()
    while True:
        m=MARK.match(text)
        if not m:break
        out["inForce" if m[1].lower().startswith("träder") else "expires"]=when(m[2])
        text=text[m.end():]
    text=tidy(NOTE.sub("\n\n",text))
    # Källan har ibland flera markeringar efter varandra ("Förordning (2022:1480). Förordning (2024:1200)."):
    # alla tas bort ur texten och den senaste blir ändringsuppgiften.
    found=[]
    while (m:=AMEND.search(text)) and m.start(1)>0:
        found.append(m[2]);text=text[:m.start()].rstrip()
    if found:out["amendedBy"]=max(found,key=amendment_key)
    out["text"]=text
    return out
def single_current(versions):
    """Högst en lydelse får gälla i dag utan datum. Finns flera (källan saknar markeringar) gäller den med
    senaste ändringen och som inte är en upphävandenotering; övriga märks som tidigare lydelse."""
    now=[v for v in versions if "inForce" not in v and not v.get("superseded")]
    if len(now)<=1:return versions
    best=max(now,key=lambda v:(not REPEALED.match(v["text"]),amendment_key(v["amendedBy"]) if v.get("amendedBy") else (0,0)))
    for v in now:
        if v is not best:v["superseded"]=True
    return [best]+[v for v in versions if v is not best]
def build_para(number,raws):
    versions=[version(r) for r in raws if r and r.strip()]
    transitions=[v.pop("_transitions") for v in versions if "_transitions" in v]
    appendix=[v.pop("_appendix") for v in versions if "_appendix" in v]
    # Riksdagen har ibland kvar både gammal och ny lydelse utan markering om ikraftträdande eller
    # upphörande. Den nyaste ändringen gäller; äldre omarkerade lydelser märks som tidigare lydelse.
    # En lydelse som upphör ett visst datum ersätts av en lydelse som träder i kraft samma dag. Saknar den nya
    # lydelsen markering i källan får den datumet från den som upphör.
    plain=[v for v in versions if "inForce" not in v and "expires" not in v]
    ending=[v for v in versions if v.get("expires")]
    if len(plain)==1 and len(ending)==1 and not any("inForce" in v for v in versions) and len(versions)==2:
        plain[0]["inForce"]=dict(ending[0]["expires"]);plain=[]
    if len(plain)>1:
        newest=max(plain,key=lambda v:amendment_key(v["amendedBy"]) if v.get("amendedBy") else (0,0))
        for v in plain:
            if v is not newest:v["superseded"]=True
        versions=[newest]+[v for v in versions if v is not newest]
    versions=single_current(versions)
    first=versions[0]
    item={"type":"para","number":number,"text":first["text"]}
    if len(versions)>1 or "inForce" in first or "expires" in first:
        item["versions"]=versions
    elif "amendedBy" in first:
        item["amendedBy"]=first["amendedBy"]
    if all(REPEALED.match(v["text"]) for v in versions):item["repealed"]=True
    if transitions:item["_transitions"]=transitions[0]
    if appendix:item["_appendix"]="\n\n".join(dict.fromkeys(appendix))
    return item
def split_transitions(block):
    """Delar övergångsbestämmelser per ändringsförfattning: [{"sfs":"2023:372","text":"…"}]."""
    parts=[];marks=list(TRANSITION_SFS.finditer(block))
    if not marks or marks[0].start()>0:
        head=block[:marks[0].start()] if marks else block
        if head.strip():parts.append({"sfs":None,"text":head.strip()})
    for i,m in enumerate(marks):
        end=marks[i+1].start() if i+1<len(marks) else len(block)
        text=block[m.end():end].strip()
        if text:parts.append({"sfs":m[1],"text":text})
    return parts
def take_transitions(chs):
    found=[]
    for c in chs:
        for p in c["items"]:
            if "_transitions" in p:found.append(p.pop("_transitions"))
    return split_transitions("\n".join(found)) if found else []
def amendment_key(sfs):
    y,n=sfs.split(":");return (int(y),int(n.split()[0]))
def latest_amendment(chs):
    found=[v.get("amendedBy") for c in chs for p in c["items"] if p["type"]=="para" for v in (p.get("versions") or [p])]
    found=[f for f in found if f]
    return max(found,key=amendment_key) if found else None
def num(s):
    m=re.fullmatch(r"(\d+)\s*([a-z]?)",s.strip().lower())
    if not m:raise ValueError("bad section "+s)
    return m[1]+(" "+m[2] if m[2] else "")
CHAPLABEL=re.compile(r'^\s*/\s*Kapitlet\s+(träder i kraft|upphör att gälla)\s*(?:I|U)?\s*:\s*([^/\n]*?)\s*/\s*',re.I)
CHAPLABEL_END=re.compile(r'/\s*Kapitlet\s+(träder i kraft|upphör att gälla)\s*(?:I|U)?\s*:\s*([^/\n]*?)\s*/\s*$',re.I)
def chapter_labels(caps):
    """Ett kapitel som i sin helhet träder i kraft eller upphör vid en viss tidpunkt: varje paragraf i kapitlet
    får samma markering som om den stod vid paragrafen, så att den kommande lydelsen inte visas som gällande."""
    for ch in caps:
        lab=ch.pop("_label",None)
        if not lab:continue
        prefix=("/Träder i kraft I:" if lab[0].lower().startswith("träder") else "/Upphör att gälla U:")+lab[1]+"/ "
        for item in ch["items"]:
            if item["type"]=="para":item["raw"]=[r if MARK.match(r.strip()) else prefix+r for r in item["raw"]]
def finish(caps):
    chapter_labels(caps)
    # Riksdagen may repeat a whole chapter for alternative or future versions.
    # Merge duplicate chapter identifiers WITHOUT discarding any paragraph text.
    by_id={};merged=[]
    for ch in caps:
        if ch["number"] not in by_id:
            by_id[ch["number"]]=ch;merged.append(ch)
        else:
            target=by_id[ch["number"]]
            # Kapitlet får en ny rubrik när en ändring träder i kraft: båda rubrikerna sparas.
            if ch.get("title") and ch["title"]!=target.get("title"):target.setdefault("titles",[]).append(ch["title"])
            if ch.get("division") and not target.get("division"):target["division"]=ch["division"]
            for item in ch["items"]:
                if item["type"]=="para":
                    for raw in item["raw"]:add(target,item["number"],raw)
                # Rubriker i en kommande version av kapitlet sparas för sig (de hör inte hemma bland de gällande).
                elif item.get("text") not in [x.get("text") for x in target["items"] if x["type"]=="heading"]:target.setdefault("otherHeadings",[]).append(item["text"])
    caps=merged
    # Upphävda kapitel ("11 kap. Har upphävts genom förordning (2026:678).") har inga paragrafer men sparas.
    # Kapitel utan paragrafer (upphävda, "Ny beteckning …" eller i äldre balkar bara rubriken) sparas med sin rubrik.
    gone=[{"number":c["number"],"title":c["title"]} for c in caps if not any(p["type"]=="para" for p in c["items"]) and (c.get("title") or "").strip()]
    caps=[c for c in caps if any(p["type"]=="para" for p in c["items"])]
    if gone and caps:caps[0]["_repealedChapters"]=gone
    for c in caps:
        c["items"]=[build_para(x["number"],x["raw"]) if x["type"]=="para" else x for x in c["items"]]
        waiting=[]
        for p in c["items"]:
            if p["type"]=="heading":waiting.append(p)
            else:
                for h in waiting:h["nextPara"]=p["number"]
                waiting=[]
        # Rubriker utan paragraf efter sig (t.ex. en rubrik som hör till en kommande lydelse sist i kapitlet) sparas för sig.
        stray=[x["text"] for x in c["items"] if x["type"]=="heading" and not x.get("nextPara")]
        if stray:c.setdefault("otherHeadings",[]).extend(h for h in stray if h not in c.get("otherHeadings",[]))
        c["items"]=[x for x in c["items"] if x["type"]!="heading" or x.get("nextPara")]
    return caps
def add(c,n,text):
    if not text:return
    prev=next((i for i in reversed(c["items"]) if i["type"]=="para" and i["number"]==n),None)
    if prev:prev["raw"].append(text)
    else:c["items"].append({"type":"para","number":n,"raw":[text]})
ORPHAN=re.compile(r"^(?:/[^/\n]{0,160}/\s*)?(\d+\s*[a-z]?)\s*§\s+(.+)$",re.S)
def orphan(cur,text,heading=None):
    """Paragraf utan ankare i källan ("1 § Fängelse döms ut …" direkt efter kapitelrubriken): läggs in som paragraf.
    Etiketter som "/Rubriken upphör att gälla …/" före eller efter numret tas bort."""
    text=re.sub(r"^\s*(?:/[^/\n]{0,160}/\s*)+","",text or "")
    m=ORPHAN.match(text)
    if not m:return False
    body=re.sub(r"^\s*/Rubriken[^/\n]{0,160}/\s*","",m[2]).strip()
    if len(body)<4:return False
    if heading:cur["items"].append({"type":"heading","text":heading,"editorial":False})
    add(cur,num(m[1]),body);return True
HEAD2=re.compile(r'<h2\b[^>]*>(.*?)</h2>',re.I|re.S)
# Riksdagsordningens tilläggsbestämmelser: "Tilläggsbestämmelse 4.3.1" följt av texten.
TB=re.compile(r"^\s*Tilläggsbestämmelse\s+(\d+(?:\.\d+)+)\s*$")
def plain_block(cur,text,heading=None):
    """Text utan paragrafankare i källan ("Registreringsmyndighet\n1 § Bolagsverket …" direkt efter en kapitel-
    rubrik): rader som börjar med "N §" blir paragrafer och korta rader före dem rubriker. Används bara när texten
    börjar med en paragraf (eventuellt efter korta rubrikrader); annars returneras False."""
    text=re.sub(r"^\s*(?:/[^/\n]{0,160}/\s*)+","",text or "")
    lines=[l for l in text.split("\n")]
    for l in lines:
        if re.match(r"^\s*\d+\s*[a-z]?\s*§\s+\S",l) or TB.match(l):break
        if len(l.strip())>=150:return False
    else:return False
    pend=[heading] if heading else [];para=None
    for l in lines:
        t=TB.match(l)
        if t:
            for h in pend:cur["items"].append({"type":"heading","text":h,"editorial":False})
            pend=[];cur["items"].append({"type":"para","number":t[1],"raw":[""]});para=cur["items"][-1];continue
        m=re.match(r"^\s*(\d+\s*[a-z]?)\s*§\s+(.*)$",l)
        if m:
            for h in pend:cur["items"].append({"type":"heading","text":h,"editorial":False})
            pend=[];n=num(m[1])
            add(cur,n,re.sub(r"^\s*/Rubriken[^/\n]{0,160}/\s*","",m[2]) or " ")
            para=next(x for x in reversed(cur["items"]) if x["type"]=="para" and x["number"]==n)
        elif para is None:
            if l.strip():pend.append(l.strip())
        else:para["raw"][-1]+="\n"+l
    return True
def division_name(text):
    t=re.sub(r"\s+"," ",text).strip()
    if t.upper()==t:t=t[:1]+t[1:].lower()
    t=re.sub(r"\b(avdelning|avd\.)\s+([ivxlc]+)\b",lambda m:m[1]+" "+m[2].upper(),t,flags=re.I)
    return re.sub(r"([.:]\s+)([a-zåäö])",lambda m:m[1]+m[2].upper(),t)
def annex_html(fragment):
    return re.sub(r"[ \t]*\r","",clear(re.sub(r"</h[234]>","\n\n",re.sub(r"<h[234]\b[^>]*>","\n\n",fragment,flags=re.I),flags=re.I)))
def chapter_no(n):
    m=re.match(r"\d+",str(n or ""));return int(m.group()) if m else None
def parse_html(source):
    match=re.search(r"<hr\b[^>]*>",source,re.I)
    if match:source=source[match.end():]
    source=re.sub(r'<div\s+class="sfstoc"[^>]*>.*?</ul>\s*</div>',"",source,flags=re.S|re.I)
    source=re.sub(r'<div\s+class="sfstoc"[^>]*>.*?</div>',"",source,flags=re.S|re.I)
    # Bilagor ("<h3>Bilaga 2</h3>" efter övergångsbestämmelserna) är lagtext men inga paragrafer. De sparas i sin
    # helhet som bilaga, med sina rubriker, i stället för att tolkas som paragrafer och rubriker.
    # Övergångsbestämmelserna har ett eget ankare ("overgang"); de sparas för sig även när sista kapitlet är
    # upphävt, och även när de står efter bilagorna.
    BILAGA=r"<h3\b[^>]*>\s*(?:<a\b[^>]*>\s*)?Bilag(?:a|or)\b"
    ov=re.search(r'<h3\b[^>]*name="overgang"|<a\s+name="overgang"',source,re.I)
    trans_text=None
    if ov:
        after=re.compile(BILAGA,re.I).search(source,ov.end())
        stop=after.start() if after else len(source)
        trans_text=tidy(re.sub(r"^\s*(?:Ikraftträdande- och )?[ÖO]vergångsbestämmelser\s*","",clear(source[ov.start():stop])))
        source=source[:ov.start()]+source[stop:]
    # En "Bilaga"-rubrik som följs av paragrafer är en vanlig rubrik; bilagan börjar vid den första som inte gör det.
    annex=next((m for m in re.finditer(BILAGA,source,re.I) if not re.search(r'class="paragraf"',source[m.end():])),None)
    annex_text=None
    if annex:
        annex_text=annex_html(source[annex.start():]);source=source[:annex.start()]
    def find_markers(src):
        out=[]
        for m in CAP.finditer(src):out.append((m.start(),m.end(),"cap",num(m[1]),clear(m[2])))
        for m in PAR.finditer(src):out.append((m.start(),m.end(),"para",num(m[1]) if m[1] else None,num(m[3])))
        for m in HEAD.finditer(src):
            h=clear(m[1])
            if h and len(h)<150:out.append((m.start(),m.end(),"heading","",h))
        for m in HEAD2.finditer(src):
            h=clear(m[1])
            if h and len(h)<200:out.append((m.start(),m.end(),"division","",h))
        return sorted(out,key=lambda x:x[0])
    markers=find_markers(source)
    # Text med rubriker efter lagens sista paragraf (t.ex. en konvention på franska med "Article 2" som rubriker)
    # är en bilaga, inte rubriker utan text.
    # Kapitelrubriker som egentligen är rader i en uppräkning ("14 kap. jordabalken i 1734 års lag;") är text.
    markers=[mk for mk in markers if not (mk[2]=="cap" and re.search(r"[;,]\s*$",mk[4]))]
    last_para=max((i for i,mk in enumerate(markers) if mk[2] in ("para","cap")),default=-1)
    for i in range(last_para+1,len(markers)):
        mk=markers[i];nxt=markers[i+1][0] if i+1<len(markers) else len(source)
        if mk[2]=="heading" and (re.match(r"Bilaga\b",mk[4]) or clear(source[mk[1]:nxt]) and not plain_block({"items":[]},clear(source[mk[1]:nxt]))):
            tail=annex_html(source[mk[0]:])
            annex_text=tail+("\n\n"+annex_text if annex_text else "")
            source=source[:mk[0]];markers=[x for x in markers if x[0]<mk[0]];break
    chapters=[];cur=None;pending=None;division=None;remap=None
    # Text före första paragrafen/kapitlet: märkning av hela författningen ("/Träder i kraft I:2027-01-01/"),
    # ingressen ("Regeringen föreskriver följande.") och inledande rubriker.
    head=clear(source[:markers[0][0]]) if markers else ""
    whole=None;preamble=[];lead=[]
    for m in re.finditer(r"/\s*(Träder i kraft|Upphör att gälla)\s*(?:I|U)?\s*:\s*([^/\n]*?)\s*(?:/|$)",head,re.I|re.M):
        if not whole:whole=(m[1],m[2])
    head=re.sub(r"/[^/\n]{0,160}(?:/|$)","",re.sub(r"^\s*/r\d+/\s*","",head,flags=re.M),flags=re.M)
    for line in [l.strip() for l in head.split("\n") if l.strip()]:
        if re.search(r"(?:föreskriver|förordnar|föreskrivs|stadgar|förordna[rt]?)\b[^.]*följande|^Utkom från trycket|^Kungl\. Maj:t|^KM:t",line,re.I) or len(line)>=150:preamble.append(line)
        else:lead.append(line)
    for i,(start,end,typ,key,value) in enumerate(markers):
        nxt=markers[i+1][0] if i+1<len(markers) else len(source)
        if typ=="division":
            # En avdelningsrad följd av text (t.ex. innehållsförteckningen i 1 kap. 1 § skatteförfarandelagen) hör
            # till paragrafen; annars är det en avdelning som nästa kapitel tillhör.
            trailing=clear(source[end:nxt])
            last=next((x for x in reversed(cur["items"]) if x["type"]=="para"),None) if cur else None
            if trailing and last is not None and not (i+1<len(markers) and markers[i+1][2]=="cap" and len(trailing)<200 and "§" not in trailing):
                last["raw"][-1]=last["raw"][-1].rstrip()+"\n\n"+value.strip()+"\n\n"+trailing;continue
            # Undertitlar som står som text efter avdelningsrubriken ("Om rättegången i allmänhet").
            division=" – ".join([division_name(value)]+[re.sub(r"\s+"," ",l).strip() for l in trailing.split("\n") if l.strip()]);continue
        if typ=="cap":
            remap=None
            # En kapitelrubrik med lägre nummer än det aktuella kapitlet (t.ex. inne i en tabell) är text, inte ett kapitel.
            if cur is not None and chapter_no(key) is not None and chapter_no(cur["number"]) is not None and chapter_no(key)<chapter_no(cur["number"]) and any(c["number"]==key for c in chapters):
                last=next((x for x in reversed(cur["items"]) if x["type"]=="para"),None)
                if last is not None:last["raw"][-1]+="\n"+clear(source[start:nxt])
                continue
            # "/Kapitlet träder i kraft I:…/" står i källan direkt före kapitelrubriken (eller direkt efter den).
            cur={"number":key,"title":value,"items":[]};chapters.append(cur)
            if division:cur["division"]=division;division=None
            trailing=clear(source[end:nxt]);m=CHAPLABEL.match(trailing)
            if m:pending=(m[1],m[2]);trailing=trailing[m.end():]
            if pending:cur["_label"]=pending;pending=None
            if not plain_block(cur,trailing):
                # Rubrikrader som står som text direkt efter kapitelrubriken. Efter ett upphävt kapitel
                # ("16 A kap. Har upphävts …") är det nästa avdelning ("Avd. 2. Förfarandet …").
                lines=[l.strip() for l in trailing.split("\n") if l.strip()]
                if lines and REPEALED.match(value or "") and i+1<len(markers) and markers[i+1][2]=="cap" and all(len(l)<200 and "§" not in l for l in lines):
                    division=" – ".join(lines)
                elif lines and all(len(l)<250 and "§" not in l for l in lines):
                    for h in lines:cur["items"].append({"type":"heading","text":h,"editorial":False})
        elif typ=="heading":
            if cur is None:
                cur={"number":"0","title":"","items":[]};chapters.append(cur)
            # Källan märker ibland ett stycke mitt i en paragraf som rubrik (<h4>), följt av resten av stycket.
            # En riktig rubrik följs direkt av nästa paragraf; finns text emellan hör allt till föregående paragraf.
            trailing=clear(source[end:nxt]);last=cur["items"][-1] if cur["items"] else None
            # Riksdagsordningens tilläggsbestämmelser ("Tilläggsbestämmelse 4.3.1") är bestämmelser, inte rubriker.
            # Rubriker direkt före en kapitelrubrik hör till avdelningen ("ANDRA AVDELNINGEN" / "Om brotten").
            j=i+1
            while j<len(markers) and markers[j][2] in ("heading","division") and not clear(source[markers[j][1]:markers[j+1][0] if j+1<len(markers) else len(source)]):j+=1
            if not trailing and j<len(markers) and markers[j][2]=="cap" and (division or cur["number"]!="0" or not any(x["type"]=="para" for x in cur["items"])):
                division=(division+" – " if division else "")+value;continue
            # Avdelningsrubrik med undertitel som text, direkt före en kapitelrubrik ("Första avdelningen" / "Om dragna växlar").
            sub=[l.strip() for l in trailing.split("\n") if l.strip()]
            if sub and i+1<len(markers) and markers[i+1][2]=="cap" and all(len(l)<150 and "§" not in l for l in sub):
                division=" – ".join(([division] if division else [])+[value]+sub);continue
            if division:cur["items"].append({"type":"heading","text":division,"editorial":False});division=None
            if trailing and plain_block(cur,trailing,value):continue
            # Underrubriker som står som text direkt efter rubriken ("När ska kontoavgift tas ut?").
            lines=[l.strip() for l in trailing.split("\n") if l.strip()]
            if lines and lines[0][:1].isupper() and all(len(l)<150 and "§" not in l for l in lines) and i+1<len(markers) and markers[i+1][2] in ("para","heading"):
                for h in [value]+lines:cur["items"].append({"type":"heading","text":h,"editorial":False})
                continue
            if trailing and not (last and last["type"]=="para"):
                # Text efter en rubrik som inte följer direkt på en paragraf: hör till närmast föregående paragraf.
                prior=next((x for x in reversed(cur["items"]) if x["type"]=="para"),None)
                if prior is not None:last=prior
                else:
                    for h in [value]+[l.strip() for l in trailing.split("\n") if l.strip()]:cur["items"].append({"type":"heading","text":h,"editorial":False})
                    continue
            if trailing and last and last["type"]=="para":
                before=last["raw"][-1].rstrip()
                last["raw"][-1]=before+"\n\n"+value.strip()+("\n\n" if re.search(r"[.:;]$",value.strip()) else " ")+trailing
                continue
            cur["items"].append({"type":"heading","text":value,"editorial":False})
        else:
            # Paragrafankare utan kapitelnummer ("P1") inne i ett kapitel hör till det kapitlet.
            if key is None:key=cur["number"] if cur is not None else "0"
            # Ankare utan kapitlets bokstav ("K4P1" i 4 a kap.) hör till det aktuella kapitlet.
            if cur is not None and key!=cur["number"] and re.fullmatch(re.escape(key)+r"\s*[a-z]",cur["number"]):key=cur["number"]
            # Kapitel vars rubrik saknar ankare ("<pre>2 kap. Hyran</pre>") och vars paragrafer har föregående kapitels ankare.
            if remap and key==remap[0]:key=remap[1]
            if cur is None or cur["number"]!=key:
                cur=next((c for c in chapters if c["number"]==key),None)
                if cur is None:
                    cur={"number":key,"title":"","items":[]};chapters.append(cur)
            if division and key=="0":cur["items"].append({"type":"heading","text":division,"editorial":False});division=None
            text=clear(source[end:nxt])
            tbm=re.search(r"\n\s*Tilläggsbestämmelse\s+\d+(?:\.\d+)+\s*\n",text)
            if tbm:
                add(cur,value,text[:tbm.start()].rstrip());plain_block(cur,text[tbm.start():]);continue
            hidden=re.search(r"\n\s*(\d+\s*[a-z]?)\s*kap\.[ \t]*([^\n]{0,150})(?:\n|$)",text)
            nextpara=next((mk for mk in markers[i+1:] if mk[2] in ("para","cap")),None)
            restarts=nextpara is not None and nextpara[2]=="para" and nextpara[3]==cur["number"] and chapter_no(nextpara[4]) is not None and chapter_no(value) is not None and chapter_no(nextpara[4])<=chapter_no(value) and chapter_no(nextpara[4])<=2
            tail_ok=hidden is not None and "§" not in hidden[2] and len(hidden[2])<120 and all(len(l.strip())<150 and "§" not in l for l in text[hidden.end():].split("\n"))
            nextno=hidden is not None and (chapter_no(hidden[1])==(chapter_no(cur["number"]) or 0)+1 or (chapter_no(hidden[1])==chapter_no(cur["number"]) and num(hidden[1])!=cur["number"] and re.search(r"[a-z]$",num(hidden[1]))))
            if hidden and tail_ok and restarts and nextno:
                rest=text[hidden.end():].strip();text=text[:hidden.start()].rstrip()
                add(cur,value,text)
                old=cur["number"];cur={"number":num(hidden[1]),"title":hidden[2].strip(),"items":[]};chapters.append(cur);remap=(old,cur["number"])
                for line in [l.strip() for l in rest.split("\n") if l.strip()]:cur["items"].append({"type":"heading","text":line,"editorial":False})
                continue
            m=CHAPLABEL_END.search(text)
            if m and i+1<len(markers) and markers[i+1][2]=="cap":pending=(m[1],m[2]);text=text[:m.start()].rstrip()
            add(cur,value,text)
    if whole and chapters:
        for c in chapters:c.setdefault("_label",whole)
    if lead and chapters:
        first=chapters[0]
        first["items"]=[{"type":"heading","text":l,"editorial":False} for l in lead if l not in [x.get("text") for x in first["items"]]]+first["items"]
    chs=finish(chapters)
    if chs and (preamble or whole):
        chs[0]["_preamble"]=preamble;chs[0]["_whole"]=whole
    if trans_text and chs:
        last=next((p for c in reversed(chs) for p in reversed(c["items"]) if p["type"]=="para"),None)
        if last is not None:last["_transitions"]=((last["_transitions"]+"\n") if last.get("_transitions") else "")+trans_text
    if annex_text and chs:
        last=next((p for c in reversed(chs) for p in reversed(c["items"]) if p["type"]=="para"),None)
        if last is not None:last["_appendix"]=(last["_appendix"]+"\n\n" if "_appendix" in last else "")+annex_text
    return chs
def parse_text(raw):
    chapters=[];cur={"number":"0","title":"","items":[]};chapters.append(cur);p=None
    for line in raw.splitlines():
        line=line.strip()
        if not line:
            if p:p["raw"][-1]+="\n"
            continue
        m=re.match(r"^(\d+\s*[a-z]?)\s*kap\.\s*(.*)",line)
        if m:
            cur={"number":num(m[1]),"title":m[2],"items":[]};chapters.append(cur);p=None;continue
        m=re.match(r"^(\d+\s*[a-z]?)\s*§\s*(.*)",line,re.I)
        if m:
            n=num(m[1]);add(cur,n,m[2] or " ");p=next(x for x in reversed(cur["items"]) if x["type"]=="para" and x["number"]==n)
        elif p:p["raw"][-1]+="\n"+line
        elif len(line)<110 and not re.match(r"^\d+\s",line):
            cur["items"].append({"type":"heading","text":line,"editorial":False})
    return finish(chapters)
def parse_plain(source):
    """Författningar utan "1 §": äldre lagar med "§ 1." (successionsordningen) delas på dessa, och lagar som
    bara består av en text (t.ex. "Avtalet ska gälla som lag här i landet" med avtalet som bilaga) blir en
    enda onumrerad paragraf."""
    match=re.search(r"<hr\b[^>]*>",source,re.I)
    source=source[match.end():] if match else source
    source=re.sub(r'<div\s+class="sfstoc"[^>]*>.*?</div>',"",source,flags=re.S|re.I)
    body=re.sub(r"^\s*Innehåll:\s*(?:Övergångsbestämmelser\s*)?","",clear(source))
    if len(body)<20:return []
    chs=parse_text(body)
    if count(chs):return chs
    parts=list(re.finditer(r"(?m)^§\s*(\d+\s*[a-z]?)\.?\s",body))
    cur={"number":"0","title":"","items":[]}
    if len(parts)>=2:
        head=body[:parts[0].start()].strip()
        for i,m in enumerate(parts):
            end=parts[i+1].start() if i+1<len(parts) else len(body)
            add(cur,num(m[1]),body[m.end():end].strip())
        chs=finish([cur])
        if head and chs:chs[0]["items"].insert(0,{"type":"heading","text":head[:140],"editorial":False})
        return chs
    add(cur,"1",body)
    chs=finish([cur])
    for c in chs:
        for p in c["items"]:
            if p["type"]=="para":p["unnumbered"]=True
    return chs
def count(chs):return sum(x["type"]=="para" for c in chs for x in c["items"])
def validate(chs,id):
    if count(chs)<MIN.get(id,1):raise ValueError("insufficient sections "+str(count(chs)))
    seen=set()
    for c in chs:
        for p in c["items"]:
            if p["type"]!="para":continue
            key=(c["number"],p["number"])
            if key in seen or any(len(v["text"])<4 for v in p.get("versions") or [p]):raise ValueError("duplicate or empty section "+str(key))
            seen.add(key)
def editorial(chs,sfs):
    if sfs!="1942:740":return
    c=next((x for x in chs if x["number"]=="28"),None)
    if c is None:return
    idx=next((i for i,x in enumerate(c["items"]) if x["type"]=="para" and x["number"]=="1"),None)
    if idx is None:return
    if idx and c["items"][idx-1]["type"]=="heading" and "husrannsakan" in c["items"][idx-1]["text"].lower():return
    c["items"].insert(idx,{"type":"heading","text":"Husrannsakan","editorial":True,"nextPara":"1"})
REPEALED_HEADER=re.compile(r'Upph(?:ä|&auml;)vd\s*(?:</?\w+[^>]*>\s*)*:?\s*(?:</?\w+[^>]*>\s*)*(\d{4}-\d{2}-\d{2})',re.I)
class Repealed(ValueError):pass
def check_in_force(doc,today=None):
    """Upphävda författningar finns kvar i Riksdagens databas men ska inte in i lagboken.
    Returnerar datumet om författningen upphör i framtiden, så att appen kan visa det."""
    head=(doc.get("html") or "")
    hr=re.search(r"<hr\b",head,re.I)
    head=head[:hr.start()] if hr else head[:3000]
    m=REPEALED_HEADER.search(head) or REPEALED_HEADER.search((doc.get("text") or "")[:1500])
    gone=re.search(r"Utgår genom\s+(?:SFS\s*)?(\d{4}:\d+)",re.sub(r"<[^>]+>"," ",head))
    if gone and not m:raise Repealed("utgår genom SFS "+gone[1])
    if not m:return None
    today=today or dt.date.today().isoformat()
    if m[1]<=today:raise Repealed("upphävd författning ("+m[1]+")")
    return m[1]
def check_title(meta,official):
    """Skydd mot fel SFS-nummer i katalogen: Riksdagens titel måste innehålla kontrollordet."""
    expected=meta.get("check")
    flat=lambda t:re.sub(r"\s+"," ",re.sub(r"[^\wåäö\- ]"," ",re.sub(r"\(\d{4}:\d+(?: \d)?\)","",str(t or "")).lower())).strip()
    if expected and flat(expected) not in flat(official):
        raise ValueError("titelkontroll: väntade '"+expected+"' i '"+str(official)+"'")
def document(id,name,method,chs,official=None):
    transitions=take_transitions(chs)
    gone=[g for c in chs for g in c.pop("_repealedChapters",[])]
    preamble=[l for c in chs for l in c.pop("_preamble",[])];whole=next((w for c in chs for w in [c.pop("_whole",None)] if w),None)
    appendix=[p.pop("_appendix") for c in chs for p in c["items"] if "_appendix" in p]
    out={"sfs":id,"title":name,"officialTitle":official,"sourceUrl":"https://data.riksdagen.se/dokument/sfs-"+slug(id)+".html","parser":method,
            "fetchedAt":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),"latestAmendment":latest_amendment(chs),"chapters":chs}
    # Avtalstext som följer efter övergångsbestämmelserna ("Bilaga") hör till bilagan, inte till övergångsbestämmelserna.
    for t in transitions:
        annex=re.search(r"\n\s*Bilaga\b[^\n]{0,80}\n",t["text"])
        if annex and len(t["text"])>LONG_PARAGRAPH and not appendix:
            appendix=[t["text"][annex.start():].strip()];t["text"]=t["text"][:annex.start()].strip()
    if gone:out["repealedChapters"]=gone
    if preamble:out["preamble"]="\n\n".join(preamble)
    if whole:out["inForce" if whole[0].lower().startswith("träder") else "expires"]=when(whole[1])
    if transitions:out["transitions"]=[t for t in transitions if t["text"]]
    if appendix:
        # Alla bilagor sparas (en lag kan ha bilagor på flera ställen), i källans ordning.
        out["appendix"]="\n\n".join(dict.fromkeys(appendix))
        # En konvention i bilagan (t.ex. Europakonventionen) läggs in i lagen artikel för artikel, som lagtext.
        out["chapters"]=chs+conventions.treaty_chapters(out["appendix"],conventions.name_for({"sfs":id,"name":name}))
    return out
def quality_warnings(old,new):
    """Tecken på tolkningsfel: kraftigt minskat antal paragrafer, tappade kapitel eller sammanklistrad text."""
    warn=[];a,b=paragraphs(old),paragraphs(new)
    if old and len(b)<0.9*len(a):warn.append("antalet paragrafer minskade från "+str(len(a))+" till "+str(len(b)))
    if old:
        lost=sorted({c["number"] for c in old["chapters"]}-{c["number"] for c in new["chapters"]})
        if lost:warn.append("kapitel saknas: "+", ".join(lost))
    long=[label(k) for k,p in b.items() if max(len(v["text"]) for v in p.get("versions") or [p])>LONG_PARAGRAPH]
    if long:warn.append("ovanligt långa paragrafer: "+", ".join(long[:10]))
    return warn
def paragraphs(doc):
    return {(c["number"],p["number"]):p for c in (doc or {}).get("chapters",[]) for p in c["items"] if p["type"]=="para"}
def label(key):return (key[0]+" kap. " if key[0]!="0" else "")+key[1]+" §"
def describe_changes(name,id,old,new):
    """Kort markdownsammanfattning av vad som ändrats, för granskning i pull request."""
    lines=["### "+name+" (SFS "+id+")"]
    if old is None:return "\n".join(lines+["Ny författning i lagboken."]+["- ⚠️ Kontrollera: "+w for w in quality_warnings(None,new)])
    a,b=paragraphs(old),paragraphs(new)
    added=[k for k in b if k not in a];removed=[k for k in a if k not in b]
    changed=[k for k in b if k in a and a[k]!=b[k]]
    upcoming=[k for k in changed+added if any("inForce" in v for v in b[k].get("versions",[]))]
    if new.get("latestAmendment")!=old.get("latestAmendment"):lines.append("- Senaste ändring: SFS "+str(new.get("latestAmendment")))
    for title,keys in (("Nya paragrafer",added),("Ändrade paragrafer",changed),("Borttagna paragrafer",removed),("Med kommande lydelse",upcoming)):
        if keys:lines.append("- "+title+" ("+str(len(keys))+"): "+", ".join(label(k) for k in keys[:40])+(" …" if len(keys)>40 else ""))
    for w in quality_warnings(old,new):lines.append("- ⚠️ Kontrollera: "+w)
    if len(lines)==1:lines.append("- Endast struktur eller metadata ändrad.")
    return "\n".join(lines)
def write_report(report,fail,repealed=()):
    target=os.environ.get("CHANGE_REPORT")
    text="## Ändringar från Riksdagens öppna data\n\n"+("\n\n".join(report) if report else "Inga ändringar i lagtexten.")
    if repealed:text+="\n\n**Upphävda och borttagna ur lagboken:**\n"+"\n".join("- "+f for f in repealed)
    if fail:text+="\n\n**Kunde inte importeras:**\n"+"\n".join("- "+f for f in fail)
    text+="\n\nKontrollera lagtext, ikraftträdande och övergångsbestämmelser innan sammanslagning. Redaktionella rubriker kontrolleras av testerna."
    print(text)
    if target:Path(target).write_text(text+"\n",encoding="utf-8")
HISTORY=ROOT/"data/history";CHANGES=ROOT/"data/changes.json"
def current_text(item):
    """Den lydelse som gäller i dag (samma regel som appen): utan kommande- eller upphörandemarkering."""
    today=dt.date.today().isoformat()
    for v in item.get("versions") or [item]:
        f=(v.get("inForce") or {}).get("date");e=(v.get("expires") or {}).get("date")
        if v.get("superseded") or (v.get("inForce") and (not f or f>today)) or (e and e<=today):continue
        return v
    return None
def record_history(sfs,name,old,new):
    """Sparar lydelser som ersätts (data/history/<sfs>.json) och en ändringslogg (data/changes.json),
    så att appen kan visa lydelsen vid ett visst datum och vad som är nytt sedan förra månaden."""
    today=dt.date.today().isoformat()
    a,b=paragraphs(old),paragraphs(new)
    added=[k for k in b if k not in a];removed=[k for k in a if k not in b];changed=[]
    hist_file=HISTORY/(slug(sfs)+".json")
    hist=json.loads(hist_file.read_text(encoding="utf-8")) if hist_file.exists() else []
    for k in b:
        if k not in a:continue
        before,after=current_text(a[k]),current_text(b[k])
        if before and after and before["text"]!=after["text"]:
            changed.append(k)
            hist.append({"chapter":k[0],"number":k[1],"text":before["text"],"amendedBy":before.get("amendedBy"),"until":today})
    for k in removed:
        before=current_text(a[k])
        if before:hist.append({"chapter":k[0],"number":k[1],"text":before["text"],"amendedBy":before.get("amendedBy"),"until":today})
    if hist:
        HISTORY.mkdir(parents=True,exist_ok=True)
        hist_file.write_text(json.dumps(hist,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    if old is None or added or changed or removed:
        log=json.loads(CHANGES.read_text(encoding="utf-8")) if CHANGES.exists() else []
        log.append({"date":today,"sfs":sfs,"name":name,"new":old is None,"amendedBy":new.get("latestAmendment"),
                    "added":[list(k) for k in added][:200],"changed":[list(k) for k in changed][:200],"removed":[list(k) for k in removed][:200]})
        CHANGES.write_text(json.dumps(log[-3000:],ensure_ascii=False,indent=0)+"\n",encoding="utf-8")
def flat(text):return re.sub(r"[^0-9a-zåäöéüæø]+","",str(text or "").lower())
def missing_words(source_html,doc):
    """Rader i riksdagen.se:s text som inte finns i den tolkade författningen (tappad text vid tolkningen).
    Jämförelsen görs utan mellanslag och skiljetecken, så att radbrytningar och tabeller inte spelar roll.
    Ändringsmarkeringar ("Lag (2014:588).") och etiketter ("/Träder i kraft …/") flyttas till egna fält och räknas inte."""
    body=source_html or ""
    hr=re.search(r"<hr\b[^>]*>",body,re.I);body=body[hr.end():] if hr else body
    body=re.sub(r'<div\s+class="sfstoc"[^>]*>.*?</ul>\s*</div>',"",body,flags=re.S|re.I)
    text=clear(body)
    # Ändringsmarkering som är radbruten i källan ("… nivå. Lag\n(2010:1408).") räknas som en markering.
    text=re.sub(r"\b(Lag|Förordning)\s*\n\s*(\(\d{4}:\d+\)\.?)",r"\1 \2",text)
    parts=[]
    for c in doc.get("chapters",[]):
        parts+=[c.get("title"),c.get("division"),*(c.get("titles") or []),*(c.get("otherHeadings") or [])]
        for i in c["items"]:
            if i["type"]=="heading":parts.append(i["text"])
            else:
                for v in i.get("versions") or [i]:parts+=[v.get("text"),(v.get("inForce") or {}).get("label"),(v.get("expires") or {}).get("label")]
    parts+=[t.get("text") for t in doc.get("transitions") or []]+[doc.get("appendix"),doc.get("preamble")]+[g["title"] for g in doc.get("repealedChapters") or []]
    parts+=[t.get("sfs") for t in doc.get("transitions") or []]
    have=flat(" ".join(str(p) for p in parts if p))
    lost=[]
    for line in text.split("\n"):
        l=re.sub(r"/\s*(?:Träder|Upphör|Rubriken|Kapitlet|Ersätts)[^/\n]{0,160}(?:/|$)","",line)
        l=re.sub(r"(?:\s*(?:Lag|Förordning|Kungörelse)\s*\(\d{4}:\d+\)\s*\.?)+\s*$","",l)
        l=re.sub(r"^\s*\d+\s*[a-z]?\s*(?:§|kap\.)\s*","",l)
        if TB.match(l):continue
        if re.match(r"\s*Utkom från trycket\b",l):continue
        f=flat(l)
        if len(f)<15 or re.fullmatch(r"(?:övergångsbestämmelser|innehåll|ikraftträdande)+",f):continue
        probe=f[5:45]
        if probe not in have:lost.append(line.strip()[:120])
    return len(lost),lost[:5]
def unconsolidated(doc):
    """Riksdagen anger en senare ändring (amendedTo) än den som finns inarbetad i texten, bilagan eller
    övergångsbestämmelserna. Då har källans sammanställning ännu inte uppdaterats."""
    to=doc.get("amendedTo")
    if not to or to==doc["sfs"]:return None
    text=json.dumps([doc.get("chapters"),doc.get("appendix"),doc.get("transitions")],ensure_ascii=False)
    if to in text:return None
    latest=doc.get("latestAmendment")
    if latest and amendment_key(latest)>=amendment_key(to):return None
    return to
def fetch(sfs):
    # Äldre författningar ("1736:0123 2", "1898:64 s.10") har mellanslag i Riksdagens dokument-id.
    ids=["sfs-"+slug(sfs)]
    if " " in sfs:ids.append("sfs-"+sfs.replace(":","-"))
    for n,doc_id in enumerate(ids):
        url="https://data.riksdagen.se/dokument/"+urllib.parse.quote(doc_id)+".json"
        req=Request(url,headers={"User-Agent":"LagbokenImporter/0.1","Accept":"application/json"})
        for attempt in range(3):
            try:
                with urlopen(req,timeout=50) as f:return json.load(f)
            except HTTPError as ex:
                if ex.code==404 and n<len(ids)-1:break
                if attempt==2:raise
                time.sleep(attempt+1)
            except Exception:
                if attempt==2:raise
                time.sleep(attempt+1)
def run():
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"));changed=False;fail=[];report=[];repealed=[];completeness={}
    # ONLY=new hämtar bara författningar som ännu saknar lagtext; ONLY=2010:1932,2011:154 bara de angivna.
    only=os.environ.get("ONLY","").strip()
    # Konventionerna (typ "konvention") byggs av scripts/conventions.py ur lagarnas bilagor och hämtas inte här.
    metas=[m for m in catalog["laws"] if m["type"]!="konvention"]
    if only=="new":metas=[m for m in metas if not (OUT/(slug(m["sfs"])+".json")).exists()]
    elif only:metas=[m for m in metas if m["sfs"] in set(x.strip() for x in only.split(","))]
    # Hämtningen sker parallellt; tolkningen sker i katalogens ordning.
    # I omgångar om 150, så att minnet räcker även när tusentals författningar hämtas.
    pool=ThreadPoolExecutor(max_workers=int(os.environ.get("WORKERS","6")));futures={}
    for n,meta in enumerate(metas):
        if n%150==0:
            futures={m["sfs"]:pool.submit(fetch,m["sfs"]) for m in metas[n:n+150]}
        id=meta["sfs"]
        try:
            status=futures[id].result().get("dokumentstatus",{})
            doc=status.get("dokument",{})
            # Riksdagens uppgift om senaste ändring ("t.o.m. SFS 2026:1622"), för kontroll av att ingen ändring saknas.
            upp=(status.get("dokuppgift") or {}).get("uppgift") or []
            upp=upp if isinstance(upp,list) else [upp]
            amended_to=next((re.search(r"(\d{4}:\d+)",u.get("text","")).group(1) for u in upp if u.get("kod")=="andrattillochmed" and re.search(r"\d{4}:\d+",u.get("text",""))),None)
            official=doc.get("titel")
            check_title(meta,official)
            repeal_at=check_in_force(doc)
            chs=parse_html(doc.get("html") or "")
            method="HTML"
            if count(chs)<MIN.get(id,5):
                chs=parse_text(doc.get("text") or "");method="TEXT"
            if count(chs)==0:
                chs=parse_plain(doc.get("html") or "");method="PLAIN"
            validate(chs,id)
            editorial(chs,id)
            output=document(id,meta["name"],method,chs,official)
            if repeal_at:output["repealAt"]=repeal_at
            # "Ändrad: t.o.m. SFS …" i riksdagen.se:s huvud anger hur långt texten är uppdaterad.
            if amended_to:output["amendedTo"]=amended_to
            lost,sample=missing_words(doc.get("html"),output) if method=="HTML" else (0,[])
            if lost:completeness[id]={"name":meta["name"],"missing":lost,"lines":sample}
            chaptered=any(c["number"]!="0" for c in chs)
            if meta.get("chaptered")!=chaptered:meta["chaptered"]=chaptered;changed=True
            file=OUT/(slug(id)+".json")
            previous=None
            if file.exists():
                previous=json.loads(file.read_text(encoding="utf-8"))
                if {k:v for k,v in output.items() if k!="fetchedAt"}=={k:v for k,v in previous.items() if k!="fetchedAt"}:
                    print(id,"unchanged");continue
            report.append(describe_changes(meta["name"],id,previous,output))
            if not os.environ.get("NO_HISTORY"):record_history(id,meta["name"],previous,output)
            OUT.mkdir(parents=True,exist_ok=True)
            file.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
            print(id,"imported",count(chs),"paragraphs",method)
            changed=True
        except Repealed as ex:
            # Upphävd: tas bort ur lagboken och redovisas i rapporten.
            print(id,"REPEALED",ex,file=sys.stderr)
            f=OUT/(slug(id)+".json")
            if f.exists():f.unlink()
            if meta.get("available") is not False:meta["available"]=False;changed=True
            repealed.append(id+" ("+meta["name"]+"): "+str(ex))
            continue
        except Exception as ex:
            print(id,"FAILED",ex,file=sys.stderr);fail.append(id+" ("+meta["name"]+"): "+str(ex)[:200])
            # En författning som aldrig har kunnat importeras döljs i appen tills importen lyckas.
            if not (OUT/(slug(id)+".json")).exists() and meta.get("available") is not False:
                meta["available"]=False;changed=True
            continue
        if meta.get("available") is False:
            meta.pop("available");changed=True
    if changed:
        catalog["generated"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if changed and not report:report.append("Katalogen uppdaterad (kapitelindelning).")
    write_report(report,fail,repealed)
    # Fullständighetskontroll: författningar där ord ur källan saknas i den tolkade texten.
    cfile=ROOT/"data/completeness.json"
    old=json.loads(cfile.read_text(encoding="utf-8")) if cfile.exists() else {}
    done={m["sfs"] for m in metas}
    merged={k:v for k,v in old.items() if k not in done};merged.update(completeness)
    cfile.write_text(json.dumps(dict(sorted(merged.items())),ensure_ascii=False,indent=1)+"\n",encoding="utf-8")
    print("Fullständighet:",len(completeness),"av",len(metas),"författningar har text som saknas jämfört med riksdagen.se")
    # Misslyckade författningar stoppar inte övriga; arbetsflödet markeras som misslyckat efter granskningsförslaget.
    if fail and not os.environ.get("CHANGE_REPORT"):sys.exit("Manual review needed: "+", ".join(fail))
if __name__=="__main__":run()
