#!/usr/bin/env python3
"""Internationella konventioner och avtal som gäller som svensk lag.

Många lagar inkorporerar en konvention genom att återge den i en bilaga (t.ex. Europakonventionen i
lag 1994:1219). Riksdagens text har bilagan som ett enda textblock, ofta med flera språkversioner.
Skriptet tar ut den svenska texten artikel för artikel och sparar den som en egen post i lagboken
(data/laws/<sfs>-K.json, typ "konvention", avdelningen "internationellt"). Därmed fungerar sökning,
snabbkoder ("EKMR 8"), favoriter, markeringar och länkar för konventionerna som för andra författningar.

  python scripts/conventions.py     uppdaterar konventionerna efter senaste import"""
import json,re,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/catalog.json";LAWS=ROOT/"data/laws"
SECTION=("internationellt","Internationella konventioner och avtal")
# Kända konventioner: namn och förkortningar som används i praktiken. Övriga får namn efter lagen.
KNOWN={
 "1994:1219":("Europakonventionen",["EKMR","Europakonventionen","Europeiska konventionen om de mänskliga rättigheterna","Europeiska konventionen angående skydd för de mänskliga rättigheterna"]),
 "2018:1197":("Barnkonventionen",["Barnkonventionen","FN:s barnkonvention","Konventionen om barnets rättigheter"]),
 "1987:822":("FN:s konvention om internationella köp (CISG)",["CISG","Wienkonventionen","Köpkonventionen"]),
 "2009:1514":("FN:s konvention om immunitet för stater och deras egendom",["Immunitetskonventionen"]),
 "1990:313":("Europaråds- och OECD-konventionen om ömsesidig handräckning i skatteärenden",[]),
}
ORDER=list(KNOWN)
HEAD=re.compile(r"^Artikel\s+(\d{1,3}|[IVXLC]{1,7})(?:\s?([a-z]))?\b\s*(?:[-–.:]\s*)?(.*)$",re.S)
PARTHEAD=re.compile(r"^(DEL|Del|AVDELNING|Avdelning|KAPITEL|Kapitel|AVSNITT|Avsnitt)\s+([IVXLC]+|\d+)\b\s*[-–.:]?\s*(.*)$",re.S)
PARTTITLE=re.compile(r"^(?:Tilläggsprotokoll|Fakultativt protokoll|Protokoll|Konvention|Europeisk konvention|Överenskommelse|Avtal|Fördrag)\b",re.I)
def roman(s):
    if s.isdigit():return int(s)
    v={"I":1,"V":5,"X":10,"L":50,"C":100};n=0
    for a,b in zip(s,s[1:]+" "):n+=-v[a] if b!=" " and v[a]<v[b] else v[a]
    return n
def words(block,ws):return sum(len(re.findall(r"\b"+w+r"\b",block,re.I)) for w in ws)
def foreign(block):
    """Engelska, franska, danska eller norska stycken hör till andra språkversioner."""
    sv=words(block,["och","att","skall","ska","inte","eller","enligt","denna"])
    en=words(block,["the","of","shall","and","this","which","or"])
    fr=words(block,["le","la","les","des","et","du"])
    no=words(block,["og","ikke","skal","af","denne"])
    de=words(block,["und","der","die","des","nicht","oder","wird","werden","dieses"])
    return max(en,fr,no,de)>=2 and max(en,fr,no,de)>sv
def tidy(t):
    # Avstavning vid radbrytning i källan: "rät-\ntigheter" blir "rättigheter", men "fri- och" behålls.
    t=re.sub(r"([a-zåäö])-[ \t]*\n[ \t]*(?!och\b|eller\b|samt\b|till\b)([a-zåäö])",r"\1\2",t)
    return re.sub(r"[ \t]*\n[ \t]*"," ",t).strip()
def cap(t):
    t=t.strip().rstrip(".")
    if t.upper()==t and re.search(r"[A-ZÅÄÖ]{3}",t):t=t[:1]+t[1:].lower()
    return t
def heading(m,nxt):
    kind,num,rest=m.group(1),m.group(2),tidy(m.group(3))
    if not rest and nxt and len(nxt)<120 and not HEAD.match(nxt) and not foreign(nxt) and not re.search(r"[.;,]$",nxt):rest=nxt
    return kind.capitalize()+" "+num+(" – "+cap(rest) if rest else "")
def parse(text):
    blocks=[tidy(b) for b in re.split(r"\n\s*\n",(text or "").replace("\r","")) if b.strip()]
    parts=[];part=None;art=None;gap=[];closed=False;i=0
    while i<len(blocks):
        b=blocks[i];nxt=blocks[i+1] if i+1<len(blocks) else ""
        m=HEAD.match(b) if len(b)<220 else None
        if m:
            num=roman(m.group(1));letter=m.group(2) or "";title=tidy(m.group(3))
            # Rubriken kan stå på nästa rad ("Artikel 2" / "Definitioner").
            if not title and nxt and len(nxt)<110 and not HEAD.match(nxt) and not re.search(r"[.;,:]$",nxt) and not re.match(r"^(\d+\.|\(?[a-z]\)|[a-z]\.)\s",nxt) and nxt[:1].isupper() and not foreign(nxt):
                title=nxt;i+=1
            if part is None or num<=part["last"]:
                ptitle=next((re.sub(r"^[\dXIV.]+\s+","",g) for g in gap if PARTTITLE.match(re.sub(r"^[\dXIV.]+\s+","",g)) and len(g)<320 and not foreign(g)),None)
                part={"title":cap(ptitle) if ptitle else None,"items":[],"last":0};parts.append(part)
                # Rubriker strax före första artikeln ("Del I", "Kapitel I", "Tillämpningsområde").
                lead=[]
                for g in reversed(gap):
                    if PARTHEAD.match(g) and len(g)<200:lead.insert(0,g)
                    elif len(g)<120 and not re.search(r"[.;,:]$",g) and g[:1].isupper() and not foreign(g) and not PARTTITLE.match(g) and len(lead)<4:lead.insert(0,g)
                    else:break
                k=0
                while k<len(lead):
                    pm=PARTHEAD.match(lead[k])
                    if pm:
                        nx=lead[k+1] if k+1<len(lead) and not PARTHEAD.match(lead[k+1]) else ""
                        part["items"].append({"type":"heading","text":heading(pm,nx),"editorial":False});k+=2 if nx else 1
                    else:
                        if part["items"] or re.search(r"[A-ZÅÄÖ]{4}",lead[k]):part["items"].append({"type":"heading","text":cap(lead[k]),"editorial":False})
                        k+=1
            part["last"]=num;gap=[];closed=False
            art={"type":"para","number":str(num)+((" "+letter) if letter else ""),"text":"","title":cap(title) if title else ""}
            part["items"].append(art);i+=1;continue
        pm=PARTHEAD.match(b) if len(b)<200 else None
        if part is not None and pm and not foreign(b):
            h=heading(pm,nxt)
            if h.endswith(cap(nxt)) and nxt and nxt not in h[:len(h)-len(cap(nxt))]:i+=1
            part["items"].append({"type":"heading","text":h,"editorial":False});art=None;i+=1;continue
        if part is not None and art is None and b.upper()==b and len(b)<120 and re.search(r"[A-ZÅÄÖ]{4}",b) and not foreign(b):
            part["items"].append({"type":"heading","text":cap(b),"editorial":False});i+=1;continue
        if art is not None and not closed:
            # Slutformeln ("Till bekräftelse härav …", "Upprättat i …") hör inte till sista artikeln.
            if foreign(b) or PARTTITLE.match(re.sub(r"^[\dXIV.]+\s+","",b)) or re.match(r"(?:Till bekräftelse|Upprättat|Som skedde|Utfärdat|Gjort)\b",b):closed=True;gap.append(b)
            else:art["text"]=(art["text"]+"\n\n"+b).strip()
        else:gap.append(b)
        i+=1
    out=[]
    for p in parts:
        paras=[x for x in p["items"] if x["type"]=="para" and x["text"]]
        body=" ".join(x["text"] for x in paras)
        if len(paras)<2 or words(body,["och"])<max(words(body,["og"]),words(body,["und"])):continue  # dansk/norsk/tysk eller tom version
        for x in p["items"]:
            if x["type"]=="para" and not x["title"]:x.pop("title")
        p["items"]=[x for x in p["items"] if x["type"]=="heading" or x["text"]]
        # Ändringsmarkering i slutet av en artikel ("Förordning (1991:1183).") blir ändringsuppgift, inte text.
        for x in p["items"]:
            if x["type"]!="para":continue
            while (m:=re.search(r"\s*(?:Lag|Förordning)\s*\((\d{4}:\d+)\)\.?\s*$",x["text"])) and m.start()>0:
                x.setdefault("amendedBy",m[1]);x["text"]=x["text"][:m.start()].rstrip()
        # Rubriker utan artiklar efter sig (t.ex. i slutet av en språkversion) tas bort.
        while p["items"] and p["items"][-1]["type"]=="heading":p["items"].pop()
        out.append(p)
    return out
def short_name(law):
    t=re.sub(r"^(Lagen|Förordningen|Kungörelsen)\s+(?:om|angående)\s+(?:tillämpning\s+av\s+)?","",law["name"])
    t=re.sub(r"^(?:en|den)\s+","",t)
    return t[:1].upper()+t[1:]
def chapter_id(title,n,used):
    m=re.search(r"nr\s*(\d+)",title or "",re.I)
    cid="P"+m.group(1) if m else "P1" if re.match(r"Tilläggsprotokoll",title or "") else "B"+str(n)
    while cid in used:cid+="b"
    used.add(cid);return cid
def treaty_chapters(appendix,name):
    """Konventionens svenska text som kapitel i lagen: huvudtexten "K", protokoll "P1", "P4" …, övriga bilagor "B1" ….
    Kapitlen har unit "artikel" så att appen visar "Artikel 8" i stället för "8 §"."""
    parts=parse(appendix or "")
    if sum(1 for p in parts for x in p["items"] if x["type"]=="para")<5:return []
    used={"K"};out=[]
    for n,p in enumerate(parts):
        cid="K" if n==0 else chapter_id(p["title"],n,used)
        title=name if n==0 else (p["title"] or "Bilaga "+str(n))
        out.append({"number":cid,"title":re.sub(r"\s+"," ",title)[:160],"unit":"artikel","items":p["items"]})
    return out
def name_for(law):return KNOWN.get(law["sfs"],(short_name(law),[]))[0]
def run():
    """Lägger in konventionstexten i de redan importerade lagarna (samma som importen gör), utan nätåtkomst."""
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    # Tidigare versioner (1.6) hade konventionerna som egna poster ("…-K"); de ersätts av kapitel i lagen.
    old=[l for l in catalog["laws"] if l["type"]=="konvention"]
    for l in old:
        f=LAWS/(l["sfs"].replace(":","-")+".json")
        if f.exists():f.unlink()
    laws=[l for l in catalog["laws"] if l["type"]!="konvention"]
    made=0;arts=0
    for law in laws:
        f=LAWS/(law["sfs"].replace(":","-").replace(" ","-")+".json")
        if not f.exists():continue
        d=json.loads(f.read_text(encoding="utf-8"))
        own=[c for c in d["chapters"] if c.get("unit")!="artikel"]
        treaty=treaty_chapters(d.get("appendix"),name_for(law))
        if [c for c in d["chapters"] if c.get("unit")=="artikel"]!=treaty:
            d["chapters"]=own+treaty
            f.write_text(json.dumps(d,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
        if treaty:
            made+=1;arts+=sum(1 for c in treaty for x in c["items"] if x["type"]=="para")
            law["articleChapter"]="K"
            name,aliases=KNOWN.get(law["sfs"],(None,[]))
            law["aliases"]=law.get("aliases",[])+[a for a in aliases if a not in law.get("aliases",[])]
            if law["sfs"] in KNOWN:law["section"]=SECTION[0]
        else:law.pop("articleChapter",None)
    if not any(s["id"]==SECTION[0] for s in catalog["sections"]):
        at=next((i+1 for i,s in enumerate(catalog["sections"]) if s["id"]=="grundlagar"),0)
        catalog["sections"].insert(at,{"id":SECTION[0],"name":SECTION[1]})
    # De kända konventionerna står först i sin avdelning, direkt efter grundlagarna.
    known=sorted([l for l in laws if l["section"]==SECTION[0]],key=lambda l:ORDER.index(l["sfs"]) if l["sfs"] in ORDER else len(ORDER))
    rest=[l for l in laws if l["section"]!=SECTION[0]]
    at=max((i+1 for i,l in enumerate(rest) if l["section"]=="grundlagar"),default=0)
    catalog["laws"]=rest[:at]+known+rest[at:]
    CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{made} lagar med konventionstext, {arts} artiklar")
if __name__=="__main__":run()
