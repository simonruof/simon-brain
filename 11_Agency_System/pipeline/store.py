"""Lead-Store: dateibasierte Queue mit Zustandsautomat.

Warum Dateien statt DB: die Agents sind Claude-Subagents. Die koennen Dateien
lesen und schreiben, ohne dass eine Datenbank laeuft. Jeder Lead ist eine
JSON-Datei, jeder Zustandswechsel landet zusaetzlich in state/events.jsonl —
das ist die Grundlage fuer die KPI-Auswertung und den Audit-Trail.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

from .config import Config

# Zustandsautomat. Erlaubte Uebergaenge, alles andere wirft.
STAGES = [
    "discovered",   # Scout-Rohfund
    "qualified",    # Score bestanden
    "diagnosed",    # Diagnose + Nachricht geschrieben
    "built",        # Mockup gebaut (nur Top-Leads)
    "filmed",       # Video gerendert
    "checked",      # Checker-Gate durchlaufen
    "pitched",      # Nachricht raus
    "replied",      # Antwort da
    "booked",       # Termin steht
    "won",
    "lost",
    "rejected",     # nicht qualifiziert
    "blocked",      # Compliance-Stopp / Opt-out
]

UEBERGAENGE: dict[str, set[str]] = {
    "discovered": {"qualified", "rejected", "blocked"},
    "qualified": {"diagnosed", "rejected", "blocked"},
    "diagnosed": {"built", "checked", "rejected", "blocked"},
    "built": {"filmed", "checked", "blocked"},
    "filmed": {"checked", "blocked"},
    # zurueck auf diagnosed, wenn der Checker die Nachricht ablehnt
    "checked": {"pitched", "diagnosed", "blocked"},
    "pitched": {"replied", "pitched", "lost", "blocked"},
    "replied": {"booked", "lost", "blocked"},
    "booked": {"won", "lost", "blocked"},
    "won": set(),
    "lost": set(),
    "rejected": set(),
    "blocked": set(),
}


class StageError(ValueError):
    """Unerlaubter Zustandswechsel."""


# ── IDs & Dedupe ─────────────────────────────────────────────────────────
def slug(text: str) -> str:
    text = text.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:40]


def fingerprint(betrieb: dict[str, Any]) -> str:
    """Stabiler Fingerabdruck fuer Dedupe ueber Tage hinweg.

    Name + Ort, weil Telefon und Website sich aendern, der Betrieb aber
    derselbe bleibt.
    """
    roh = f"{slug(betrieb.get('name', ''))}|{slug(betrieb.get('stadt', ''))}"
    return hashlib.sha256(roh.encode()).hexdigest()[:12]


def lead_id(betrieb: dict[str, Any]) -> str:
    teile = [slug(betrieb.get("nische", "x")), slug(betrieb.get("stadt", "x")), slug(betrieb.get("name", "x"))]
    return "-".join(t for t in teile if t) + "-" + fingerprint(betrieb)


# ── Store ────────────────────────────────────────────────────────────────
class LeadStore:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.leads_dir = cfg.leads_dir
        self.state_dir = cfg.state_dir

    def init(self) -> None:
        self.leads_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        if not self.cfg.registry_file.exists():
            self._schreibe_json(self.cfg.registry_file, {})
        suppression = self.cfg.path(self.cfg.get("compliance", "suppression_datei", "state/suppression.txt"))
        if not suppression.exists():
            suppression.parent.mkdir(parents=True, exist_ok=True)
            suppression.write_text(
                "# Eine Sperre pro Zeile: E-Mail, Domain, Telefonnummer oder Betriebsname.\n"
                "# Jedes Opt-out landet hier — automatisch via `agency reply --typ optout`.\n",
                encoding="utf-8",
            )

    # -- IO-Helfer --------------------------------------------------------
    @staticmethod
    def _schreibe_json(pfad: Path, daten: Any) -> None:
        pfad.parent.mkdir(parents=True, exist_ok=True)
        tmp = pfad.with_suffix(pfad.suffix + ".tmp")
        tmp.write_text(json.dumps(daten, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        tmp.replace(pfad)  # atomar, damit ein Abbruch keine halbe Datei hinterlaesst

    @staticmethod
    def _lies_json(pfad: Path) -> Any:
        return json.loads(pfad.read_text(encoding="utf-8"))

    def registry(self) -> dict[str, str]:
        if not self.cfg.registry_file.exists():
            return {}
        return self._lies_json(self.cfg.registry_file)

    def _registriere(self, fp: str, lid: str) -> None:
        reg = self.registry()
        reg[fp] = lid
        self._schreibe_json(self.cfg.registry_file, reg)

    def event(self, lid: str, typ: str, **felder: Any) -> None:
        zeile = {"ts": datetime.now().isoformat(timespec="seconds"), "lead": lid, "typ": typ, **felder}
        self.cfg.events_file.parent.mkdir(parents=True, exist_ok=True)
        with self.cfg.events_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(zeile, ensure_ascii=False) + "\n")

    def events(self) -> Iterator[dict[str, Any]]:
        if not self.cfg.events_file.exists():
            return
        for zeile in self.cfg.events_file.read_text(encoding="utf-8").splitlines():
            if zeile.strip():
                yield json.loads(zeile)

    # -- Leads ------------------------------------------------------------
    def pfad(self, lid: str) -> Path | None:
        treffer = sorted(self.leads_dir.glob(f"*/{lid}.json"))
        return treffer[0] if treffer else None

    def lade(self, lid: str) -> dict[str, Any]:
        pfad = self.pfad(lid)
        if not pfad:
            raise FileNotFoundError(f"Lead '{lid}' nicht gefunden")
        return self._lies_json(pfad)

    def speichere(self, lead: dict[str, Any]) -> Path:
        pfad = self.pfad(lead["id"]) or (self.leads_dir / lead["erfasst_am"] / f"{lead['id']}.json")
        self._schreibe_json(pfad, lead)
        return pfad

    def alle(self, stage: str | None = None, tag: str | None = None) -> list[dict[str, Any]]:
        muster = f"{tag}/*.json" if tag else "*/*.json"
        leads = [self._lies_json(p) for p in sorted(self.leads_dir.glob(muster))]
        if stage:
            leads = [l for l in leads if l.get("stage") == stage]
        return leads

    def erzeuge(self, betrieb: dict[str, Any], heute: date | None = None) -> tuple[dict[str, Any] | None, str]:
        """Neuen Lead anlegen. Gibt (lead, status) zurueck.

        status ist "neu" oder "duplikat" — Duplikate werden still verworfen,
        damit ein Betrieb nie zweimal angeschrieben wird.
        """
        heute = heute or date.today()
        fp = fingerprint(betrieb)
        if fp in self.registry():
            return None, "duplikat"

        lid = lead_id(betrieb)
        lead = {
            "id": lid,
            "fingerprint": fp,
            "erfasst_am": heute.isoformat(),
            "stage": "discovered",
            "betrieb": betrieb,
            "score": None,
            "score_gruende": [],
            "diagnose": {},
            "mockup": {},
            "video": {},
            "check": {},
            "outreach": {"kanal": None, "gesendet_am": None, "kontakte": 0, "follow_ups": 0,
                         "antwort": None, "antwort_typ": None},
            "deal": {"wert_chf": None, "status": None},
            "eskalation": None,
            "history": [],
        }
        self._registriere(fp, lid)
        self.speichere(lead)
        self.event(lid, "discovered", betrieb=betrieb.get("name"))
        return lead, "neu"

    def setze_stage(self, lead: dict[str, Any], neu: str, by: str = "system", note: str = "") -> dict[str, Any]:
        alt = lead.get("stage", "discovered")
        if neu not in STAGES:
            raise StageError(f"Unbekannte Stage '{neu}'")
        if neu != alt and neu not in UEBERGAENGE.get(alt, set()):
            raise StageError(f"Uebergang '{alt}' -> '{neu}' ist nicht erlaubt")
        lead["stage"] = neu
        lead.setdefault("history", []).append({
            "ts": datetime.now().isoformat(timespec="seconds"),
            "von": alt, "nach": neu, "by": by, "note": note,
        })
        self.speichere(lead)
        self.event(lead["id"], neu, by=by, note=note)
        return lead

    def sperre(self, lid: str, grund: str) -> dict[str, Any]:
        """Compliance-Stopp. Immer erlaubt, aus jeder Stage heraus."""
        lead = self.lade(lid)
        alt = lead.get("stage")
        lead["stage"] = "blocked"
        lead.setdefault("history", []).append({
            "ts": datetime.now().isoformat(timespec="seconds"),
            "von": alt, "nach": "blocked", "by": "compliance", "note": grund,
        })
        self.speichere(lead)
        self.event(lid, "blocked", note=grund)
        return lead
