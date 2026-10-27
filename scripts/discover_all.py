#!/usr/bin/env python3
"""Lägger in alla gällande lagar i lagboken och placerar dem i rätt avdelning.

  python scripts/discover_all.py add     hämtar Riksdagens förteckning över hela SFS, väljer de gällande
                                         lagarna som saknas i data/catalog.json och lägger in dem i den
                                         avdelning som titeln (och departementet) visar
  python scripts/discover_all.py place   efter import: en lag som i huvudsak bygger på en balk (hänvisar
                                         dit ofta, eller är balkens promulgationslag) hängs under balken

Förteckningen hämtas i datumintervall eftersom Riksdagens API ger högst 10 000 träffar per sökning.
En rapport skrivs till data/discovery-report.md."""
import json,re,sys,time,urllib.parse,collections
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import discover_laws as dl
ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/catalog.json";LAWS=ROOT/"data/laws";REPORT=ROOT/"data/discovery-report.md"
SFS=re.compile(r"\d{4}:\d+(?:\s?s\.\s?\d+|\s\d+)?")
RANGES=[("1600-01-01","1969-12-31"),("1970-01-01","1989-12-31"),("1990-01-01","2004-12-31"),("2005-01-01","2015-12-31"),("2016-01-01","2040-12-31")]
# Avdelningar i lagbokens ordning efter balkarna. Första regeln vars ord finns i titeln avgör.
AREAS=[
 ("skatt",r"skatt|mervärde|tull|taxering|deklaration|punktskatt|kupong|stämpel|dubbelbeskattning|beskattning|kommunalekonomisk|utjämning|avgift"),
 ("forsvar",r"totalförsvar|försvar|krigs|civilt försvar|civilförsvar|hemvärn|militär|värnplikt|ransonering|förfogande|sanktioner|krigsmateriel|beredskap|skyddsrum|underrättelse"),
 ("process",r"rättegång|domstol|åklagar|rättshjälp|brott|straff|påföljd|fängelse|häkte|kriminalvård|utlämning|överlämnande|belastningsregister|misstankeregister|förundersökning|tvångsmedel|vittne|nämndem|skiljeförfarande|medling|frihetsberövande|beslag|förverkande|interception|hemlig|dna-"),
 ("polis",r"polis|\bordning|vapen|sprängämne|brandfarlig|explosiv|kamerabevakning|terror|säkerhetsskydd|bevakningsföretag|ordningsvakt|kustbevakning|alkohol|tobak|narkotika|dopning|\bspel|lotteri|hittegods|pyroteknisk|räddningstjänst|olycks|skydd mot|gränskontroll"),
 ("arbete",r"arbet|anställ|semester|ledighet|diskriminering|medbestämmande|facklig|lönegaranti|arbetslöshet|uppsägning|visstid|förtroendeman|ombudsman för"),
 ("foretag",r"aktiebolag|bolag|förening|stiftelse|bank|finans|kredit|försäkring|värdepapper|fond|börs|redovisning|bokföring|revision|revisor|betaltjänst|penningtvätt|handelsregister|firma|filial|clearing|elektroniska pengar|kapital|resolution|insättningsgaranti|investerar|marknadsmissbruk|valuta|riksbank|derivat|näringsverksamhet|näringsförbud|europabolag|kooperativ"),
 ("marknad",r"patent|varumärke|upphovsrätt|design|mönster|kretsmönster|växtförädlar|marknadsföring|konkurrens|konsument|\bpris|produkt|säkerhet hos|ackreditering|mätteknik|tjänster på den inre|offentlig upphandling|upphandling|e-handel|distansavtal|paketresor|leksak|elektrisk utrustning"),
 ("vard",r"social|vård|sjuk|hälso|patient|\btand|läkemedel|apotek|smittskydd|psykiatri|missbruk|funktionsnedsättning|stöd och service|bidrag|underhåll|äldre|transplantation|biobank|genetisk|abort|sterilisering|kastration|begravning|blod|vävnad|assistans|förälder|barn|graviditet|insemination|bostadstillägg|pension|aktivitetsersättning|garantipension|ålderspension|inkomstgrundad|tobaksfri"),
 ("utbildning",r"skol|utbildning|högskola|student|studie|forskning|kultur|bibliotek|museum|radio|\btv\b|film|språk|press|medie|fornminne|kulturmiljö|tryckfrihet|yttrandefrihet|arkiv|stöd till trossamfund|trossamfund|svenska kyrkan|kyrko"),
 ("miljo",r"miljö|plan|bygg|bostad|energi|\bel\b|elektricitet|elmarknad|naturgas|kärn|strålskydd|vatten|avfall|kemisk|klimat|utsläpp|gruv|mineral|torv|kontinentalsockel|ekonomisk zon|olja|fjärrvärme|ledning|förorening|buller|natur|hushållning|stadsförnyelse|kommunal energi|vindkraft|vätgas"),
 ("jordbruk",r"jordbruk|djur|livsmedel|foder|växt|skog|fiske|jakt|\bren\b|rennäring|utsäde|gödsel|veterinär|epizooti|zoonos|odling|trädgård|lantbruk|socker|mjölk|\bvin\b|sprit|\bägg|kött"),
 ("trafik",r"trafik|fordon|väg|järnväg|luftfart|sjö|fartyg|hamn|transport|körkort|taxi|\bbil|båt|kollektiv|\bpost|elektronisk kommunikation|lots|sjömän|sjöarbete|farled|flyg|cykel|parkering|fordonsskatt|bilregister|vägtrafik|tunnelbana|spårväg|infrastruktur|bredband|radioutrustning"),
 ("civil",r"avtal|köp|skuldebrev|hyra|arrende|bostadsrätt|tomträtt|äktenskap|sambo|arv|testamente|förmynd|god man|vårdnad|faderskap|adoption|namn|skadestånd|preskription|ränta|borgen|pant|inteckning|lagsökning|betalningsföreläggande|konkurs|ackord|rekonstruktion|utsök|inkasso|kreditupplysning|fastighet|lantmäteri|samfällighet|expropriation|tillämplig lag|lagval|erkännande|verkställighet|dödande|dödförklaring|fullmakt|kommission|handelsagentur|ensamrätt|växel|check|sambor|gåva|fordring|ägande|handling|elektronisk underskrift|delgivning|kungörande"),
 ("forvaltning",r"riksdag|\bval\b|\bvalet|vallag|kommun|region|regering|statsbudget|justitiekansler|riksrevision|myndighet|offentlig|sekretess|förvaltning|personuppgift|dataskydd|folkbokföring|medborgarskap|utlänning|uppehåll|asyl|mottagande|identitet|pass|statlig|tjänsteansvar|ombudsm|grundlag|författningssamling|lagrådet|ämbete|riksdagens|sametinget|kungl|kunglig|statens|tolk|nationella minoriteter|minoritet"),
]
ORGAN={"Finansdepartementet":"skatt","Justitiedepartementet":"civil","Socialdepartementet":"vard","Landsbygds-":"jordbruk",
       "Klimat-":"miljo","Miljö-":"miljo","Arbetsmarknadsdepartementet":"arbete","Försvarsdepartementet":"forsvar","Utrikesdepartementet":"forsvar",
       "Utbildningsdepartementet":"utbildning","Kulturdepartementet":"utbildning","Näringsdepartementet":"foretag","Närings-":"foretag",
       "Kommunikationsdepartementet":"trafik","Jordbruksdepartementet":"jordbruk","Infrastrukturdepartementet":"trafik"}
SECTIONS=[("grundlagar","Grundlagar"),("internationellt","Internationella konventioner och avtal"),("balkar","Balkarna med anslutande författningar"),("process","Rättsväsende, straff och process"),
 ("polis","Polis, ordning och säkerhet"),("forvaltning","Stat, kommun, förvaltning och utlänningar"),("civil","Civilrätt, familj och fastighet"),
 ("foretag","Bolag, bank, försäkring och finans"),("marknad","Konsument, konkurrens och immaterialrätt"),("arbete","Arbetsrätt"),
 ("vard","Socialrätt, vård och socialförsäkring"),("utbildning","Utbildning, kultur, medier och trossamfund"),("skatt","Skatt, tull och avgifter"),
 ("miljo","Miljö, plan, bygg och energi"),("jordbruk","Jordbruk, livsmedel, djur och natur"),("trafik","Trafik, transport och kommunikation"),
 ("forsvar","Försvar, beredskap och internationellt"),("instruktioner","Myndigheters instruktioner")]
def clean(title):
    t=re.sub(r"/[^/]*/","",title or "");t=re.sub(r"^\s*r\d+/\s*","",t);t=re.sub(r"Kungl\. Maj:ts\s*","",t,flags=re.I)
    t=re.sub(r"\s+"," ",t).strip().rstrip(";").strip()
    # Två rubriker (nuvarande och kommande): den nuvarande gäller.
    return re.split(r"\s+(?=(?:Lag|Förordning) \(\d{4}:)",t)[0]
def is_law(title):
    head=clean(title).split("(")[0].strip()
    if re.search(r"förordning|kungörelse|föreskrift|tillkännagivande|stadga|meddelande|instruktion|reglemente|taxa|cirkulär",head,re.I):return False
    return bool(re.fullmatch(r"(?i)lag|[\wåäö-]*(lag|balk|ordning)",head))
# Granskade placeringar (data/placement.json) går före reglerna: {"SFS": "avdelning"}.
PLACEMENT=json.loads((ROOT/"data/placement.json").read_text(encoding="utf-8")) if (ROOT/"data/placement.json").exists() else {}
def is_reg(title):
    """Förordningar och kungörelser (inte tillkännagivanden eller myndighetsföreskrifter)."""
    head=clean(title).split("(")[0].strip().lower()
    if re.search(r"tillkännagivande|föreskrift|meddelande|cirkulär|reglemente|stadga|taxa",head):return False
    return bool(re.search(r"förordning|kungörelse",head))
def area(title,organ,sfs=None):
    if sfs in PLACEMENT:return PLACEMENT[sfs]
    t=clean(title).lower()
    for sec,rx in AREAS:
        if re.search(rx,t):return sec
    return ORGAN.get((organ or "").split(" ")[0],"forvaltning")
def listing():
    out={}
    for a,b in RANGES:
        p=1
        while True:
            q=urllib.parse.urlencode({"doktyp":"sfs","utformat":"json","sz":200,"p":p,"from":a,"tom":b})
            data=dl.get("https://data.riksdagen.se/dokumentlista/?"+q).get("dokumentlista",{})
            docs=data.get("dokument") or []
            if isinstance(docs,dict):docs=[docs]
            for d in docs:
                status=re.sub(r"<[^>]+>"," ",(d.get("sokdata") or {}).get("statusrad","") or "")
                out[d.get("beteckning")]={"sfs":d.get("beteckning"),"titel":d.get("titel") or "","organ":d.get("organ") or "","upphavd":"upphävd" in status}
            if not docs or p>=int(data.get("@sidor") or 1):break
            p+=1;time.sleep(.1)
    return list(out.values())
def add(regs=False):
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    have={l["sfs"] for l in catalog["laws"]}
    known={s for s,_ in SECTIONS};ids=[s["id"] for s in catalog["sections"]]
    for sid,name in SECTIONS:
        if sid not in ids:catalog["sections"].append({"id":sid,"name":name})
        else:next(s for s in catalog["sections"] if s["id"]==sid)["name"]=name
    order={sid:i for i,(sid,_) in enumerate(SECTIONS)}
    catalog["sections"].sort(key=lambda s:order.get(s["id"],99))
    # Författningar som saknar lagtext hos Riksdagen eller i praktiken är upphävda ("Utgår genom …").
    excluded=json.loads((ROOT/"data/excluded.json").read_text(encoding="utf-8")) if (ROOT/"data/excluded.json").exists() else {}
    entries=[];seen={re.sub(r"[\s.]","",s) for s in list(have)+list(excluded)}
    # Äldre författningar har sidnummer i beteckningen: "1736:0123 2", "1898:64 s.10".
    all_docs=sorted(listing(),key=lambda d:(" " not in (d["sfs"] or ""),d["sfs"] or ""))
    for d in all_docs:
        key=re.sub(r"[\s.]","",d["sfs"] or "")
        kind="lag" if is_law(d["titel"]) else "förordning" if regs and is_reg(d["titel"]) else None
        if d["upphavd"] or d["sfs"] in have or key in seen or not SFS.fullmatch(d["sfs"] or "") or not kind:continue
        seen.add(key)
        t=clean(d["titel"])
        sec="instruktioner" if kind=="förordning" and re.search(r"med instruktion för|instruktion för",t,re.I) else area(t,d["organ"],d["sfs"])
        entries.append({"sfs":d["sfs"],"name":dl.display_name(t),"type":kind,"aliases":[],"chaptered":False,"check":dl.norm(t),"section":sec})
    by=collections.defaultdict(list)
    for e in entries:by[e["section"]].append(e)
    laws=catalog["laws"]
    for sid in [s["id"] for s in catalog["sections"]]:
        add_here=sorted(by.get(sid,[]),key=lambda e:e["name"].lower())
        if not add_here:continue
        idx=[i for i,l in enumerate(laws) if l["section"]==sid]
        at=(max(idx)+1) if idx else len(laws)
        laws[at:at]=add_here
    gallande=[d for d in all_docs if not d["upphavd"]]
    # Underlag för appens täckningsmätare: hur många gällande författningar och lagar SFS innehåller.
    catalog["coverage"]={"all":len(gallande),"laws":sum(1 for d in gallande if is_law(d["titel"])),"regs":sum(1 for d in gallande if is_reg(d["titel"])),"date":time.strftime("%Y-%m-%d")}
    CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    lines=["## Alla gällande lagar","",f"Gällande författningar i SFS: {len(gallande)}, varav lagar: {sum(1 for d in gallande if is_law(d['titel']))}.",
           f"Tillagda författningar: {len(entries)} (lagar {sum(e['type']=='lag' for e in entries)}, förordningar {sum(e['type']=='förordning' for e in entries)}).",""]+[f"- {dict(SECTIONS)[s]}: {len(v)}" for s,v in sorted(by.items(),key=lambda kv:order.get(kv[0],99))]
    REPORT.write_text("\n".join(lines)+"\n",encoding="utf-8");print("\n".join(lines))
# Hänvisningar ur en lags text till balkarna: [(balk, antal)].
BALK_NAMES=None
def place():
    sys.path.insert(0,str(ROOT/"scripts"))
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    balkar=[l for l in catalog["laws"] if l["section"]=="balkar" and not l.get("parent") and l["name"].lower().endswith("balken")]
    names={b["sfs"]:b["name"].lower() for b in balkar}
    moved=[]
    for law in catalog["laws"]:
        if law.get("parent") or law["section"] in ("grundlagar","balkar"):continue
        f=LAWS/(law["sfs"].replace(":","-").replace(" ","-")+".json")
        if not f.exists():continue
        doc=json.loads(f.read_text(encoding="utf-8"))
        text=" ".join(i.get("text","") for c in doc["chapters"] for i in c["items"] if i["type"]=="para").lower()
        count={s:len(re.findall(r"§§?\s+(?:första|andra|tredje|fjärde|femte|sjätte)?\s*(?:stycket\s+)?(?:\d+\s+)?"+re.escape(n)+r"|"+re.escape(n)+r"\s*\("+re.escape(s),text)) for s,n in names.items()}
        intro=re.search(r"införande av (?:nya )?([a-zåäö]+balken)",law["name"].lower())
        best=max(count,key=count.get) if count else None
        total=sum(count.values())
        parent=None
        # Promulgationslagar hängs alltid under sin balk. Övriga lagar som ofta hänvisar till en balk
        # föreslås bara; godkända placeringar skrivs in i data/placement.json som "balk:<SFS>".
        if intro:parent=next((s for s,n in names.items() if n==intro.group(1).replace("giftermålsbalken","äktenskapsbalken")),None)
        elif PLACEMENT.get(law["sfs"],"").startswith("balk:"):parent=PLACEMENT[law["sfs"]][5:]
        elif best and count[best]>=8 and count[best]>=0.6*total:print("  förslag:",law["name"],"→",names[best],count[best])
        if parent:
            law["parent"]=parent;law["section"]="balkar";moved.append((law["name"],names[parent],count.get(parent,0)))
    # Flytta barnen efter sin balk och dess övriga anslutande författningar.
    laws=catalog["laws"];kids=[l for l in laws if (l["name"],) and any(l["name"]==m[0] for m in moved)]
    rest=[l for l in laws if l not in kids]
    for k in sorted(kids,key=lambda l:l["name"].lower()):
        idx=[i for i,l in enumerate(rest) if l["sfs"]==k["parent"] or l.get("parent")==k["parent"]]
        rest.insert(max(idx)+1,k)
    catalog["laws"]=rest
    CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for m in moved:print("→",m[1],"·",m[0],f"({m[2]} hänvisningar)")
    print(len(moved),"lagar placerade under balkar")
GENERAL={"2017:900","1971:291","2009:400","2017:725","1962:700","1942:740","2018:218","1999:1229","2011:1244","1974:152","1949:105","1991:1469","1986:223"}
def anchor():
    """Förordningar hängs på den lag de kompletterar ("Denna förordning kompletterar lagen (2010:1932)",
    "meddelas med stöd av …") och placeras i lagens avdelning. Förordningar utan tydlig lag behåller
    den avdelning som titeln visar. Granskade undantag: data/placement.json ("lag:<SFS>" eller avdelning)."""
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    laws={l["sfs"]:l for l in catalog["laws"] if l["type"]=="lag"}
    single={l["name"].lower():s for s,l in laws.items() if re.fullmatch(r"[a-zåäö-]+(?:lagen|balken)",l["name"].lower())}
    stats=collections.Counter()
    for reg in catalog["laws"]:
        if reg["type"]!="förordning":continue
        f=LAWS/(reg["sfs"].replace(":","-").replace(" ","-")+".json")
        if not f.exists():continue
        fixed=PLACEMENT.get(reg["sfs"],"")
        if fixed.startswith("lag:"):hit=fixed[4:]
        elif fixed:reg["section"]=fixed;reg.pop("anchor",None);stats["granskad"]+=1;continue
        else:
            doc=json.loads(f.read_text(encoding="utf-8"))
            paras=[i.get("text","") for c in doc["chapters"] for i in c["items"] if i["type"]=="para"]
            def mentions(text):
                out=[s for s in re.findall(r"\((\d{4}:\d+)\)",text) if s in laws]
                low=text.lower()
                for name,s in single.items():
                    out+= [s]*len(re.findall(r"(?<![a-zåäö])"+re.escape(name)+r"(?![a-zåäö])",low))
                return out
            # Allmänna lagar som nämns i nästan alla förordningar (överklagande, sekretess, skatt) räknas bara
            # när förordningen uttryckligen kompletterar dem eller har samma namnstam.
            general=lambda s:s in GENERAL and not sameStem(reg["name"],laws[s]["name"])
            first=[s for s in mentions(" ".join(paras[:3])) if not general(s)]
            count=collections.Counter(s for s in mentions(" ".join(paras)) if not general(s))
            said_all=re.findall(r"(?:kompletterar|med stöd av|i anslutning till)[^.]{0,120}?\((\d{4}:\d+)\)"," ".join(paras[:3]))
            first=list(dict.fromkeys([s for s in said_all if s in laws]+first))
            hit=None
            if first:
                kin=[s for s in dict.fromkeys(first) if sameStem(reg["name"],laws[s]["name"])]
                said=re.search(r"(?:kompletterar|med stöd av|i anslutning till|tillämpning av|verkställighet av)[^.]{0,120}?\((\d{4}:\d+)\)"," ".join(paras[:3]))
                hit=kin[0] if kin else said.group(1) if said and said.group(1) in laws else Counter_top(first)
            elif count:
                s,n=count.most_common(1)[0]
                if n>=3 and n>=0.5*sum(count.values()):hit=s
            if not hit:
                kin=[s for s in count if sameStem(reg["name"],laws[s]["name"])]
                hit=kin[0] if len(kin)==1 else None
        if hit and hit in laws:
            law=laws[hit];reg["anchor"]=hit
            if reg["section"]!="instruktioner":reg["section"]=law["section"]
            stats["kopplad"]+=1
        else:
            reg.pop("anchor",None);stats["utan lag"]+=1
    # Ordning: avdelningarna i lagbokens ordning; i varje avdelning lagarna (i nuvarande ordning) och därefter
    # förordningar utan egen lag i bokstavsordning. Förordningar med lag ritas under lagen i appen.
    order={s["id"]:i for i,s in enumerate(catalog["sections"])}
    pos={id(l):i for i,l in enumerate(catalog["laws"])}
    def key(l):
        loose=l["type"]=="förordning" and not l.get("parent") and l["section"]!="balkar"
        return (order.get(l["section"],99),loose,l["name"].lower() if loose else "",pos[id(l)])
    catalog["laws"].sort(key=key)
    CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(dict(stats))
STOP={"instruktion","vissa","sarskilda","bestammelser","annat","andra","svenska","sverige"}
def stems(name):
    fold=lambda t:t.lower().replace("å","a").replace("ä","a").replace("ö","o")
    out=[]
    for w in re.findall(r"[a-zåäö]{5,}",name.lower()):
        w=re.sub(r"(?:förordningen|förordning|kungörelsen|lagen|balken)$","",w)
        w=re.sub(r"s$","",w)
        if len(w)>=5 and fold(w) not in STOP:out.append(w)
    return out
def sameStem(a,b):
    x,y=stems(a),stems(b)
    return any(u==v or (min(len(u),len(v))>=7 and (u.startswith(v) or v.startswith(u))) for u in x for v in y)
def Counter_top(items):return collections.Counter(items).most_common(1)[0][0]

if __name__=="__main__":
    cmd=sys.argv[1] if len(sys.argv)>1 else "add"
    if cmd=="add":add(regs="--forordningar" in sys.argv)
    else:{"place":place,"anchor":anchor}[cmd]()
