#!/usr/bin/env python3
"""Kopplar ändringsförfattningar till förarbeten (proposition och betänkande).

Riksdagens betänkanden anger vilken ändringsförfattning beslutet ledde till (referens "ändringsförfattning")
och vilken proposition de behandlar. Skriptet går igenom betänkandena riksmöte för riksmöte och skriver
data/forarbeten.json: {"SFS-nummer": {"prop": "2009/10:237", "propId": "…", "bet": "2010/11:JuU2", "betId": "…"}}.
Redan genomgångna riksmöten hoppas över, utom de två senaste som kan ha fått nya beslut."""
import json,sys,time,urllib.parse,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parent))
import discover_laws as dl
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"data/forarbeten.json"
def riksmoten(first=1993):
    year=time.localtime().tm_year
    return [f"{y}/{str(y+1)[2:]}" for y in range(first,year+1)]
def bets(rm):
    out,p=[],1
    while True:
        q=urllib.parse.urlencode({"doktyp":"bet","rm":rm,"utformat":"json","sz":200,"p":p})
        d=dl.get("https://data.riksdagen.se/dokumentlista/?"+q).get("dokumentlista",{})
        docs=d.get("dokument") or []
        if isinstance(docs,dict):docs=[docs]
        out+=[(x["dok_id"],x["rm"],x["beteckning"]) for x in docs]
        if not docs or p>=int(d.get("@sidor") or 1):return out
        p+=1
def links(bet):
    dok_id,rm,beteckning=bet
    try:d=dl.get("https://data.riksdagen.se/dokumentstatus/"+dok_id+".json").get("dokumentstatus",{})
    except Exception:return []
    refs=(d.get("dokreferens") or {}).get("referens") or []
    if isinstance(refs,dict):refs=[refs]
    sfs=[r.get("uppgift","").strip() for r in refs if r.get("referenstyp")=="ändringsförfattning"]
    props=[r for r in refs if r.get("referenstyp")=="behandlar" and r.get("ref_dok_typ")=="prop"]
    prop=props[0] if props else None
    return [(s,{"bet":rm+":"+beteckning,"betId":dok_id,"prop":(prop["ref_dok_rm"]+":"+prop["ref_dok_bet"]) if prop else None,
               "propId":prop.get("ref_dok_id") if prop else None,"titel":(prop or {}).get("ref_dok_titel")}) for s in sfs if re.fullmatch(r"\d{4}:\d+",s)]
def run():
    data=json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"done":[],"sfs":{}}
    rms=riksmoten();todo=[r for r in rms if r not in data["done"] or r in rms[-2:]]
    with ThreadPoolExecutor(8) as pool:
        for rm in todo:
            for found in pool.map(links,bets(rm)):
                for s,info in found:data["sfs"][s]=info
            if rm not in data["done"]:data["done"].append(rm)
            print(rm,len(data["sfs"]),flush=True)
            OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
if __name__=="__main__":run()
