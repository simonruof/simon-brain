"""KPIs und Eskalations-Trigger.

Der Sinn des ganzen Systems ist, dass der Mensch NICHT staendig hinschaut.
Also muss die Maschine selbst merken, wann sie ihn wecken muss. Genau zwei
Gruende laut Playbook — Deal ueber Schwelle, Antwortrate unter Schwelle —
plus ein dritter, den ich ergaenzt habe: Kosten aus dem Ruder.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from typing import Any

from .config import Config
from .store import LeadStore


def tagesbericht(store: LeadStore, tag: date | None = None) -> dict[str, Any]:
    tag = tag or date.today()
    cfg = store.cfg
    leads = store.alle()

    gesendet = [l for l in leads if (l.get("outreach") or {}).get("gesendet_am") == tag.isoformat()]
    geantwortet = [l for l in gesendet if (l.get("outreach") or {}).get("antwort_typ")]
    positiv = [l for l in geantwortet if (l.get("outreach") or {}).get("antwort_typ") == "positiv"]

    heute_erfasst = [l for l in leads if l.get("erfasst_am") == tag.isoformat()]
    qualifiziert = [l for l in heute_erfasst if l.get("stage") not in ("discovered", "rejected")]

    antwortrate = round(100 * len(geantwortet) / len(gesendet), 1) if gesendet else 0.0

    return {
        "tag": tag.isoformat(),
        "erfasst": len(heute_erfasst),
        "qualifiziert": len(qualifiziert),
        "gesendet": len(gesendet),
        "antworten": len(geantwortet),
        "positiv": len(positiv),
        "antwortrate_pct": antwortrate,
        "termine": len([l for l in leads if l.get("stage") == "booked"]),
        "gewonnen": len([l for l in leads if l.get("stage") == "won"]),
        "pipeline": dict(Counter(l.get("stage") for l in leads)),
    }


def zeitraum(store: LeadStore, tage: int = 30, bis: date | None = None) -> dict[str, Any]:
    bis = bis or date.today()
    von = bis - timedelta(days=tage - 1)
    leads = store.alle()

    def im_fenster(iso: str | None) -> bool:
        if not iso:
            return False
        return von.isoformat() <= iso <= bis.isoformat()

    gesendet = [l for l in leads if im_fenster((l.get("outreach") or {}).get("gesendet_am"))]
    geantwortet = [l for l in gesendet if (l.get("outreach") or {}).get("antwort_typ")]
    gewonnen = [l for l in leads if l.get("stage") == "won"]
    umsatz = sum((l.get("deal") or {}).get("wert_chf") or 0 for l in gewonnen)

    return {
        "von": von.isoformat(),
        "bis": bis.isoformat(),
        "gesendet": len(gesendet),
        "antworten": len(geantwortet),
        "antwortrate_pct": round(100 * len(geantwortet) / len(gesendet), 1) if gesendet else 0.0,
        "termine": len([l for l in leads if l.get("stage") in ("booked", "won")]),
        "gewonnen": len(gewonnen),
        "umsatz_chf": umsatz,
        "abschlussrate_pct": round(100 * len(gewonnen) / len(gesendet), 1) if gesendet else 0.0,
    }


def eskalationen(store: LeadStore, tag: date | None = None) -> list[dict[str, Any]]:
    """Alles, was heute einen Menschen braucht. Leere Liste = Simon schlaeft weiter."""
    cfg: Config = store.cfg
    tag = tag or date.today()
    t = cfg.section("thresholds")
    offen: list[dict[str, Any]] = []

    # 1. Deals ueber der Schwelle
    grenze = t.get("eskalation_deal_chf", 3000)
    for lead in store.alle():
        wert = (lead.get("deal") or {}).get("wert_chf")
        if wert and wert > grenze and lead.get("stage") in ("replied", "booked"):
            offen.append({
                "typ": "deal_ueber_schwelle",
                "lead": lead["id"],
                "betrieb": lead.get("betrieb", {}).get("name"),
                "wert_chf": wert,
                "text": f"Deal CHF {wert:,}".replace(",", "'") + f" > Schwelle CHF {grenze:,}".replace(",", "'"),
            })

    # 2. Antwortrate unter Alarm
    bericht = tagesbericht(store, tag)
    stichprobe = t.get("min_stichprobe_antwortrate", 20)
    alarm = t.get("alarm_antwortrate_pct", 12.0)
    if bericht["gesendet"] >= stichprobe and bericht["antwortrate_pct"] < alarm:
        offen.append({
            "typ": "antwortrate_unter_alarm",
            "wert": bericht["antwortrate_pct"],
            "text": (f"Antwortrate {bericht['antwortrate_pct']}% unter Alarmwert {alarm}% "
                     f"({bericht['antworten']}/{bericht['gesendet']}) — Nachricht oder Nische pruefen"),
        })

    # 3. Positive Antworten, die auf Freigabe warten
    for lead in store.alle(stage="replied"):
        if (lead.get("outreach") or {}).get("antwort_typ") == "positiv":
            offen.append({
                "typ": "termin_freigabe",
                "lead": lead["id"],
                "betrieb": lead.get("betrieb", {}).get("name"),
                "text": "Positive Antwort — Terminvorschlag freigeben",
            })

    return offen


def formatiere(bericht: dict[str, Any], eskal: list[dict[str, Any]], cfg: Config) -> str:
    """Kurzbericht fuers Handy. Muss ohne Scrollen lesbar sein."""
    t = cfg.section("thresholds")
    ziel = t.get("ziel_antwortrate_pct", 14.0)
    ampel = "🟢" if bericht["antwortrate_pct"] >= ziel else (
        "🟡" if bericht["antwortrate_pct"] >= t.get("alarm_antwortrate_pct", 12.0) else "🔴")

    zeilen = [
        f"*Agency-Lauf {bericht['tag']}*",
        f"{ampel} Antwortrate {bericht['antwortrate_pct']}%  (Ziel {ziel}%)",
        "",
        f"Leads erfasst:   {bericht['erfasst']}  →  qualifiziert {bericht['qualifiziert']}",
        f"Nachrichten:     {bericht['gesendet']}",
        f"Antworten:       {bericht['antworten']}  (davon positiv {bericht['positiv']})",
        f"Termine offen:   {bericht['termine']}",
    ]
    if eskal:
        zeilen += ["", f"*{len(eskal)} Entscheidung(en) fuer dich:*"]
        zeilen += [f"  • {e['text']}" for e in eskal]
    else:
        zeilen += ["", "Keine Entscheidungen noetig."]
    return "\n".join(zeilen)
