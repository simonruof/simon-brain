"""Tests fuer den deterministischen Kern.

Nur stdlib (unittest), damit das ohne Installation laeuft:

    cd 11_Agency_System && python3 -m unittest discover -s pipeline/tests -v
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline import compliance, kpi, scoring  # noqa: E402
from pipeline.cli import main  # noqa: E402
from pipeline.config import load  # noqa: E402
from pipeline.store import LeadStore, StageError, fingerprint  # noqa: E402

PROJEKT = Path(__file__).resolve().parents[2]

GUTER_BETRIEB = {
    "name": "Sanitaer Meier AG",
    "nische": "Sanitaer",
    "stadt": "Schwyz",
    "adresse": "Hauptstrasse 12, 6430 Schwyz",
    "telefon": "+41 41 811 22 33",
    "email": "info@sanitaer-meier.ch",
    "website": "",
    "website_jahr": None,
    "mobile_optimiert": False,
    "maps_url": "https://maps.google.com/?cid=1",
    "bewertungen": 23,
    "sterne": 4.7,
    "erster_eintrag_jahr": 2011,
}


class Basis(unittest.TestCase):
    """Legt fuer jeden Test eine eigene Projektkopie an (echte Config, leerer State)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(PROJEKT / "config", self.tmp / "config")
        self.cfg = load(self.tmp / "config" / "config.toml", root=self.tmp)
        self.store = LeadStore(self.cfg)
        self.store.init()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _cli(self, *args: str) -> int:
        return main(["--config", str(self.tmp / "config" / "config.toml"), *args])

    def _lead(self, **overrides):
        betrieb = {**GUTER_BETRIEB, **overrides}
        lead, _ = self.store.erzeuge(betrieb, date(2026, 8, 17))  # Montag
        return lead


# ── Scoring ──────────────────────────────────────────────────────────────
class TestScoring(Basis):
    def test_idealer_lead_qualifiziert(self):
        u = scoring.bewerte(GUTER_BETRIEB, self.cfg, date(2026, 8, 16))
        self.assertTrue(u["qualifiziert"], u)
        self.assertGreaterEqual(u["score"], 60)
        self.assertIn("keine Website", u["gruende"])

    def test_zu_viele_bewertungen_abgelehnt(self):
        u = scoring.bewerte({**GUTER_BETRIEB, "bewertungen": 180}, self.cfg, date(2026, 8, 16))
        self.assertFalse(u["qualifiziert"])
        self.assertIn("laeuft bereits gut", u["ablehnungsgrund"])

    def test_moderne_website_kein_aufhaenger(self):
        u = scoring.bewerte(
            {**GUTER_BETRIEB, "website": "https://meier.ch", "website_jahr": 2024, "mobile_optimiert": True},
            self.cfg, date(2026, 8, 16))
        self.assertFalse(u["qualifiziert"])
        self.assertIn("keine Luecke", u["ablehnungsgrund"])

    def test_veraltete_website_zaehlt_als_luecke(self):
        u = scoring.bewerte({**GUTER_BETRIEB, "website": "https://meier.ch", "website_jahr": 2013},
                            self.cfg, date(2026, 8, 16))
        self.assertTrue(u["qualifiziert"])
        self.assertIn("Website von 2013", u["gruende"])

    def test_zu_junger_betrieb_abgelehnt(self):
        u = scoring.bewerte({**GUTER_BETRIEB, "erster_eintrag_jahr": 2024}, self.cfg, date(2026, 8, 16))
        self.assertFalse(u["qualifiziert"])
        self.assertIn("zu jung", u["ablehnungsgrund"])

    def test_inaktive_nische_abgelehnt(self):
        u = scoring.bewerte({**GUTER_BETRIEB, "nische": "Zahnarzt"}, self.cfg, date(2026, 8, 16))
        self.assertFalse(u["qualifiziert"])
        self.assertIn("nicht aktiv", u["ablehnungsgrund"])

    def test_kette_abgelehnt(self):
        u = scoring.bewerte({**GUTER_BETRIEB, "name": "Sanitaer Zentral Filiale Schwyz"},
                            self.cfg, date(2026, 8, 16))
        self.assertFalse(u["qualifiziert"])
        self.assertIn("Kette", u["ablehnungsgrund"])

    def test_ohne_adresse_kein_b2b_beleg(self):
        u = scoring.bewerte({**GUTER_BETRIEB, "adresse": ""}, self.cfg, date(2026, 8, 16))
        self.assertFalse(u["qualifiziert"])
        self.assertIn("Geschaeftsadresse", u["ablehnungsgrund"])


# ── Store / Zustandsautomat ──────────────────────────────────────────────
class TestStore(Basis):
    def test_dedupe_ueber_tage(self):
        lead, status = self.store.erzeuge(GUTER_BETRIEB, date(2026, 8, 17))
        self.assertEqual(status, "neu")
        wieder, status2 = self.store.erzeuge(GUTER_BETRIEB, date(2026, 8, 20))
        self.assertEqual(status2, "duplikat")
        self.assertIsNone(wieder)

    def test_fingerprint_ignoriert_wechselnde_felder(self):
        a = fingerprint(GUTER_BETRIEB)
        b = fingerprint({**GUTER_BETRIEB, "telefon": "andere", "website": "https://neu.ch"})
        self.assertEqual(a, b)

    def test_unerlaubter_uebergang_wirft(self):
        lead = self._lead()
        with self.assertRaises(StageError):
            self.store.setze_stage(lead, "pitched")

    def test_erlaubter_pfad_bis_pitched(self):
        lead = self._lead()
        for stage in ("qualified", "diagnosed", "built", "filmed", "checked", "pitched"):
            self.store.setze_stage(lead, stage)
        self.assertEqual(lead["stage"], "pitched")
        self.assertEqual(len(lead["history"]), 6)

    def test_sperre_aus_jeder_stage(self):
        lead = self._lead()
        self.store.setze_stage(lead, "qualified")
        gesperrt = self.store.sperre(lead["id"], "Test")
        self.assertEqual(gesperrt["stage"], "blocked")
        self.assertEqual(gesperrt["history"][-1]["von"], "qualified")

    def test_events_werden_protokolliert(self):
        lead = self._lead()
        self.store.setze_stage(lead, "qualified")
        typen = [e["typ"] for e in self.store.events()]
        self.assertEqual(typen, ["discovered", "qualified"])


# ── Compliance / Checker ─────────────────────────────────────────────────
class TestCompliance(Basis):
    def _mit_nachricht(self, text: str):
        lead = self._lead()
        lead["diagnose"] = {"nachricht": text}
        return lead

    GUT = ("Guten Tag Herr Meier, Ihr Sanitaer-Betrieb in Schwyz hat 4.7 Sterne bei 23 Bewertungen, "
           "aber keine Website. Wer Sie googelt, findet nichts. Ich habe eine Seite gebaut, "
           "die Sie sich ansehen koennen. Simon Ruof, 6442 Gersau. Keine weiteren Mails? Kurz antworten.")

    def test_gute_nachricht_besteht(self):
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(self.GUT), self.cfg)
        self.assertEqual(urteil["verdikt"], "pass", urteil["befunde"])
        self.assertGreaterEqual(len(urteil["personalisierung"]), 2)

    def test_buzzword_faellt_durch(self):
        text = self.GUT.replace("Ich habe eine Seite gebaut", "Ich biete eine ganzheitliche Lösung")
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertEqual(urteil["verdikt"], "fail")
        self.assertTrue(any("ganzheitliche" in b for b in urteil["befunde"]))

    def test_umlaut_variante_wird_erkannt(self):
        """'maßgeschneiderte Lösung' muss genauso fallen wie die ae/ss-Schreibweise."""
        text = self.GUT + " Eine maßgeschneiderte Lösung."
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertEqual(urteil["verdikt"], "fail")

    def test_floskel_ohne_komma_faellt_durch(self):
        """Blocklist-Zeile steht mit Komma — die Nachricht darf nicht ohne durchrutschen."""
        text = "Guten Tag, ich hoffe es geht Ihnen gut. " + self.GUT
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertTrue(any("ich hoffe" in b for b in urteil["befunde"]), urteil["befunde"])

    def test_befunde_ohne_dubletten(self):
        """'Lösung' und 'Loesung' normalisieren gleich — nur ein Befund."""
        text = self.GUT + " Eine ganzheitliche Lösung."
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        loesung = [b for b in urteil["befunde"] if "ganzheitliche" in b]
        self.assertEqual(len(loesung), 1, urteil["befunde"])

    def test_sterne_bleiben_trotz_normalisierung_erkennbar(self):
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(self.GUT), self.cfg)
        self.assertIn("Sterne", urteil["personalisierung"])

    def test_ki_erwaehnung_faellt_durch(self):
        text = self.GUT.replace("Ich habe eine Seite gebaut", "Ich habe mit KI eine Seite gebaut")
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertEqual(urteil["verdikt"], "fail")
        self.assertTrue(any("KI-Vokabular" in b for b in urteil["befunde"]))

    def test_ki_marker_nicht_in_wortmitte(self):
        """'Praktiker' enthaelt 'ki' — darf aber kein KI-Treffer sein."""
        text = self.GUT.replace("Ihr Sanitaer-Betrieb", "Ihr Praktiker-Betrieb fuer Sanitaer")
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertFalse(any("KI-Vokabular" in b for b in urteil["befunde"]), urteil["befunde"])

    def test_zu_lang_faellt_durch(self):
        text = self.GUT + " " + ("Wort " * 80)
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertTrue(any("Woerter" in b for b in urteil["befunde"]))

    def test_ohne_optout_faellt_durch(self):
        text = self.GUT.replace("Keine weiteren Mails? Kurz antworten.", "")
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertTrue(any("Opt-out" in b for b in urteil["befunde"]))

    def test_ohne_absender_faellt_durch(self):
        text = self.GUT.replace("Simon Ruof, 6442 Gersau. ", "")
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertTrue(any("Absenderidentifikation" in b for b in urteil["befunde"]))

    def test_generische_nachricht_faellt_an_personalisierung(self):
        text = ("Guten Tag, ich baue Websites fuer Betriebe. Interesse an einem Gespraech? "
                "Simon Ruof, 6442 Gersau. Zum Abmelden kurz antworten.")
        urteil = compliance.pruefe_nachricht(self._mit_nachricht(text), self.cfg)
        self.assertTrue(any("personalisierte Fakten" in b for b in urteil["befunde"]))

    def test_sendefenster(self):
        mo_vormittag = datetime(2026, 8, 17, 9, 30)
        so_vormittag = datetime(2026, 8, 16, 9, 30)
        mo_nachts = datetime(2026, 8, 17, 23, 0)
        self.assertTrue(compliance.im_sendefenster(self.cfg, mo_vormittag)[0])
        self.assertFalse(compliance.im_sendefenster(self.cfg, so_vormittag)[0])
        self.assertFalse(compliance.im_sendefenster(self.cfg, mo_nachts)[0])

    def test_suppression_greift(self):
        pfad = self.tmp / "state" / "suppression.txt"
        pfad.write_text("info@sanitaer-meier.ch\n", encoding="utf-8")
        lead = self._lead()
        self.assertTrue(compliance.ist_gesperrt(lead, compliance.lade_suppression(self.cfg)))

    def test_kontaktdeckel(self):
        lead = self._lead()
        lead["outreach"]["kontakte"] = 3
        self.assertTrue(compliance.kontaktdeckel_erreicht(lead, self.cfg))

    def test_opt_out_erkennung(self):
        self.assertTrue(compliance.ist_opt_out("Bitte keine weiteren Mails."))
        self.assertTrue(compliance.ist_opt_out("Bitte austragen"))
        self.assertFalse(compliance.ist_opt_out("Klingt spannend, wann haben Sie Zeit?"))


# ── CLI end-to-end ───────────────────────────────────────────────────────
class TestCLI(Basis):
    def test_kompletter_durchlauf(self):
        roh = self.tmp / "roh.json"
        roh.write_text(json.dumps([GUTER_BETRIEB, {**GUTER_BETRIEB, "name": "Sanitaer Huber",
                                                   "email": "info@huber.ch", "bewertungen": 400}]),
                       encoding="utf-8")

        self.assertEqual(self._cli("intake", str(roh), "--tag", "2026-08-17"), 0)
        qualifiziert = self.store.alle(stage="qualified")
        self.assertEqual(len(qualifiziert), 1)          # Huber faellt durch (400 Bewertungen)
        self.assertEqual(len(self.store.alle(stage="rejected")), 1)

        lid = qualifiziert[0]["id"]
        self.assertEqual(self._cli("diagnose", lid, "--text", "Keine Website trotz 4.7 Sternen",
                                   "--angle", "Sichtbarkeit", "--ton", "handwerklich-direkt",
                                   "--nachricht", TestCompliance.GUT), 0)
        self.assertEqual(self._cli("check", "--lead", lid), 0)
        self.assertEqual(self.store.lade(lid)["stage"], "checked")

        self.assertEqual(self._cli("sent", lid, "--kanal", "email", "--tag", date.today().isoformat(),
                                   "--jetzt", "2026-08-17T09:00:00"), 0)
        self.assertEqual(self.store.lade(lid)["stage"], "pitched")

        self.assertEqual(self._cli("reply", lid, "--typ", "positiv", "--text", "Klingt gut, wann?"), 0)
        self.assertEqual(self._cli("book", lid, "--zeit", "2026-08-20T10:00"), 0)
        self.assertEqual(self._cli("deal", lid, "--wert", "1490", "--status", "won"), 0)
        self.assertEqual(self.store.lade(lid)["stage"], "won")

    def test_check_schickt_schlechte_nachricht_zurueck(self):
        lead = self._lead()
        self.store.setze_stage(lead, "qualified")
        self._cli("diagnose", lead["id"], "--text", "x", "--angle", "y",
                  "--nachricht", "Guten Tag, revolutionieren Sie Ihr Geschaeft!")
        self._cli("check", "--lead", lead["id"])
        danach = self.store.lade(lead["id"])
        self.assertEqual(danach["stage"], "diagnosed")
        self.assertEqual(danach["check"]["verdikt"], "fail")

    def test_send_queue_respektiert_tagesdeckel(self):
        """Mehr freigegebene Leads als Tagesdeckel -> Queue kappt sauber."""
        deckel = self.cfg.get("pitcher", "nachrichten_pro_tag", 30)
        for i in range(deckel + 3):
            lead = self._lead(name=f"Sanitaer Betrieb {i}", email=f"info{i}@x.ch")
            lead["diagnose"] = {"nachricht": TestCompliance.GUT}
            lead["check"] = {"verdikt": "pass"}
            self.store.speichere(lead)
            for stage in ("qualified", "diagnosed", "checked"):
                self.store.setze_stage(lead, stage)

        import io
        from contextlib import redirect_stdout
        puffer = io.StringIO()
        with redirect_stdout(puffer):
            self._cli("send-queue", "--jetzt", "2026-08-17T09:00:00")
        ergebnis = json.loads(puffer.getvalue())
        self.assertEqual(len(ergebnis["freigegeben"]), deckel)

    def test_opt_out_sperrt_dauerhaft(self):
        lead = self._lead()
        for stage in ("qualified", "diagnosed", "checked"):
            self.store.setze_stage(lead, stage)
        lead["check"] = {"verdikt": "pass"}
        self.store.speichere(lead)
        self._cli("sent", lead["id"], "--force")
        self._cli("reply", lead["id"], "--typ", "positiv", "--text", "Bitte keine weiteren Mails")

        danach = self.store.lade(lead["id"])
        self.assertEqual(danach["stage"], "blocked")
        self.assertEqual(danach["outreach"]["antwort_typ"], "optout")
        self.assertTrue(compliance.ist_gesperrt(danach, compliance.lade_suppression(self.cfg)))

    def test_force_umgeht_suppression_nicht(self):
        """--force darf das Sendefenster loesen, nie eine Sperre."""
        lead = self._lead()
        for stage in ("qualified", "diagnosed", "checked"):
            self.store.setze_stage(lead, stage)
        lead["check"] = {"verdikt": "pass"}
        self.store.speichere(lead)
        (self.tmp / "state" / "suppression.txt").write_text("info@sanitaer-meier.ch\n", encoding="utf-8")

        self.assertEqual(self._cli("sent", lead["id"], "--force"), 2)
        self.assertEqual(self.store.lade(lead["id"])["stage"], "checked")

    def test_force_umgeht_checker_gate_nicht(self):
        lead = self._lead()
        for stage in ("qualified", "diagnosed"):
            self.store.setze_stage(lead, stage)
        lead["check"] = {"verdikt": "fail", "befunde": ["Buzzword"]}
        self.store.speichere(lead)
        self.assertEqual(self._cli("sent", lead["id"], "--force"), 2)

    def test_doctor_meldet_widerspruch(self):
        pfad = self.tmp / "config" / "config.toml"
        inhalt = pfad.read_text(encoding="utf-8").replace(
            "nachrichten_pro_tag       = 30", "nachrichten_pro_tag       = 500")
        pfad.write_text(inhalt, encoding="utf-8")
        self.assertEqual(self._cli("doctor"), 1)

    def test_doctor_ist_mit_auslieferungsconfig_gruen(self):
        self.assertEqual(self._cli("doctor"), 0)


# ── KPI / Eskalation ─────────────────────────────────────────────────────
class TestKPI(Basis):
    def _pitched(self, name: str, antwort: str | None = None, wert: int | None = None, stage: str = "pitched"):
        lead = self._lead(name=name, email=f"{name.replace(' ', '')}@x.ch")
        for s in ("qualified", "diagnosed", "checked", "pitched"):
            self.store.setze_stage(lead, s)
        lead["outreach"].update({"gesendet_am": date.today().isoformat(), "kontakte": 1,
                                 "antwort_typ": antwort})
        if antwort:
            self.store.setze_stage(lead, "replied")
        if wert:
            lead["deal"] = {"wert_chf": wert, "status": "offen"}
        self.store.speichere(lead)
        return lead

    def test_antwortrate_und_alarm(self):
        for i in range(25):
            self._pitched(f"Betrieb {i}", antwort="positiv" if i < 2 else None)
        bericht = kpi.tagesbericht(self.store)
        self.assertEqual(bericht["gesendet"], 25)
        self.assertEqual(bericht["antwortrate_pct"], 8.0)

        eskal = kpi.eskalationen(self.store)
        self.assertTrue(any(e["typ"] == "antwortrate_unter_alarm" for e in eskal))

    def test_kein_alarm_bei_zu_kleiner_stichprobe(self):
        """3 Sends ohne Antwort sind Rauschen, kein Signal — Simon bleibt ungestoert."""
        for i in range(3):
            self._pitched(f"Betrieb {i}")
        eskal = kpi.eskalationen(self.store)
        self.assertFalse(any(e["typ"] == "antwortrate_unter_alarm" for e in eskal))

    def test_grosser_deal_eskaliert(self):
        self._pitched("Grossauftrag", antwort="positiv", wert=8500)
        eskal = kpi.eskalationen(self.store)
        self.assertTrue(any(e["typ"] == "deal_ueber_schwelle" for e in eskal))

    def test_kleiner_deal_eskaliert_nicht(self):
        self._pitched("Kleinauftrag", antwort="positiv", wert=1490)
        eskal = kpi.eskalationen(self.store)
        self.assertFalse(any(e["typ"] == "deal_ueber_schwelle" for e in eskal))

    def test_kurzbericht_lesbar(self):
        self._pitched("Betrieb A", antwort="positiv")
        text = kpi.formatiere(kpi.tagesbericht(self.store), kpi.eskalationen(self.store), self.cfg)
        self.assertIn("Antwortrate", text)
        self.assertLess(len(text.splitlines()), 20)


if __name__ == "__main__":
    unittest.main()
