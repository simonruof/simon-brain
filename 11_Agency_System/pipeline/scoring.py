"""Qualifikations-Score fuer rohe Scout-Funde.

Der Scout liefert Rohdaten, dieses Modul entscheidet deterministisch, ob
daraus ein Lead wird. Bewusst kein LLM: die Kriterien sind Zahlenvergleiche,
und ein Modell wuerde hier nur Varianz einbringen.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from .config import Config

# Harte Ausschlussgruende (unabhaengig vom Score)
KETTEN_MARKER = ("gmbh & co. kg", "ag filiale", "filiale", "franchise")


def _jahre_auf_maps(betrieb: dict[str, Any], heute: date) -> int | None:
    jahr = betrieb.get("erster_eintrag_jahr")
    if not isinstance(jahr, int):
        return None
    return max(0, heute.year - jahr)


def bewerte(betrieb: dict[str, Any], cfg: Config, heute: date | None = None) -> dict[str, Any]:
    """Score 0-100 plus nachvollziehbare Begruendung.

    Rueckgabe: {"score": int, "gruende": [str], "qualifiziert": bool,
                "ablehnungsgrund": str | None}
    """
    heute = heute or date.today()
    s = cfg.section("scout")
    g = cfg.section("scoring")

    score = 0
    gruende: list[str] = []

    website = (betrieb.get("website") or "").strip()
    website_jahr = betrieb.get("website_jahr")
    sterne = betrieb.get("sterne")
    bewertungen = betrieb.get("bewertungen")
    jahre = _jahre_auf_maps(betrieb, heute)

    # -- Lueckenkriterien: je groesser die Luecke, desto wertvoller der Lead
    if not website:
        score += g.get("gew_keine_website", 35)
        gruende.append("keine Website")
    elif isinstance(website_jahr, int) and website_jahr < s.get("website_veraltet_ab_jahr", 2016):
        score += g.get("gew_veraltete_website", 25)
        gruende.append(f"Website von {website_jahr}")

    if betrieb.get("mobile_optimiert") is False:
        score += g.get("gew_kein_mobile", 15)
        gruende.append("nicht mobiloptimiert")

    # -- Qualitaetskriterien: der Betrieb muss es wert sein, angeschrieben zu werden
    if isinstance(sterne, (int, float)) and sterne >= s.get("min_sterne", 4.0):
        score += g.get("gew_hohe_bewertung", 20)
        gruende.append(f"{sterne} Sterne")

    if isinstance(bewertungen, int) and bewertungen < s.get("max_bewertungen", 50):
        score += g.get("gew_wenig_bewertungen", 15)
        gruende.append(f"nur {bewertungen} Bewertungen")

    if jahre is not None and jahre >= s.get("min_jahre_auf_maps", 5):
        score += g.get("gew_etabliert", 15)
        gruende.append(f"{jahre} Jahre auf Maps")

    score = min(100, score)

    # -- harte Ausschluesse ------------------------------------------------
    ablehnung = _ablehnungsgrund(betrieb, cfg, sterne, bewertungen, jahre, website, website_jahr, s)

    qualifiziert = ablehnung is None and score >= s.get("min_score", 60)
    if not qualifiziert and ablehnung is None:
        ablehnung = f"Score {score} unter Minimum {s.get('min_score', 60)}"

    return {
        "score": score,
        "gruende": gruende,
        "qualifiziert": qualifiziert,
        "ablehnungsgrund": ablehnung,
    }


def _ablehnungsgrund(
    betrieb: dict[str, Any],
    cfg: Config,
    sterne: Any,
    bewertungen: Any,
    jahre: int | None,
    website: str,
    website_jahr: Any,
    s: dict[str, Any],
) -> str | None:
    name = (betrieb.get("name") or "").lower()
    if not name:
        return "kein Betriebsname"

    if any(marker in name for marker in KETTEN_MARKER):
        return "Kette/Filiale — kein Entscheider vor Ort"

    if cfg.get("compliance", "keine_privatpersonen", True) and not betrieb.get("adresse"):
        return "keine Geschaeftsadresse — B2B nicht belegbar"

    if isinstance(sterne, (int, float)) and sterne < s.get("min_sterne", 4.0):
        return f"Bewertung {sterne} unter {s.get('min_sterne', 4.0)}"

    if isinstance(bewertungen, int) and bewertungen >= s.get("max_bewertungen", 50):
        return f"{bewertungen} Bewertungen — laeuft bereits gut, kein Schmerz"

    if jahre is not None and jahre < s.get("min_jahre_auf_maps", 5):
        return f"erst {jahre} Jahre auf Maps — zu jung/instabil"

    # Moderne Website = keine Luecke = kein Aufhaenger
    if website and isinstance(website_jahr, int) and website_jahr >= s.get("website_veraltet_ab_jahr", 2016):
        if betrieb.get("mobile_optimiert") is not False:
            return "Website aktuell und mobiloptimiert — keine Luecke"

    nischen = cfg.get("scope", "aktive_nischen", [])
    if nischen and betrieb.get("nische") not in nischen:
        return f"Nische '{betrieb.get('nische')}' nicht aktiv"

    staedte = cfg.get("scope", "aktive_staedte", [])
    if staedte and betrieb.get("stadt") not in staedte:
        return f"Stadt '{betrieb.get('stadt')}' nicht aktiv"

    return None
