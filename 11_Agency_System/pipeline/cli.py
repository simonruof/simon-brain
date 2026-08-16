"""Kommandozeile fuer das Agency-System.

Das ist die einzige Schreibschnittstelle auf den Lead-Store. Die Agents rufen
diese Befehle auf, statt JSON-Dateien direkt zu editieren — so bleibt der
Zustandsautomat intakt und jeder Schritt landet im Event-Log.

    python3 -m pipeline.cli --help
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from . import compliance, kpi, scoring
from .config import Config, load
from .store import LeadStore, StageError


def _aus(daten: Any) -> None:
    print(json.dumps(daten, indent=2, ensure_ascii=False))


def _store(args: argparse.Namespace) -> LeadStore:
    cfg = load(Path(args.config) if args.config else None)
    store = LeadStore(cfg)
    store.init()
    return store


# ── Befehle ──────────────────────────────────────────────────────────────
def cmd_init(args) -> int:
    store = _store(args)
    print(f"Bereit. Leads: {store.leads_dir}  State: {store.state_dir}")
    return 0


def cmd_intake(args) -> int:
    """Scout liefert Rohfunde, hier werden daraus Leads (oder Absagen)."""
    store = _store(args)
    roh = json.loads(Path(args.datei).read_text(encoding="utf-8"))
    if isinstance(roh, dict):
        roh = roh.get("betriebe", [])

    heute = date.fromisoformat(args.tag) if args.tag else date.today()
    ergebnis = {"neu": 0, "duplikate": 0, "abgelehnt": 0, "qualifiziert": [], "abgelehnt_details": []}

    for betrieb in roh:
        lead, status = store.erzeuge(betrieb, heute)
        if status == "duplikat":
            ergebnis["duplikate"] += 1
            continue
        ergebnis["neu"] += 1

        urteil = scoring.bewerte(betrieb, store.cfg, heute)
        lead["score"] = urteil["score"]
        lead["score_gruende"] = urteil["gruende"]

        if compliance.ist_gesperrt(lead, compliance.lade_suppression(store.cfg)):
            store.setze_stage(lead, "blocked", by="scout", note="Suppression-Liste")
            ergebnis["abgelehnt"] += 1
            ergebnis["abgelehnt_details"].append({"lead": lead["id"], "grund": "Suppression-Liste"})
        elif urteil["qualifiziert"]:
            store.setze_stage(lead, "qualified", by="scout", note=f"Score {urteil['score']}")
            ergebnis["qualifiziert"].append({"lead": lead["id"], "score": urteil["score"],
                                            "gruende": urteil["gruende"]})
        else:
            store.setze_stage(lead, "rejected", by="scout", note=urteil["ablehnungsgrund"] or "")
            ergebnis["abgelehnt"] += 1
            ergebnis["abgelehnt_details"].append({"lead": lead["id"], "grund": urteil["ablehnungsgrund"]})

    ergebnis["qualifiziert"].sort(key=lambda x: x["score"], reverse=True)
    _aus(ergebnis)
    return 0


def cmd_next(args) -> int:
    """Arbeitsvorrat fuer eine Stage — das holen sich die Agents ab."""
    store = _store(args)
    leads = store.alle(stage=args.stage)
    leads.sort(key=lambda l: (l.get("score") or 0), reverse=True)
    if args.limit:
        leads = leads[: args.limit]
    if args.knapp:
        _aus([{"id": l["id"], "score": l.get("score"), "betrieb": l.get("betrieb", {}).get("name"),
               "nische": l.get("betrieb", {}).get("nische"), "stadt": l.get("betrieb", {}).get("stadt")}
              for l in leads])
    else:
        _aus(leads)
    return 0


def cmd_diagnose(args) -> int:
    store = _store(args)
    lead = store.lade(args.lead)
    lead["diagnose"] = {
        "text": args.text,
        "hero_angle": args.angle,
        "ton": args.ton,
        "nachricht": args.nachricht,
        "erstellt_am": datetime.now().isoformat(timespec="seconds"),
    }
    store.speichere(lead)
    # Nach einer Ueberarbeitung steht der Lead schon auf 'checked' -> zurueck.
    ziel = "diagnosed" if lead["stage"] in ("qualified", "checked") else lead["stage"]
    if ziel != lead["stage"]:
        store.setze_stage(lead, ziel, by="diagnoser", note=args.angle or "")
    _aus({"lead": lead["id"], "stage": lead["stage"]})
    return 0


def cmd_build(args) -> int:
    store = _store(args)
    lead = store.lade(args.lead)
    lead["mockup"] = {"url": args.url, "provider": args.provider,
                      "gebaut_am": datetime.now().isoformat(timespec="seconds")}
    store.speichere(lead)
    store.setze_stage(lead, "built", by="builder", note=args.url)
    _aus({"lead": lead["id"], "stage": lead["stage"]})
    return 0


def cmd_film(args) -> int:
    store = _store(args)
    lead = store.lade(args.lead)
    lead["video"] = {"pfad": args.pfad, "dauer_sek": store.cfg.get("builder", "video_laenge_sek", 10),
                     "aufloesung": store.cfg.get("builder", "video_aufloesung", "1080x1920"),
                     "gerendert_am": datetime.now().isoformat(timespec="seconds")}
    store.speichere(lead)
    store.setze_stage(lead, "filmed", by="filmer", note=args.pfad)
    _aus({"lead": lead["id"], "stage": lead["stage"]})
    return 0


def cmd_check(args) -> int:
    """Qualitaets-Gate. Faellt die Nachricht durch, geht der Lead zurueck."""
    store = _store(args)
    # 'built' fehlt bewusst: diese Leads warten noch auf den Filmer.
    leads = [store.lade(args.lead)] if args.lead else store.alle(stage="diagnosed") + store.alle(stage="filmed")
    ergebnis = []
    for lead in leads:
        urteil = compliance.pruefe_nachricht(lead, store.cfg)
        lead["check"] = {**urteil, "geprueft_am": datetime.now().isoformat(timespec="seconds")}
        store.speichere(lead)
        if urteil["verdikt"] == "pass":
            store.setze_stage(lead, "checked", by="checker", note="Gate bestanden")
        else:
            if lead["stage"] != "diagnosed":
                store.setze_stage(lead, "checked", by="checker", note="Gate nicht bestanden")
            store.setze_stage(lead, "diagnosed", by="checker", note="; ".join(urteil["befunde"])[:200])
        ergebnis.append({"lead": lead["id"], "verdikt": urteil["verdikt"], "befunde": urteil["befunde"]})
    _aus(ergebnis)
    return 0


def cmd_sendequeue(args) -> int:
    """Was heute wirklich raus darf — nach Compliance und Tagesdeckel."""
    store = _store(args)
    cfg = store.cfg
    jetzt = datetime.fromisoformat(args.jetzt) if args.jetzt else datetime.now()
    heute = jetzt.date().isoformat()

    schon_gesendet = len([l for l in store.alle() if (l.get("outreach") or {}).get("gesendet_am") == heute])
    deckel = cfg.get("pitcher", "nachrichten_pro_tag", 30)
    rest = max(0, deckel - schon_gesendet)

    freigegeben, blockiert = [], []
    for lead in sorted(store.alle(stage="checked"), key=lambda l: (l.get("score") or 0), reverse=True):
        ok, grund = compliance.darf_senden(lead, cfg, jetzt)
        if ok and len(freigegeben) < rest:
            freigegeben.append({
                "lead": lead["id"],
                "betrieb": lead.get("betrieb", {}).get("name"),
                "kanal": lead.get("outreach", {}).get("kanal") or cfg.get("pitcher", "kanal_default", "email"),
                "email": lead.get("betrieb", {}).get("email"),
                "nachricht": lead.get("diagnose", {}).get("nachricht"),
                "mockup": lead.get("mockup", {}).get("url"),
                "video": lead.get("video", {}).get("pfad"),
            })
        elif not ok:
            blockiert.append({"lead": lead["id"], "grund": grund})

    _aus({"datum": heute, "tagesdeckel": deckel, "bereits_gesendet": schon_gesendet,
          "freigegeben": freigegeben, "blockiert": blockiert})
    return 0


def cmd_sent(args) -> int:
    store = _store(args)
    lead = store.lade(args.lead)
    jetzt = datetime.fromisoformat(args.jetzt) if args.jetzt else datetime.now()

    # Harte Sperren gelten immer — --force hebelt nur das Sendefenster aus.
    sperre = compliance.harte_sperre(lead, store.cfg)
    if sperre:
        _aus({"lead": lead["id"], "fehler": f"Versand gesperrt: {sperre}"})
        return 2
    ok, grund = compliance.darf_senden(lead, store.cfg, jetzt)
    if not ok and not args.force:
        _aus({"lead": lead["id"], "fehler": f"Versand nicht erlaubt: {grund}"})
        return 2
    out = lead.setdefault("outreach", {})
    out["kanal"] = args.kanal or store.cfg.get("pitcher", "kanal_default", "email")
    out["gesendet_am"] = (args.tag or date.today().isoformat())
    out["kontakte"] = out.get("kontakte", 0) + 1
    if lead["stage"] == "pitched":
        out["follow_ups"] = out.get("follow_ups", 0) + 1
    store.speichere(lead)
    store.setze_stage(lead, "pitched", by="pitcher", note=out["kanal"])
    _aus({"lead": lead["id"], "stage": lead["stage"], "kontakte": out["kontakte"]})
    return 0


def cmd_reply(args) -> int:
    """Antwort erfassen. Opt-out sperrt den Betrieb dauerhaft."""
    store = _store(args)
    lead = store.lade(args.lead)
    typ = args.typ
    if args.text and compliance.ist_opt_out(args.text):
        typ = "optout"

    out = lead.setdefault("outreach", {})
    out["antwort"] = args.text
    out["antwort_typ"] = typ
    out["antwort_am"] = date.today().isoformat()
    store.speichere(lead)

    if typ == "optout":
        _suppress_eintrag(store.cfg, lead)
        store.sperre(lead["id"], "Opt-out durch Empfaenger")
        _aus({"lead": lead["id"], "stage": "blocked", "hinweis": "Auf Suppression-Liste gesetzt"})
        return 0

    store.setze_stage(lead, "replied", by="mobile", note=typ)
    if typ == "negativ":
        store.setze_stage(lead, "lost", by="mobile", note="Absage")
    _aus({"lead": lead["id"], "stage": lead["stage"], "antwort_typ": typ})
    return 0


def cmd_book(args) -> int:
    store = _store(args)
    lead = store.lade(args.lead)
    lead["termin"] = {"zeit": args.zeit, "link": args.link,
                      "gebucht_am": datetime.now().isoformat(timespec="seconds")}
    store.speichere(lead)
    store.setze_stage(lead, "booked", by="mobile", note=args.zeit)
    _aus({"lead": lead["id"], "stage": lead["stage"], "termin": lead["termin"]})
    return 0


def cmd_deal(args) -> int:
    store = _store(args)
    lead = store.lade(args.lead)
    lead["deal"] = {"wert_chf": args.wert, "status": args.status}
    grenze = store.cfg.get("thresholds", "eskalation_deal_chf", 3000)
    if args.wert and args.wert > grenze and args.status not in ("won", "lost"):
        lead["eskalation"] = f"Deal CHF {args.wert} ueber Schwelle CHF {grenze} — Freigabe Simon"
    store.speichere(lead)
    if args.status in ("won", "lost"):
        store.setze_stage(lead, args.status, by="operator", note=f"CHF {args.wert}")
    _aus({"lead": lead["id"], "stage": lead["stage"], "deal": lead["deal"],
          "eskalation": lead.get("eskalation")})
    return 0


def cmd_kpi(args) -> int:
    store = _store(args)
    tag = date.fromisoformat(args.tag) if args.tag else date.today()
    bericht = kpi.tagesbericht(store, tag)
    eskal = kpi.eskalationen(store, tag)
    if args.text:
        print(kpi.formatiere(bericht, eskal, store.cfg))
    else:
        _aus({"tag": bericht, "zeitraum": kpi.zeitraum(store, args.tage, tag), "eskalationen": eskal})
    return 0


def cmd_eskalationen(args) -> int:
    store = _store(args)
    eskal = kpi.eskalationen(store)
    _aus(eskal)
    return 1 if eskal else 0  # Exit 1 = "Mensch noetig", fuer Skripte/Notifier


def cmd_suppress(args) -> int:
    store = _store(args)
    pfad = store.cfg.path(store.cfg.get("compliance", "suppression_datei", "state/suppression.txt"))
    with Path(pfad).open("a", encoding="utf-8") as fh:
        fh.write(f"{args.wert.strip().lower()}  # {args.grund or 'manuell'} {date.today().isoformat()}\n")
    print(f"Gesperrt: {args.wert}")
    return 0


def _suppress_eintrag(cfg: Config, lead: dict[str, Any]) -> None:
    pfad = cfg.path(cfg.get("compliance", "suppression_datei", "state/suppression.txt"))
    betrieb = lead.get("betrieb", {})
    wert = (betrieb.get("email") or betrieb.get("name") or lead["id"]).lower()
    Path(pfad).parent.mkdir(parents=True, exist_ok=True)
    with Path(pfad).open("a", encoding="utf-8") as fh:
        fh.write(f"{wert}  # Opt-out {date.today().isoformat()}\n")


def cmd_doctor(args) -> int:
    """Konfiguration auf Widersprueche pruefen, bevor der erste Lauf startet."""
    store = _store(args)
    cfg = store.cfg
    probleme: list[str] = []

    if not cfg.get("scope", "aktive_staedte", []):
        probleme.append("keine aktive Stadt konfiguriert")
    if not cfg.get("scope", "aktive_nischen", []):
        probleme.append("keine aktive Nische konfiguriert")
    if not cfg.get("business", "absender_adresse", ""):
        probleme.append("absender_adresse fehlt — UWG verlangt identifizierbaren Absender")

    mockups = cfg.get("builder", "mockups_pro_tag", 5)
    sends = cfg.get("pitcher", "nachrichten_pro_tag", 30)
    leads = cfg.get("scout", "lead_ziel_pro_tag", 30)
    if mockups > sends:
        probleme.append(f"mockups_pro_tag ({mockups}) > nachrichten_pro_tag ({sends})")
    if sends > leads:
        probleme.append(f"nachrichten_pro_tag ({sends}) > lead_ziel_pro_tag ({leads}) — Vorrat reicht nicht")

    alarm = cfg.get("thresholds", "alarm_antwortrate_pct", 12.0)
    ziel = cfg.get("thresholds", "ziel_antwortrate_pct", 14.0)
    if alarm >= ziel:
        probleme.append(f"alarm_antwortrate_pct ({alarm}) >= ziel_antwortrate_pct ({ziel})")

    if not Path(cfg.path(cfg.get("checker", "verbotene_phrasen_datei", ""))).exists():
        probleme.append("blocklist.txt fehlt")

    _aus({"config": str(cfg.root), "probleme": probleme,
          "status": "ok" if not probleme else "korrigieren"})
    return 0 if not probleme else 1


# ── Parser ───────────────────────────────────────────────────────────────
def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="agency", description="Agency-System — Lead-Pipeline")
    p.add_argument("--config", help="Pfad zu config.toml")
    sub = p.add_subparsers(dest="befehl", required=True)

    sub.add_parser("init", help="Verzeichnisse anlegen").set_defaults(fn=cmd_init)

    s = sub.add_parser("intake", help="Scout-Rohfunde einlesen und qualifizieren")
    s.add_argument("datei"); s.add_argument("--tag")
    s.set_defaults(fn=cmd_intake)

    s = sub.add_parser("next", help="Arbeitsvorrat einer Stage ausgeben")
    s.add_argument("stage"); s.add_argument("--limit", type=int)
    s.add_argument("--knapp", action="store_true", help="nur ID, Score, Name")
    s.set_defaults(fn=cmd_next)

    s = sub.add_parser("diagnose", help="Diagnose und Nachricht speichern")
    s.add_argument("lead"); s.add_argument("--text", required=True); s.add_argument("--angle", required=True)
    s.add_argument("--ton", default=""); s.add_argument("--nachricht", required=True)
    s.set_defaults(fn=cmd_diagnose)

    s = sub.add_parser("build", help="Mockup verknuepfen")
    s.add_argument("lead"); s.add_argument("--url", required=True); s.add_argument("--provider", default="lovable")
    s.set_defaults(fn=cmd_build)

    s = sub.add_parser("film", help="Video verknuepfen")
    s.add_argument("lead"); s.add_argument("--pfad", required=True)
    s.set_defaults(fn=cmd_film)

    s = sub.add_parser("check", help="Qualitaets-Gate laufen lassen")
    s.add_argument("--lead", help="einzelner Lead, sonst alle offenen")
    s.set_defaults(fn=cmd_check)

    s = sub.add_parser("send-queue", help="Versandfreigabe fuer heute")
    s.add_argument("--jetzt", help="ISO-Zeitstempel, fuer Tests")
    s.set_defaults(fn=cmd_sendequeue)

    s = sub.add_parser("sent", help="Versand protokollieren")
    s.add_argument("lead"); s.add_argument("--kanal"); s.add_argument("--tag")
    s.add_argument("--jetzt", help="ISO-Zeitstempel, fuer Tests")
    s.add_argument("--force", action="store_true", help="Sendefenster uebergehen (Compliance-Gates bleiben)")
    s.set_defaults(fn=cmd_sent)

    s = sub.add_parser("reply", help="Antwort erfassen")
    s.add_argument("lead"); s.add_argument("--typ", required=True,
                                           choices=["positiv", "neutral", "negativ", "optout"])
    s.add_argument("--text", default="")
    s.set_defaults(fn=cmd_reply)

    s = sub.add_parser("book", help="Termin erfassen")
    s.add_argument("lead"); s.add_argument("--zeit", required=True); s.add_argument("--link", default="")
    s.set_defaults(fn=cmd_book)

    s = sub.add_parser("deal", help="Dealwert und Status setzen")
    s.add_argument("lead"); s.add_argument("--wert", type=int, required=True)
    s.add_argument("--status", choices=["offen", "won", "lost"], default="offen")
    s.set_defaults(fn=cmd_deal)

    s = sub.add_parser("kpi", help="Kennzahlen")
    s.add_argument("--tag"); s.add_argument("--tage", type=int, default=30)
    s.add_argument("--text", action="store_true", help="Kurzbericht statt JSON")
    s.set_defaults(fn=cmd_kpi)

    sub.add_parser("eskalationen", help="Offene Entscheidungen").set_defaults(fn=cmd_eskalationen)

    s = sub.add_parser("suppress", help="E-Mail/Domain/Name dauerhaft sperren")
    s.add_argument("wert"); s.add_argument("--grund")
    s.set_defaults(fn=cmd_suppress)

    sub.add_parser("doctor", help="Konfiguration pruefen").set_defaults(fn=cmd_doctor)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return args.fn(args)
    except (FileNotFoundError, StageError) as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
