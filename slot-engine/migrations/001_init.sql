-- 001_init.sql — Grundschema der Slot Engine
--
-- Konventionen:
--   * Alle Zeitpunkte sind INTEGER (Epoch-Millisekunden, UTC).
--   * Alle Intervalle sind halboffen: [start_ts, end_ts) — nahtloses Anschliessen ist erlaubt.
--   * weekday folgt SQLite: 0=Sonntag … 6=Samstag (strftime('%w')).
--     Luxon zaehlt 1=Montag … 7=Sonntag — die Umrechnung passiert an genau einer Stelle
--     in src/zeit.js (wochentagAusDateTime).
--   * Wanduhrzeiten ('HH:MM') werden immer zusammen mit settings.zeitzone interpretiert.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Konfiguration
-- ---------------------------------------------------------------------------

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Stammdaten
-- ---------------------------------------------------------------------------

CREATE TABLE resources (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  aktiv INTEGER NOT NULL DEFAULT 1 CHECK (aktiv IN (0, 1))
);

-- Leistungskatalog.
--
-- Eine Leistung besteht aus bis zu vier aufeinanderfolgenden Phasen:
--   [aktiv_vor_min] [einwirk_min] [aktiv_nach_min] [puffer_min]
-- Blockierend fuer die Ressource sind aktiv_vor, aktiv_nach und puffer.
-- Waehrend einwirk_min ist die Ressource anwesend, aber frei fuer andere Arbeit —
-- genau dort entsteht die Parallelbuchung.
--
-- WICHTIG: services ist nur die Vorlage. Sobald ein Termin existiert, sind seine
-- Segmente in busy_segments die Wahrheit. Eine spaetere Katalogaenderung verschiebt
-- bestehende Termine nicht.
CREATE TABLE services (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  aktiv_vor_min  INTEGER NOT NULL CHECK (aktiv_vor_min > 0),
  einwirk_min    INTEGER NOT NULL DEFAULT 0 CHECK (einwirk_min >= 0),
  aktiv_nach_min INTEGER NOT NULL DEFAULT 0 CHECK (aktiv_nach_min >= 0),
  puffer_min     INTEGER NOT NULL DEFAULT 0 CHECK (puffer_min >= 0),
  preis_cent     INTEGER NOT NULL DEFAULT 0 CHECK (preis_cent >= 0),
  -- Optionaler Override des Mindestvorlaufs. NULL = settings.mindestvorlauf_min.
  vorlauf_min    INTEGER CHECK (vorlauf_min IS NULL OR vorlauf_min >= 0),
  aktiv          INTEGER NOT NULL DEFAULT 1 CHECK (aktiv IN (0, 1)),
  -- Eine Einwirkphase ohne anschliessende aktive Phase ergibt fachlich keinen Sinn.
  CHECK (einwirk_min = 0 OR aktiv_nach_min > 0)
);

CREATE TABLE resource_services (
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, service_id)
);

-- Oeffnungszeiten. Mehrere Zeilen pro Wochentag ergeben mehrere Intervalle —
-- so wird die Mittagspause abgebildet. resource_id NULL = gilt fuer alle Ressourcen.
CREATE TABLE business_hours (
  id          INTEGER PRIMARY KEY,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  von_zeit    TEXT NOT NULL CHECK (von_zeit LIKE '__:__'),
  bis_zeit    TEXT NOT NULL CHECK (bis_zeit LIKE '__:__'),
  CHECK (von_zeit < bis_zeit)
);

CREATE INDEX idx_business_hours_weekday ON business_hours (weekday, resource_id);

-- ---------------------------------------------------------------------------
-- Sperrzeiten
-- ---------------------------------------------------------------------------

-- art = 'abwesenheit'   → Ressource ist weg. Blockiert den GESAMTEN Termin-Span,
--                         also auch die Einwirkzeit (jemand muss im Laden sein).
-- art = 'nicht_stoeren' → Ressource ist da, aber nicht am Kunden verfuegbar. Blockiert
--                         nur die aktiven Phasen; eine Einwirkzeit darf drueberlaufen.
CREATE TABLE blackouts (
  id          INTEGER PRIMARY KEY,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  start_ts    INTEGER NOT NULL,
  end_ts      INTEGER NOT NULL,
  grund       TEXT,
  art         TEXT NOT NULL DEFAULT 'abwesenheit'
              CHECK (art IN ('abwesenheit', 'nicht_stoeren')),
  quelle      TEXT NOT NULL DEFAULT 'manuell'
              CHECK (quelle IN ('manuell', 'feiertag')),
  CHECK (end_ts > start_ts)
);

CREATE INDEX idx_blackouts_zeit ON blackouts (start_ts, end_ts);

-- ---------------------------------------------------------------------------
-- Buchungen
-- ---------------------------------------------------------------------------

-- start_ts .. end_ts ist der GESAMTSPAN inklusive Einwirkzeit und Puffer —
-- also die Zeit, die der Kunde im Laden ist. Fuer die Kapazitaetspruefung
-- (max_parallel_kunden) ist genau dieser Span massgeblich.
CREATE TABLE appointments (
  id          INTEGER PRIMARY KEY,
  uid         TEXT NOT NULL UNIQUE,          -- stabile ID fuer spaeteren ICS-/Kalender-Export
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  service_id  INTEGER NOT NULL REFERENCES services(id),
  kunde       TEXT,
  kunde_ref   INTEGER,                       -- Andockpunkt fuer eine spaetere customers-Tabelle
  start_ts    INTEGER NOT NULL,
  end_ts      INTEGER NOT NULL,
  preis_cent  INTEGER NOT NULL DEFAULT 0,    -- eingefroren zum Buchungszeitpunkt
  status      TEXT NOT NULL DEFAULT 'gebucht'
              CHECK (status IN ('gebucht', 'storniert')),
  created_at  INTEGER NOT NULL,
  CHECK (end_ts > start_ts)
);

CREATE INDEX idx_appointments_ressource_zeit
  ON appointments (resource_id, status, start_ts, end_ts);

-- Weichreservierung. Laeuft nach settings.hold_ttl_min ab.
-- Abgelaufene Holds werden NICHT vom Lesepfad geloescht (verfuegbareSlots bleibt
-- schreibfrei), sondern beim naechsten Schreibvorgang in derselben Transaktion
-- aufgeraeumt (raeumeAbgelaufeneHolds) und beim Lesen ueber expires_at ignoriert.
CREATE TABLE holds (
  id          INTEGER PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  service_id  INTEGER NOT NULL REFERENCES services(id),
  start_ts    INTEGER NOT NULL,
  end_ts      INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'aktiv'
              CHECK (status IN ('aktiv', 'eingeloest', 'storniert', 'abgelaufen')),
  created_at  INTEGER NOT NULL,
  CHECK (end_ts > start_ts)
);

CREATE INDEX idx_holds_ressource_zeit ON holds (resource_id, status, start_ts, end_ts);

-- ---------------------------------------------------------------------------
-- Belegungssegmente — der Kern der Kollisionspruefung
-- ---------------------------------------------------------------------------

-- Enthaelt AUSSCHLIESSLICH die blockierenden Phasen (aktiv + puffer).
-- Die Einwirkzeit erzeugt bewusst KEIN Segment. Dadurch faellt die Parallelbelegung
-- ohne jeden Sonderfall aus der normalen Overlap-Pruefung heraus.
--
-- INVARIANTE: Diese Tabelle enthaelt nur Segmente, die aktuell wirklich blockieren.
-- Wird ein Termin storniert, ein Hold storniert oder ein Hold abgeraeumt, verschwinden
-- seine Segmente. Genau deshalb kann der Overlap-Trigger unten zeitunabhaengig und
-- bedingungslos sein — er braucht weder eine Uhr noch Kenntnis von Status-Spalten.
CREATE TABLE busy_segments (
  id          INTEGER PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  start_ts    INTEGER NOT NULL,
  end_ts      INTEGER NOT NULL,
  art         TEXT NOT NULL CHECK (art IN ('aktiv', 'puffer')),
  quelle      TEXT NOT NULL CHECK (quelle IN ('termin', 'hold')),
  ref_id      INTEGER NOT NULL,
  CHECK (end_ts > start_ts)
);

CREATE INDEX idx_busy_segments_ressource_zeit
  ON busy_segments (resource_id, start_ts, end_ts);

CREATE INDEX idx_busy_segments_quelle ON busy_segments (quelle, ref_id);

-- Letzte Verteidigungslinie auf DB-Ebene: zwei blockierende Segmente derselben
-- Ressource duerfen sich nie ueberlappen — unabhaengig davon, was der Anwendungscode
-- tut oder ob jemand von Hand SQL absetzt. Ein UNIQUE-Index auf (resource_id, start_ts)
-- koennte das nicht leisten, weil er nur exakt gleiche Startzeiten faengt.
CREATE TRIGGER trg_busy_segments_kein_overlap_insert
BEFORE INSERT ON busy_segments
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM busy_segments b
  WHERE b.resource_id = NEW.resource_id
    AND b.start_ts < NEW.end_ts
    AND NEW.start_ts < b.end_ts
)
BEGIN
  SELECT RAISE(ABORT, 'busy_segments overlap');
END;

CREATE TRIGGER trg_busy_segments_kein_overlap_update
BEFORE UPDATE OF resource_id, start_ts, end_ts ON busy_segments
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM busy_segments b
  WHERE b.id <> NEW.id
    AND b.resource_id = NEW.resource_id
    AND b.start_ts < NEW.end_ts
    AND NEW.start_ts < b.end_ts
)
BEGIN
  SELECT RAISE(ABORT, 'busy_segments overlap');
END;

-- View: Segmente mit dem Status ihres Eigentuemers. Bewusst OHNE Zeitfilter —
-- die Ablaufpruefung eines Holds braucht das injizierte 'jetzt' und passiert
-- deshalb im Lesepfad als gebundener Parameter, nicht in einer View.
CREATE VIEW segmente_mit_eigentuemer AS
SELECT b.id, b.resource_id, b.start_ts, b.end_ts, b.art, b.quelle, b.ref_id,
       a.status AS eigentuemer_status, NULL AS expires_at
FROM busy_segments b
JOIN appointments a ON b.quelle = 'termin' AND a.id = b.ref_id
UNION ALL
SELECT b.id, b.resource_id, b.start_ts, b.end_ts, b.art, b.quelle, b.ref_id,
       h.status AS eigentuemer_status, h.expires_at
FROM busy_segments b
JOIN holds h ON b.quelle = 'hold' AND h.id = b.ref_id;
