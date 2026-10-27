#!/usr/bin/env python3
"""Hittar SFS-nummer för önskade författningar i Riksdagens dokumentkatalog.

Läser data/wanted.json (titel, avdelning, överordnad balk, förkortningar), söker upp varje titel
i data.riksdagen.se och väljer den författning vars titel stämmer exakt. Upphävda författningar och
osäkra träffar sorteras bort. Med --apply läggs godkända träffar in i data/catalog.json, så att
scripts/import_laws.py kan hämta dem. En rapport skrivs till data/discovery-report.md."""
import json,re,sys,time,urllib.parse
from pathlib import Path
from urllib.request import Request,urlopen
sys.path.insert(0,str(Path(__file__).resolve().parent))
import import_laws as il
ROOT=Path(__file__).resolve().parents[1]
WANTED=ROOT/"data/wanted.json";CATALOG=ROOT/"data/catalog.json";REPORT=ROOT/"data/discovery-report.md"
def norm(s):
    s=re.sub(r"\(\d{4}:\d+(?: \d)?\)","",str(s or "")).lower().replace("–","-")
    return re.sub(r"\s+"," ",re.sub(r"[^\wåäö\- ]"," ",s)).strip()
def words(s):return set(w for w in norm(s).split() if len(w)>2)
def get(url):
    req=Request(url,headers={"User-Agent":"LagbokenDiscovery/0.1","Accept":"application/json"})
    for attempt in range(3):
        try:
            with urlopen(req,timeout=40) as f:return json.load(f)
        except Exception:
            if attempt==2:raise
            time.sleep(1+attempt)
def search(title):
    q=urllib.parse.urlencode({"sok":title,"doktyp":"sfs","utformat":"json","sort":"rel","sortorder":"desc","p":1})
    data=get("https://data.riksdagen.se/dokumentlista/?"+q).get("dokumentlista",{})
    docs=data.get("dokument") or []
    if isinstance(docs,dict):docs=[docs]
    out=[]
    for d in docs:
        sfs=d.get("beteckning") or ""
        if not re.fullmatch(r"\d{4}:\d+",sfs):continue
        out.append({"sfs":sfs,"titel":d.get("titel") or ""})
    return out
def display_name(title):
    t=re.sub(r"\s*\(\d{4}:\d+\)","",title).strip()
    t=re.sub(r"^Lag (om|med|angående)\b",r"Lagen \1",t)
    t=re.sub(r"^Förordning (om|med|angående)\b",r"Förordningen \1",t)
    t=re.sub(r"^Kungörelse (om|med|angående)\b",r"Kungörelsen \1",t)
    if re.fullmatch(r"[A-ZÅÄÖ][\wåäö\-]*(lag|förordning|balk|ordning)",t):t+="en"
    return t
def doc_type(title):
    t=norm(title)
    return "förordning" if t.startswith("förordning") or t.endswith("förordning") or t.startswith("kungörelse") else "lag"
def run(apply):
    wanted=json.loads(WANTED.read_text(encoding="utf-8"))
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    have={l["sfs"] for l in catalog["laws"]}
    accepted,unsure,missing,skipped=[],[],[],[]
    for w in wanted:
        try:cands=search(w["titel"])
        except Exception as ex:missing.append((w,"sökfel: "+str(ex)[:80]));continue
        exact=[c for c in cands if norm(c["titel"])==norm(w["titel"])]
        if not exact:
            best=max(cands,key=lambda c:len(words(c["titel"])&words(w["titel"]))/max(1,len(words(c["titel"])|words(w["titel"]))),default=None)
            if best:unsure.append((w,best))
            else:missing.append((w,"ingen träff"))
            continue
        # Flera exakta träffar: den nyaste författningen är normalt den gällande.
        c=sorted(exact,key=lambda c:il.amendment_key(c["sfs"]),reverse=True)[0]
        if c["sfs"] in have:skipped.append((w,c));continue
        try:
            doc=get("https://data.riksdagen.se/dokument/sfs-"+il.slug(c["sfs"])+".json").get("dokumentstatus",{}).get("dokument",{})
            il.check_in_force(doc)  # stoppar bara redan upphävda
        except Exception as ex:missing.append((w,c["sfs"]+": "+str(ex)[:80]));continue
        accepted.append((w,c));have.add(c["sfs"])
        time.sleep(.2)
    if apply:
        for w,c in accepted:
            entry={"sfs":c["sfs"],"name":w.get("namn") or display_name(c["titel"]),"type":doc_type(c["titel"]),"aliases":w.get("alias",[]),
                   "chaptered":False,"check":norm(c["titel"]),"section":w["avdelning"]}
            if w.get("balk"):entry["parent"]=w["balk"]
            laws=catalog["laws"]
            anchor=[i for i,l in enumerate(laws) if (w.get("balk") and (l["sfs"]==w["balk"] or l.get("parent")==w["balk"])) or (not w.get("balk") and l["section"]==w["avdelning"])]
            laws.insert((max(anchor)+1) if anchor else len(laws),entry)
        CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    lines=["## Sökning i Riksdagens katalog","",f"Godkända: {len(accepted)} · osäkra: {len(unsure)} · saknas/upphävda: {len(missing)} · finns redan: {len(skipped)}",""]
    if accepted:lines+=["### Godkända (exakt titel, gällande)"]+[f"- SFS {c['sfs']} {c['titel']}" for w,c in accepted]+[""]
    if unsure:lines+=["### Osäkra – inte tillagda"]+[f"- Sökte ”{w['titel']}”, närmast: SFS {c['sfs']} {c['titel']}" for w,c in unsure]+[""]
    if missing:lines+=["### Saknas eller upphävda – inte tillagda"]+[f"- ”{w['titel']}”: {why}" for w,why in missing]+[""]
    REPORT.write_text("\n".join(lines)+"\n",encoding="utf-8");print("\n".join(lines))
if __name__=="__main__":run("--apply" in sys.argv)
