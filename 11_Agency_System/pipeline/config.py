"""Konfiguration laden und Pfade aufloesen.

Einziger Ort, an dem config.toml gelesen wird. Alle anderen Module bekommen
das fertige Config-Objekt hereingereicht, damit Tests eine eigene Config
unterschieben koennen.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Projektwurzel = 11_Agency_System/ (eine Ebene ueber pipeline/)
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config" / "config.toml"


@dataclass(frozen=True)
class Config:
    data: dict[str, Any]
    root: Path

    def section(self, name: str) -> dict[str, Any]:
        return self.data.get(name, {})

    def get(self, section: str, key: str, default: Any = None) -> Any:
        return self.data.get(section, {}).get(key, default)

    def path(self, relative: str) -> Path:
        """Pfad relativ zur Projektwurzel aufloesen."""
        return self.root / relative

    # -- haeufig gebrauchte Verzeichnisse ---------------------------------
    @property
    def leads_dir(self) -> Path:
        return self.root / "leads"

    @property
    def state_dir(self) -> Path:
        return self.root / "state"

    @property
    def registry_file(self) -> Path:
        return self.state_dir / "registry.json"

    @property
    def events_file(self) -> Path:
        return self.state_dir / "events.jsonl"


def load(path: Path | None = None, root: Path | None = None) -> Config:
    """Config laden.

    Die Projektwurzel wird aus dem Config-Pfad abgeleitet (config/config.toml
    liegt immer eine Ebene unter der Wurzel). Sonst wuerde `--config` zwar eine
    andere Konfiguration laden, Leads und State aber weiterhin ins echte
    Projektverzeichnis schreiben.
    """
    cfg_path = Path(path).resolve() if path else DEFAULT_CONFIG
    with cfg_path.open("rb") as fh:
        data = tomllib.load(fh)
    if root is not None:
        wurzel = Path(root)
    elif path is not None:
        wurzel = cfg_path.parent.parent
    else:
        wurzel = ROOT
    return Config(data=data, root=wurzel)
