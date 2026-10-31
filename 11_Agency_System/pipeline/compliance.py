"""Compliance- und Qualitaets-Gates.

Zwei Sorten Regeln, bewusst im selben Modul:

1. Rechtliche Gates (UWG Art. 3 Abs. 1 lit. o, DSG 2023) — nicht verhandelbar.
   Faellt ein Lead hier durch, wird nicht gesendet, Punkt.
2. Qualitaets-Gates (Checker-Agent) — Personalisierung, KI-Marker, Buzzwords.

Details und Begruendung: siehe COMPLIANCE.md.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, time
from pathlib import Path
from typing import Any

from .config import Config

WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

OPT_OUT_MARKER = ("abmelden", "keine weiteren", "nicht mehr kontakt", "austragen", "unsubscribe")
KI_MARKER = ("ki", "k.i.", "ai", "künstliche intelligenz", "kuenstliche intelligenz", "chatgpt", "claude")


# ── Normalisierung ───────────────────────────────────────────────────────
def normalisiere(text: str) -> str:
    """Kleinschreibung, Umlaute auf ae/oe/ue, Satzzeichen zu Leerzeichen.

    Zwei Faelle, die das abfaengt:
    - 'Maßgeschneiderte Lösung' matcht die Blocklist-Zeile in ae/ss-Schreibweise
    - 'ich hoffe es geht Ihnen gut' matcht auch die Zeile mit Komma

    Punkte bleiben stehen, damit '4.7 Sterne' als Fakt erkennbar bleibt.
    """
    text = text.lower().replace("ß", "ss")
    text = text.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[,;:!?\-–—/()\"']", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ── Suppression-Liste ────────────────────────────────────────────────────
def lade_suppression(cfg: Config) -> set[str]:
    pfad = cfg.path(cfg.get("compliance", "suppression_datei", "state/suppression.txt"))
    if not Path(pfad).exists():
        return set()
    eintraege = set()
    for zeile in Path(pfad).read_text(encoding="utf-8").splitlines():
        zeile = zeile.split("#", 1)[0].strip().lower()
        if zeile:
            eintraege.add(zeile)
    return eintraege


def ist_gesperrt(lead: dict[str, Any], suppression: set[str]) -> bool:
    betrieb = lead.get("betrieb", {})
    kandidaten = [
        (betrieb.get("email") or "").lower(),
        (betrieb.get("name") or "").lower(),
        (betrieb.get("telefon") or "").replace(" ", ""),
    ]
    domain = _domain(betrieb.get("website") or betrieb.get("email") or "")
    if domain:
        kandidaten.append(domain)
    return any(k and k in suppression for k in kandidaten)


def _domain(wert: str) -> str:
    wert = wert.strip().lower()
    if "@" in wert:
        return wert.split("@", 1)[1]
    wert = re.sub(r"^https?://", "", wert)
    return wert.split("/", 1)[0].removeprefix("www.")


# ── Sendefenster & Kontakt-Deckel ────────────────────────────────────────
def _parse_zeit(wert: str) -> time:
    stunde, minute = wert.split(":")
    return time(int(stunde), int(minute))


def im_sendefenster(cfg: Config, jetzt: datetime | None = None) -> tuple[bool, str]:
    """Keine Nacht-, Wochenend- oder Feiertagsmails. Sonst brennt die Domain."""
    jetzt = jetzt or datetime.now()
    p = cfg.section("pitcher")
    tag = WOCHENTAGE[jetzt.weekday()]
    if tag not in p.get("sendetage", ["Mo", "Di", "Mi", "Do", "Fr"]):
        return False, f"{tag} ist kein Sendetag"
    start = _parse_zeit(p.get("sendefenster_start", "08:00"))
    ende = _parse_zeit(p.get("sendefenster_ende", "17:30"))
    if not (start <= jetzt.time() <= ende):
        return False, f"{jetzt.strftime('%H:%M')} ausserhalb {start:%H:%M}-{ende:%H:%M}"
    return True, "ok"


def kontaktdeckel_erreicht(lead: dict[str, Any], cfg: Config) -> bool:
    max_kontakte = cfg.get("compliance", "max_kontakte_pro_betrieb", 3)
    return lead.get("outreach", {}).get("kontakte", 0) >= max_kontakte


def ist_opt_out(antwort_text: str) -> bool:
    text = normalisiere(antwort_text)
    return any(marker in text for marker in OPT_OUT_MARKER)


# ── Nachrichten-Pruefung (Checker-Agent) ─────────────────────────────────
def lade_blocklist(cfg: Config) -> list[str]:
    pfad = cfg.path(cfg.get("checker", "verbotene_phrasen_datei", "config/blocklist.txt"))
    if not Path(pfad).exists():
        return []
    phrasen = []
    for zeile in Path(pfad).read_text(encoding="utf-8").splitlines():
        zeile = zeile.split("#", 1)[0].strip()
        if zeile:
            phrasen.append(normalisiere(zeile))
    # Nach der Normalisierung fallen Schreibvarianten zusammen
    # ('Lösung' und 'Loesung') — sonst meldet der Checker denselben Befund doppelt.
    return list(dict.fromkeys(phrasen))


def personalisierungs_treffer(nachricht: str, lead: dict[str, Any]) -> list[str]:
    """Zaehlt konkrete, lead-spezifische Fakten in der Nachricht.

    Der Betriebsname allein zaehlt nicht als Personalisierung — den kann
    jedes Serienmail einsetzen. Es braucht Fakten, die belegen, dass jemand
    wirklich hingeschaut hat.
    """
    text = normalisiere(nachricht)
    betrieb = lead.get("betrieb", {})
    treffer: list[str] = []

    stadt = normalisiere(betrieb.get("stadt") or "")
    if stadt and stadt in text:
        treffer.append("Ort")

    bewertungen = betrieb.get("bewertungen")
    if isinstance(bewertungen, int) and str(bewertungen) in text:
        treffer.append("Bewertungsanzahl")

    sterne = betrieb.get("sterne")
    if sterne is not None and (str(sterne) in text or str(sterne).replace(".", ",") in text):
        treffer.append("Sterne")

    website_jahr = betrieb.get("website_jahr")
    if isinstance(website_jahr, int) and str(website_jahr) in text:
        treffer.append("Website-Jahrgang")

    if betrieb.get("website") and _domain(betrieb["website"]).split(".")[0] in text:
        treffer.append("Domain")

    for wort in ("mobil", "handy", "smartphone"):
        if betrieb.get("mobile_optimiert") is False and wort in text:
            treffer.append("Mobil-Befund")
            break

    nische = normalisiere(betrieb.get("nische") or "")
    if nische and nische in text:
        treffer.append("Nische")

    return sorted(set(treffer))


def pruefe_nachricht(lead: dict[str, Any], cfg: Config) -> dict[str, Any]:
    """Vollstaendiges Gate vor dem Senden. Ein Befund = kein Versand."""
    c = cfg.section("checker")
    nachricht = (lead.get("diagnose", {}) or {}).get("nachricht", "") or ""
    befunde: list[str] = []

    if not nachricht.strip():
        return {"verdikt": "fail", "befunde": ["keine Nachricht vorhanden"], "personalisierung": []}

    # 1. Laenge
    woerter = len(nachricht.split())
    max_woerter = cfg.get("pitcher", "max_woerter_nachricht", 70)
    if woerter > max_woerter:
        befunde.append(f"{woerter} Woerter, erlaubt sind {max_woerter}")

    # 2. Blocklist
    text = normalisiere(nachricht)
    for phrase in lade_blocklist(cfg):
        if phrase in text:
            befunde.append(f"verbotene Phrase: '{phrase}'")

    # 3. Personalisierung
    treffer = personalisierungs_treffer(nachricht, lead)
    if len(treffer) < c.get("min_personalisierung", 2):
        befunde.append(
            f"nur {len(treffer)} personalisierte Fakten ({', '.join(treffer) or 'keine'}), "
            f"noetig sind {c.get('min_personalisierung', 2)}"
        )

    # 4. Ton
    if nachricht.count("!") > c.get("max_ausrufezeichen", 1):
        befunde.append("zu viele Ausrufezeichen")

    # 5. Simons Regel: kein KI-Vokabular im Erstkontakt
    if c.get("verbiete_ki_erwaehnung", True):
        for marker in KI_MARKER:
            if re.search(rf"(?<![a-z]){re.escape(marker)}(?![a-z])", text):
                befunde.append(f"KI-Vokabular im Erstkontakt: '{marker}'")
                break

    # 6. Rechtliche Pflichtbestandteile
    if cfg.get("compliance", "opt_out_pflicht", True) and not any(m in text for m in OPT_OUT_MARKER):
        befunde.append("kein Opt-out-Hinweis (UWG)")
    if cfg.get("compliance", "impressum_pflicht", True):
        # Erst am Komma trennen, dann normalisieren — normalisiere() ersetzt
        # Kommas durch Leerzeichen, danach waere nichts mehr zu trennen.
        roh_absender = cfg.get("business", "absender_adresse", "")
        kern = normalisiere(roh_absender.split(",")[0]) if roh_absender else ""
        if kern and kern not in text:
            befunde.append("keine Absenderidentifikation (UWG)")

    return {
        "verdikt": "pass" if not befunde else "fail",
        "befunde": befunde,
        "personalisierung": treffer,
        "woerter": woerter,
    }


def harte_sperre(lead: dict[str, Any], cfg: Config) -> str | None:
    """Gruende, die NIE uebergangen werden duerfen — auch nicht mit --force.

    Rechtliche Sperren und das Qualitaets-Gate. Wer diese umgeht, verschickt
    Spam an jemanden, der bereits Nein gesagt hat.
    """
    if ist_gesperrt(lead, lade_suppression(cfg)):
        return "auf Suppression-Liste"
    if kontaktdeckel_erreicht(lead, cfg):
        return "Kontaktdeckel erreicht"
    if (lead.get("check", {}) or {}).get("verdikt") != "pass":
        return "Checker-Gate nicht bestanden"
    return None


def darf_senden(lead: dict[str, Any], cfg: Config, jetzt: datetime | None = None) -> tuple[bool, str]:
    """Letzte Schranke direkt vor dem Versand: harte Sperren plus Sendefenster."""
    sperre = harte_sperre(lead, cfg)
    if sperre:
        return False, sperre
    fenster_ok, grund = im_sendefenster(cfg, jetzt)
    if not fenster_ok:
        return False, grund
    return True, "ok"
