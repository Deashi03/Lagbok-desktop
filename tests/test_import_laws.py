import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from import_laws import check_in_force,document,quality_warnings,check_title,parse_html,parse_text,validate,editorial,build_para,describe_changes,latest_amendment
class ParserTests(unittest.TestCase):
 def test_chapters(self):
  source='<hr><a name="K28">28 kap. Om husrannsakan</a><h4>Husrannsakan</h4><a class="paragraf" name="K28P1"><b>1 §</b></a>Text<br>ny rad<a class="paragraf" name="K28P2"><b>2 §</b></a>Andra'
  result=parse_html(source)
  self.assertEqual(result[0]["number"],"28")
  self.assertEqual(result[0]["items"][0]["nextPara"],"1")
  self.assertIn("ny rad",result[0]["items"][1]["text"])
 def test_chapterless(self):
  result=parse_html('<hr><a class="paragraf" name="P1"><b>1 §</b></a>Text 1<a class="paragraf" name="P2a"><b>2 a §</b></a>Text 2')
  self.assertEqual(result[0]["number"],"0")
  self.assertEqual(result[0]["items"][1]["number"],"2 a")
 def test_duplicate_chapters_are_versioned(self):
  text='<hr><a name="K27">27 kap. Rubrik</a><a class="paragraf" name="K27P1"><b>1 §</b></a>Första lydelsen<a name="K27">27 kap. Rubrik</a><a class="paragraf" name="K27P1"><b>1 §</b></a>Andra lydelsen'
  chapters=parse_html(text)
  self.assertEqual(len(chapters),1)
  self.assertEqual(len(chapters[0]["items"]),1)
  self.assertEqual([v["text"] for v in chapters[0]["items"][0]["versions"]],["Första lydelsen","Andra lydelsen"])
 def test_versions(self):
  result=parse_html('<hr><a class="paragraf" name="P1"><b>1 §</b></a>Old<a class="paragraf" name="P1"><b>1 §</b></a>New')
  self.assertEqual(len(result[0]["items"][0]["versions"]),2)
 def test_fallback(self):
  result=parse_text('28 kap. Rubrik\n1 § Text\nNästa rad\n2 § Andra')
  self.assertEqual(result[0]["number"],"28")
  self.assertIn("Nästa rad",result[0]["items"][0]["text"])
 def test_validation(self):
  with self.assertRaises(ValueError):
   validate([{"number":"0","items":[{"type":"para","number":"1","text":"Text"}]}],"1984:387")
  validate([{"number":"0","items":[{"type":"para","number":"1","text":"Ensam paragraf"}]}],"1994:1219")
 def test_editorial(self):
  chs=[{"number":"28","title":"","items":[{"type":"para","number":"1","text":"Text"}]}]
  editorial(chs,"1942:740")
  self.assertTrue(chs[0]["items"][0]["editorial"])
 def test_lydelser_are_structured(self):
  item=build_para("3",["/Upphör att gälla U:den dag som regeringen bestämmer/ \r\nGammal text. Lag (2026:253).",
   "/Träder i kraft I:2027-01-01/ \r\nNy text.\n\n\r\n\r\nAndra stycket.\nLag (2026:1654).\n\n/Rubriken träder i kraft I:2027-01-01/"])
  old,new=item["versions"]
  self.assertEqual(old["expires"],{"date":None,"label":"den dag som regeringen bestämmer"})
  self.assertEqual(old["amendedBy"],"2026:253")
  self.assertEqual(old["text"],"Gammal text.")
  self.assertEqual(new["inForce"]["date"],"2027-01-01")
  self.assertEqual(new["text"],"Ny text.\n\nAndra stycket.")
  self.assertEqual(new["amendedBy"],"2026:1654")
 def test_single_future_paragraph_keeps_marker(self):
  item=build_para("4 b",["/Träder i kraft I:2027-01-01/ Ny paragraf."])
  self.assertEqual(item["versions"][0]["inForce"]["date"],"2027-01-01")
 def test_plain_paragraph(self):
  item=build_para("1",["Text\r\n  med   mellanrum. Förordning (2020:12)."])
  self.assertEqual(item,{"type":"para","number":"1","text":"Text\nmed mellanrum.","amendedBy":"2020:12"})
  self.assertTrue(build_para("2",["Har upphört att gälla genom lag (1974:596)."])["repealed"])
  self.assertEqual(build_para("2",["Har upphört att gälla genom lag (1974:596)."])["text"],"Har upphört att gälla genom lag (1974:596).")
 def test_latest_amendment_and_report(self):
  old={"latestAmendment":"2025:9","chapters":[{"number":"0","items":[{"type":"para","number":"1","text":"A"},{"type":"para","number":"2","text":"B"}]}]}
  chs=[{"number":"0","items":[build_para("1",["A ändrad. Lag (2026:10)."]),build_para("3",["/Träder i kraft I:2027-01-01/ C"])]}]
  self.assertEqual(latest_amendment(chs),"2026:10")
  report=describe_changes("Testlagen","2000:1",old,{"latestAmendment":"2026:10","chapters":chs})
  self.assertIn("Ändrade paragrafer (1): 1 §",report)
  self.assertIn("Nya paragrafer (1): 3 §",report)
  self.assertIn("Borttagna paragrafer (1): 2 §",report)
  self.assertIn("Med kommande lydelse (1): 3 §",report)
 def test_letter_chapters(self):
  result=parse_html('<hr><a name="K1">1 kap. Första</a><a class="paragraf" name="K1P1"><b>1 §</b></a>Ett<a name="K1a">1 a kap. Mellan</a><a class="paragraf" name="K1aP7"><b>7 §</b></a>Sju')
  self.assertEqual([c["number"] for c in result],["1","1 a"])
  self.assertEqual(result[1]["items"][0]["number"],"7")
 def test_title_check(self):
  check_title({"check":"föräldrabalk"},"Föräldrabalk (1949:381)")
  with self.assertRaises(ValueError):check_title({"check":"föräldrabalk"},"Lag (1949:382) om något annat")
 def test_transitions_are_separated(self):
  item=build_para("10",["Sista paragrafen. Lag (1994:1034).\n\nÖvergångsbestämmelser\n1983:920\n\nDenna lag träder i kraft den 1 januari 1984.\n\n1984:131\n\n1. Denna lag träder i kraft den 1 juli 1984."])
  self.assertEqual(item["text"],"Sista paragrafen.")
  self.assertEqual(item["amendedBy"],"1994:1034")
  doc=document("1942:740","RB","HTML",[{"number":"59","title":"","items":[item]}])
  self.assertEqual(doc["transitions"],[{"sfs":"1983:920","text":"Denna lag träder i kraft den 1 januari 1984."},{"sfs":"1984:131","text":"1. Denna lag träder i kraft den 1 juli 1984."}])
  self.assertNotIn("_transitions",doc["chapters"][0]["items"][0])
 def test_quality_warnings(self):
  old={"chapters":[{"number":"1","items":[{"type":"para","number":str(i),"text":"x"} for i in range(20)]},{"number":"2","items":[{"type":"para","number":"1","text":"y"}]}]}
  new={"chapters":[{"number":"1","items":[{"type":"para","number":"1","text":"x"*16000}]}]}
  w=" ".join(quality_warnings(old,new))
  self.assertIn("minskade",w);self.assertIn("kapitel saknas: 2",w);self.assertIn("ovanligt långa",w)
 def test_repealed_documents_are_refused(self):
  check_in_force({"html":"<b>Utfärdad</b>: 1984-05-24<br><b>Ändrad</b>: t.o.m. SFS 2026:1<hr><a class=\"paragraf\">1 §</a>"})
  with self.assertRaises(ValueError):
   check_in_force({"html":"<b>Utfärdad</b>: 2000-05-11<br><b>Upphävd</b>: 2017-07-01<hr>text"},"2026-10-26")
  self.assertEqual(check_in_force({"html":"<b>Upphävd</b>: 2030-07-01<hr>text"},"2026-10-26"),"2030-07-01")
if __name__=="__main__":unittest.main()
