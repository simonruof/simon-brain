---
tags: [setup, anleitung]
---

# 🛠️ Simon Brain — Setup Anleitung

## Übersicht: Was du einmal tun musst

```
Simon_Brain/
├── Hauptrechner (Linux Mint Gersau)   ← Primärer Schreibort
├── Laptop                              ← Sekundärer Schreibort
├── GitHub (privat)                     ← Zentrale Quelle
└── Obsidian (beide Geräte)             ← Visualisierung
```

---

## Schritt 1 — GitHub Repo anlegen (5 Minuten)

1. Gehe zu github.com → **New Repository**
2. Name: `simon-brain`
3. **Privat** auswählen (wichtig!)
4. README: Nein (wir haben schon Dateien)
5. Repo erstellen → URL kopieren (z.B. `git@github.com:simonruof/simon-brain.git`)

### SSH Key für GitHub (falls noch nicht eingerichtet)
```bash
# Prüfen ob Key existiert
ls ~/.ssh/id_ed25519.pub

# Falls nicht: neuen Key erstellen
ssh-keygen -t ed25519 -C "simon.ruof@gmail.com"

# Public Key kopieren und bei GitHub hinzufügen
# github.com → Settings → SSH and GPG keys → New SSH key
cat ~/.ssh/id_ed25519.pub
```

---

## Schritt 2 — Hauptrechner einrichten (10 Minuten)

```bash
# 1. Simon_Brain Ordner auf deinen Computer verschieben
mv ~/Downloads/Simon_Brain ~/Simon_Brain
# oder direkt dorthin entpacken wo du ihn haben willst

# 2. Scripts ausführbar machen
cd ~/Simon_Brain
chmod +x setup_brain.sh sync_brain.sh update_project.sh claude_brain_hook.sh

# 3. Setup ausführen (einmalig)
./setup_brain.sh
# → Gibt deine GitHub URL ein wenn gefragt
```

---

## Schritt 3 — Obsidian einrichten (5 Minuten)

1. Obsidian öffnen → **Open folder as vault**
2. Ordner wählen: `~/Simon_Brain`
3. Obsidian fragt ob du Plugins vertrauen willst → **Trust and enable**
4. **Settings → Community Plugins → Browse** → suche `obsidian-git`
5. **obsidian-git** installieren + aktivieren
6. Die Konfiguration ist bereits fertig (auto-sync alle 5 Minuten)

### Obsidian Tipps
- `Strg+P` → Command Palette → "Obsidian Git: Pull" / "Push"
- Graph View zeigt alle Verlinkungen zwischen Projekten
- Öffne `00_INDEX.md` als Start-Dashboard

---

## Schritt 4 — Laptop einrichten (5 Minuten)

```bash
# Repository klonen
git clone git@github.com:simonruof/simon-brain.git ~/Simon_Brain

# Scripts ausführbar machen
cd ~/Simon_Brain
chmod +x setup_brain.sh sync_brain.sh update_project.sh claude_brain_hook.sh

# Obsidian: selber Vault-Ordner öffnen (~/Simon_Brain)
# obsidian-git Plugin installieren (selbe Schritte wie oben)
```

---

## Schritt 5 — Claude Code Integration (3 Minuten)

Wenn du Claude Code im `Simon_Brain` Ordner startest, liest es `CLAUDE.md` **automatisch**.

```bash
# Claude Code direkt im Brain starten
cd ~/Simon_Brain
claude
# → Claude liest sofort CLAUDE.md und kennt alle Projekte
```

### Optional: Brain-Hook in bashrc
```bash
# Füge dies in ~/.bashrc ein damit der Hook bei jedem Terminal gezeigt wird:
alias brain='cd ~/Simon_Brain && source ./claude_brain_hook.sh'
```

---

## Schritt 6 — Cowork (dieses Tool) verbinden

1. In Cowork: Ordner-Symbol in der Sidebar → `~/Simon_Brain` auswählen
2. Claude hat dann direkten Zugriff auf alle Brain-Dateien
3. Bei jeder neuen Session liest Claude `CLAUDE.md` → sofort Kontext

---

## Täglicher Workflow

### Morgens (30 Sekunden)
```bash
cd ~/Simon_Brain
./sync_brain.sh        # Pull neueste Änderungen vom anderen Gerät
```

### Etwas aktualisieren
```bash
./update_project.sh trading    # Trading-Notiz aktualisieren
./update_project.sh ministry   # Ministry-Notiz aktualisieren
# → Datei öffnet sich, nach Speichern direkt gepusht
```

### Abends / wenn du fertig bist
```bash
./sync_brain.sh        # Alles pushen
```

### Obsidian
Obsidian-git macht das automatisch alle 5 Minuten — du musst nichts tun.

---

## claude.ai → Brain Sync (manuell, wenn nötig)

Wenn du in claude.ai etwas Wichtiges erarbeitet hast:

1. Das Wichtige aus claude.ai kopieren
2. Passendes Projekt öffnen: `./update_project.sh [projekt]`
3. Infos einfügen unter "Aktueller Stand" oder "Schlüssel-Erkenntnisse"
4. Speichern → wird automatisch commited + gepusht

---

## Kurzübersicht Scripts

| Script | Verwendung |
|--------|-----------|
| `setup_brain.sh` | **Einmalig** — Git init + Remote konfigurieren |
| `sync_brain.sh` | Täglich — Pull + Push |
| `sync_brain.sh push` | Nur pushen |
| `sync_brain.sh pull` | Nur pullen |
| `sync_brain.sh status` | Git-Status anzeigen |
| `update_project.sh` | Projekt auswählen + bearbeiten + committen |
| `update_project.sh trading` | Trading direkt öffnen |
| `claude_brain_hook.sh` | Brain-Status anzeigen |

---

*Setup-Anleitung erstellt: 15. Juni 2026*
