/* Lagboken 0.5 – redaktionella rubriker, åtskilda från importerad lagtext.
   groups: rubrik som inleder en grupp vid angiven paragraf. Används bara i kapitel
           som saknar egna rubriker i källan.
   titles: kort rubrik för enskild paragraf (brottsbeteckning eller ämne).
   tests/test_editorial.js kontrollerar att varje angiven paragraf finns i lagdatan,
   så att en lagändring som flyttar eller tar bort paragrafer upptäcks direkt. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokEditorial=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const groups={
    '1962:700':{
      '3':{'1':'Uppsåtligt dödande','5':'Misshandel','7':'Vållande- och farebrott','11':'Förstadier och åtal'},
      '4':{'1':'Människorov, människohandel och frihetsberövande','3':'Barnfridsbrott','4':'Olaga tvång, fridskränkning och förföljelse',
        '4 c':'Äktenskapstvång och hedersrelaterade brott','5':'Olaga hot','6':'Hemfrid och integritet',
        '7':'Ofredande och psykisk påverkan','8':'Post-, tele- och dataintrång','10':'Förstadier och åtal'},
      '8':{'1':'Stöldbrott','5':'Rån','7':'Andra tillgreppsbrott','12':'Förstadier och åtalsbestämmelser'},
      '9':{'1':'Bedrägeribrott','4':'Utpressning och ocker','6':'Häleribrott','8':'Andra oredlighetsbrott','11':'Förstadier och åtalsbestämmelser'},
      '12':{'1':'Skadegörelsebrott','4':'Tagande av olovlig väg','5':'Förstadier och åtal'},
      '17':{'1':'Angrepp mot tjänsteman','8':'Brott vid röstning','10':'Brott mot rättskipningen','12':'Rymning','13':'Övriga brott mot allmän verksamhet','16':'Förstadier'},
      '23':{'1':'Försök, förberedelse och stämpling','4':'Medverkan','6':'Underlåtenhet att avslöja brott','7':'Vinning för annan'},
      '24':{'1':'Nödvärn och laga befogenhet','4':'Nöd','5':'Hjälp och excess','7':'Samtycke, order och villfarelse'}
    },
    '1942:740':{
      '23':{'1':'Förundersökningens inledning och ledning','5':'Försvarare och förhör','16':'Tvångsmedel och utredningsmaterial','18':'Underrättelse och avslut','21':'Dokumentation och särskilda regler'},
      '24':{'1':'Häktning','6':'Anhållande och gripande','8':'Underrättelse och rättigheter','12':'Häktningsframställning och förhandling','18':'Tidsfrister och hävning','22':'Förvar'}
    }
  };
  const titles={
    '1962:700':{
      '3':{'1':'Mord','2':'Dråp','3':'Barnadråp','5':'Misshandel','6':'Grov och synnerligen grov misshandel',
        '7':'Vållande till annans död','8':'Vållande till kroppsskada eller sjukdom','9':'Framkallande av fara för annan',
        '10':'Arbetsmiljöbrott','11':'Försök, förberedelse och stämpling','12':'Begränsningar i åtalsrätten'},
      '4':{'1':'Människorov','1 a':'Människohandel','1 b':'Människoexploatering','2':'Olaga frihetsberövande','3':'Barnfridsbrott',
        '4':'Olaga tvång','4 a':'Grov fridskränkning och grov kvinnofridskränkning','4 b':'Olaga förföljelse',
        '4 c':'Äktenskapstvång','4 d':'Äktenskapsresebrott','4 e':'Hedersförtryck','4 f':'Oskuldskontroll',
        '4 g':'Intygande av sexuell oskuld','5':'Olaga hot','6':'Hemfridsbrott och olaga intrång','6 a':'Kränkande fotografering',
        '6 b':'Olovlig identitetsanvändning','6 c':'Olaga integritetsintrång','6 d':'Grovt olaga integritetsintrång',
        '7':'Ofredande','7 a':'Uppmaning till självmord','7 b':'Psykiskt våld','8':'Brytande av post- eller telehemlighet',
        '9':'Intrång i förvar','9 a':'Olovlig avlyssning','9 b':'Förberedelse till brytande av telehemlighet m.m.',
        '9 c':'Dataintrång','10':'Försök, förberedelse och stämpling','11':'Begränsningar i åtalsrätten'},
      '8':{
        '1':'Stöld','2':'Ringa stöld','4':'Grov stöld','4 a':'Inbrottsstöld',
        '5':'Rån','6':'Grovt rån','7':'Tillgrepp av fortskaffningsmedel','8':'Egenmäktigt förfarande',
        '9':'Självtäkt','10':'Olovlig energiavledning',
        '11':'Tillgrepp i skog eller mark','12':'Försök och förberedelse','13':'Begränsningar i åtalsrätten'
      },
      '9':{'1':'Bedrägeri','2':'Ringa bedrägeri','3':'Grovt bedrägeri','3 a':'Grovt fordringsbedrägeri',
        '3 c':'Olovlig befattning med betalningsverktyg','3 d':'Företagskapning',
        '4':'Utpressning','5':'Ocker','6':'Häleri','6 a':'Utförselhäleri','7':'Häleriförseelse',
        '8':'Oredligt förfarande','9':'Svindleri','10':'Ockerpantning',
        '11':'Förstadier','12':'Begränsningar i åtalsrätten'},
      '12':{'1':'Skadegörelse','2':'Ringa skadegörelse','2 a':'Åverkan','3':'Grov skadegörelse','4':'Tagande av olovlig väg',
        '5':'Försök och förberedelse','6':'Begränsningar i åtalsrätten'},
      '17':{'1':'Våld eller hot mot tjänsteman','2':'Angrepp mot tjänsteman','3':'Förolämpning mot tjänsteman','4':'Våldsamt motstånd',
        '5':'Skydd för vissa samhällsnyttiga funktioner','6':'Tjänstemän vid Internationella brottmålsdomstolen',
        '8':'Otillbörligt verkande vid röstning','9':'Brott mot rösthemlighet','10':'Övergrepp i rättssak',
        '11':'Skyddande av brottsling','12':'Rymning','12 a':'Främjande av rymning eller flykt',
        '13':'Överträdelse av myndighets bud','15':'Föregivande av allmän ställning','16':'Försök, förberedelse och stämpling'},
      '23':{'1':'Försök','2':'Förberedelse och stämpling','3':'Frivilligt tillbakaträdande','4':'Medverkan',
        '5':'Lindrigare straff vid medverkan','6':'Underlåtenhet att avslöja eller förhindra brott','7':'Vinning för annan'},
      '24':{'1':'Nödvärn','2':'Laga befogenhet vid rymning och motstånd','3':'Våld vid myteri och strid','4':'Nöd',
        '5':'Hjälp till den som har rätt att ingripa','6':'Excess','7':'Samtycke','8':'Order','9':'Straffrättsvillfarelse'}
    },
    '1984:387':{
      '0':{'1':'Polisverksamhetens ändamål','2':'Polismyndighetens uppgifter','2 a':'Särskilt personsäkerhetsarbete','2 b':'Särskilda avdelningar',
        '3':'Säkerhetspolisens uppgifter','4':'Polisman','6':'Samverkan','7':'Jäv','8':'Behovs- och proportionalitetsprincipen',
        '9':'Rapporteringsskyldighet','10':'Våldsanvändning','10 a':'Fängsel','11':'Tillfälligt omhändertagande enligt särskild föreskrift',
        '12':'Omhändertagande av unga under 18 år','12 a':'Omhändertagande i avvaktan på LVM-beslut','13':'Ordningsstörning: avvisa, avlägsna, omhänderta',
        '13 a':'Avvisande från avspärrat område','13 b':'Inställd eller upplöst allmän sammankomst','13 c':'Folksamling som stör ordningen',
        '14':'Kvarhållande för identifiering','15':'Underrättelse om omhändertagande','16':'Förhör och längsta tid','17':'Hänsyn vid omhändertagande',
        '18':'Förhållandet till gripande','19':'Skyddsvisitation','19 a':'Kroppsvisitation vid förhör','20':'Tillträde för att söka efter person',
        '20 a':'Genomsökning av fordon efter vapen','20 b':'Tillträde till gemensamma utrymmen','21':'Tillträde när någon kan behöva hjälp',
        '22':'Stoppa fordon','22 a':'Visitation i säkerhetszon','22 b':'Beslut om säkerhetszon','22 c':'Säkerhetszonens varaktighet',
        '22 d':'Beslutets innehåll','22 e':'Upphävande av säkerhetszon','22 f':'Överklagande','23 a':'Arrestantvakt och passkontrollant',
        '23 b':'Tystnadsplikt för arrestantvakt','24':'Avspärrning och utrymning','24 a':'Omhändertagande av egendom vid risk för trafikbrott',
        '24 b':'Anmälan om omhändertagen egendom','24 c':'Omhändertagandets längd','24 d':'Egendom som inte hämtas',
        '25':'Uppgifter från transportföretag','27':'Protokoll över ingripanden','28':'Protokoll över fängsel och tekniska hjälpmedel',
        '29 a':'Transport av frihetsberövade','30':'Verkställighetsföreskrifter'}
    },
    '1976:511':{
      '0':{'1':'Omhändertagande av berusad','2':'Hänsyn vid omhändertagande','3':'Läkarundersökning','4':'Kvarhållande och förvar',
        '5':'Anmälan till förman','6':'Tillsyn','7':'Underrättelse och frigivning','7 a':'Omprövning vid förvar hos Kriminalvården',
        '8':'Omhändertagande av berusningsmedel','9':'Förhållandet till gripande','10':'Ordningsvakter'}
    },
    '1942:740':{
      '28':{
        '1':'Reell husrannsakan','2':'Personell husrannsakan','2 a':'Personell husrannsakan i transportmedel',
        '3':'Husrannsakan i vissa lokaler','3 a':'Proportionalitet','4':'Beslut om husrannsakan',
        '5':'Fara i dröjsmål','6':'Genomförande av husrannsakan','7':'Närvaro vid husrannsakan',
        '8':'Enskilda handlingar','9':'Protokoll och bevis','10':'Undersökning på annat ställe',
        '10 a':'Definition av genomsökning på distans','10 b':'Genomsökning på distans',
        '10 c':'Undantagna uppgifter','10 d':'Beslut och fara i dröjsmål',
        '10 e':'Närvaro vid genomsökning','10 f':'Försvårande av utredning',
        '10 g':'Underrättelse','10 h':'Protokoll','10 i':'Tillämpliga bestämmelser',
        '11':'Kroppsvisitation','12':'Kroppsbesiktning','12 a':'DNA-prov på misstänkt',
        '12 b':'DNA-prov på annan än misstänkt','12 c':'Provtagningsform','13':'Gemensamma bestämmelser',
        '13 a':'Kvarhållande för visitation','14':'Fingeravtryck och andra underlag',
        '14 a':'Underlag från annan än misstänkt','14 b':'Gemensamma bestämmelser','15':'Avvikande bestämmelser'
      },
      '24':{
        '1':'Häktning och särskilda häktningsskäl','2':'Häktning utan hänsyn till brottets svårhet',
        '3':'Utredningshäktning','4':'Begränsningar med hänsyn till personliga förhållanden',
        '4 a':'Tidsgräns för häktning','5':'Beslut om häktning','5 a':'Restriktioner','6':'Anhållande','7':'Gripande',
        '8':'Förhör efter anhållande','9':'Underrättelse till frihetsberövad','9 a':'Insyn i skälen',
        '10':'Hävning av anhållande','11':'Häktningsframställning','12':'Tidsfrist för häktningsframställning',
        '13':'Häktningsförhandling','13 a':'Särskilda regler för häktningsförhandling',
        '14':'Förhandlingens genomförande','15':'Förhandlingens fortsättning','16':'Häktningsbeslut',
        '17':'Häktning utan föregående anhållande','18':'Åtalstid','18 a':'Förlängning av häktningstid',
        '19':'Omprövning av utredningshäktning','20':'Hävning av häktning',
        '21':'Häktning efter dom','21 a':'Frihetsberövandets längd','22':'Förvar av gripna och anhållna','23':'Lagstöd för förvar','24':'Behandling av frihetsberövade'
      }
    }
  };
  return {groups,titles};
});
