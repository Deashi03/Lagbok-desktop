#!/usr/bin/env python3
"""Granskning av all lagtext i lagboken.

Kontrollerar att varje paragraf har en entydig gällande lydelse, att inget upphävt eller utgånget ligger kvar
som gällande, att texten stämmer med Riksdagens senaste ändring, att struktur, titlar och kopplingar mellan
lagar och förordningar är rimliga, och mäter hur stor del av hänvisningarna som länkas.

  python scripts/audit.py           skriver data/audit-report.md och avslutar med fel om någon kontroll
                                    blivit sämre än i data/audit-baseline.json
  python scripts/audit.py --update  sparar dagens siffror som ny baslinje"""
import json,re,os,sys,subprocess,datetime as dt,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/catalog.json";LAWS=ROOT/"data/laws";REPORT=ROOT/"data/audit-report.md";BASE=ROOT/"data/audit-baseline.json"
TODAY=os.environ.get("AUDIT_DATE") or dt.date.today().isoformat()
def key(s):y,n=s.split(":");return (int(y),int(re.match(r"\d+",n).group()))
def status(v):
    f=(v.get("inForce") or {}).get("date");e=(v.get("expires") or {}).get("date")
    if v.get("inForce") and (not f or f>TODAY):return "kommande"
    if e and e<=TODAY:return "upphörd"
    return "tidigare" if v.get("superseded") else "gällande"
def run():
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    laws={l["sfs"]:l for l in catalog["laws"]}
    errors=collections.defaultdict(list);info=collections.Counter();examples=collections.defaultdict(list)
    def note(kind,ex,error=True):
        (errors[kind] if error else examples[kind]).append(ex);info[kind]+=1
    sections={s["id"] for s in catalog["sections"]}
    for sfs,l in laws.items():
        f=LAWS/(sfs.replace(":","-").replace(" ","-")+".json")
        if not f.exists():note("saknar lagtext",sfs);continue
        d=json.loads(f.read_text(encoding="utf-8"))
        if l["section"] not in sections:note("okänd avdelning",sfs)
        if l.get("parent") and (l["parent"] not in laws or laws[l["parent"]].get("parent")):note("felaktig balk",sfs)
        if l.get("anchor") and (l["anchor"] not in laws or laws[l["anchor"]]["type"]!="lag"):note("felaktig lagkoppling",sfs)
        if d.get("title")!=l["name"]:note("titel skiljer sig från katalogen",sfs+": "+str(d.get("title"))+" / "+l["name"])
        if d.get("repealAt") and d["repealAt"]<=TODAY:note("upphävd författning kvar",sfs+" (upphävd "+d["repealAt"]+")")
        elif d.get("repealAt"):note("kommande upphävande",sfs+" "+d["repealAt"],False)
        if d.get("unconsolidated"):note("gammal varning om ej inarbetad ändring",sfs)
        chapters=collections.Counter(c["number"] for c in d["chapters"])
        for n,k in chapters.items():
            if k>1:note("dubblerat kapitel",sfs+" kap. "+n)
        for c in d["chapters"]:
            paras=[p for p in c["items"] if p["type"]=="para"]
            if not paras:note("kapitel utan paragrafer",sfs+" kap. "+c["number"])
            for p in paras:
                where=sfs+" "+c["number"]+":"+p["number"]
                vs=p.get("versions") or [p]
                st=[status(v) for v in vs]
                if st.count("gällande")>1:note("flera gällande lydelser",where)
                if "gällande" not in st and "tidigare" not in st and not p.get("repealed"):
                    if "kommande" in st:note("paragraf som ännu inte trätt i kraft",where,False)
                    else:note("paragraf utan gällande lydelse",where)
                if "upphörd" in st:note("utgången lydelse sparad (visas inte)",where,False)
                if "tidigare" in st:note("tidigare lydelse utan datum (visas som tidigare)",where,False)
                if any(v.get("inForce") and not v["inForce"].get("date") for v in vs):note("träder i kraft när regeringen bestämmer",where,False)
                if p.get("repealed"):note("upphävd paragraf (visas förminskad)",where,False)
                for v in vs:
                    t=v["text"]
                    if len(t.strip())<4:note("tom paragraf",where)
                    if re.search(r"\n\s*(?:Ikraftträdande- och )?Övergångsbestämmelser\s*\n",t):note("övergångsbestämmelser i paragraftext",where)
                    if "�" in t or re.search(r"Ã[\x80-\xbf]",t):note("teckenfel",where)
                    if re.search(r"<[a-z][^>]*>",t):note("html i text",where)
                    if len(t)>15000 and re.search(r"\n\s*\d+\s*[a-z]?\s*§\s+[A-ZÅÄÖ]",t):note("sammanslagna paragrafer",where)
    # Hänvisningar: andel länkade paragraftecken (samma mätning som testerna).
    out=subprocess.run(["node",str(ROOT/"tests/test_reference_coverage.js")],capture_output=True,text=True).stdout
    m=re.search(r"\(([\d.]+) %\)",out);linked=float(m.group(1)) if m else 0.0
    regs=[l for l in laws.values() if l["type"]=="förordning"]
    # Fullständighet: ord i riksdagen.se:s text som saknas i den tolkade texten (från importen, data/completeness.json).
    comp=ROOT/"data/completeness.json"
    for sfs,c in (json.loads(comp.read_text(encoding="utf-8")) if comp.exists() else {}).items():
        if sfs in laws:note("text som saknas jämfört med riksdagen.se",sfs+" ("+c["name"]+"): "+str(c["missing"])+" rader, t.ex. ”"+(c.get("lines") or [""])[0]+"”")
    numbers={"författningar":len(laws),"förordningar med lag":sum(1 for l in regs if l.get("anchor")),"länkade hänvisningar %":linked}
    numbers.update({k:info[k] for k in sorted(info)})
    lines=["# Granskning av lagtexten","",f"Datum: {TODAY}. {len(laws)} författningar.","","## Siffror",""]
    lines+=[f"- {k}: {v}" for k,v in numbers.items()]
    if errors:
        lines+=["","## Fel"]
        for k,v in errors.items():lines+=["",f"### {k} ({len(v)})"]+[f"- {x}" for x in v[:50]]
    lines+=["","## Upplysningar (inte fel)"]
    for k,v in examples.items():lines+=["",f"### {k} ({len(v)})"]+[f"- {x}" for x in v[:20]]
    REPORT.write_text("\n".join(lines)+"\n",encoding="utf-8")
    print("\n".join(lines[:12+len(numbers)]))
    if "--update" in sys.argv:
        BASE.write_text(json.dumps({k:v for k,v in numbers.items() if k in errors or k=="länkade hänvisningar %"},ensure_ascii=False,indent=1)+"\n",encoding="utf-8");return
    base=json.loads(BASE.read_text(encoding="utf-8")) if BASE.exists() else {}
    worse=[k for k,v in errors.items() if len(v)>base.get(k,0)]
    if linked+0.05<base.get("länkade hänvisningar %",0):worse.append("länkade hänvisningar %")
    if worse:sys.exit("Granskningen blev sämre: "+", ".join(worse))
if __name__=="__main__":run()
