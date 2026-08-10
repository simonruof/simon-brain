-- 001_stammdaten.sql — Seed für den Friseurbetrieb (Baden-Württemberg)
--
-- Idempotent formuliert: ein zweiter Lauf ändert nichts.
-- Feiertags-Blackouts kommen nicht von hier, sondern berechnet aus src/feiertage.js
-- (bewegliche Feste lassen sich in SQL nicht sinnvoll ableiten).

-- ---------------------------------------------------------------------------
-- Konfiguration
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('zeitzone',            'Europe/Berlin'),
  ('land',                'DE'),
  ('region',              'DE-BW'),
  ('waehrung',            'EUR'),
  ('mwst_satz',           '19'),
  ('slot_raster_min',     '15'),
  ('mindestvorlauf_min',  '60'),
  ('horizont_wochen',     '12'),
  ('hold_ttl_min',        '15'),
  -- Wie viele Kundinnen und Kunden gleichzeitig im Laden sein dürfen (Stühle/Waschplätze).
  -- Begrenzt die Parallelbuchung während einer Einwirkzeit.
  ('max_parallel_kunden', '2'),
  -- Umschaltzeit, die beim Einspringen in eine fremde Einwirkzeit zusätzlich
  -- vor und nach der eingeschobenen Leistung frei bleiben muss.
  ('wechsel_puffer_min',  '5');

-- ---------------------------------------------------------------------------
-- Ressourcen
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO resources (name, aktiv) VALUES ('Soner', 1);

-- ---------------------------------------------------------------------------
-- Leistungskatalog
--
-- Spalten: aktiv_vor | einwirk | aktiv_nach | puffer  (jeweils Minuten)
-- Während der Einwirkzeit ist die Ressource frei für andere Kundschaft.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO services
  (code, name, aktiv_vor_min, einwirk_min, aktiv_nach_min, puffer_min, preis_cent, vorlauf_min)
VALUES
  ('herrenschnitt', 'Herrenschnitt',              30,  0,  0,  5, 2800, NULL),
  ('bart',          'Bartpflege',                 20,  0,  0,  5, 1800, NULL),
  ('kinderschnitt', 'Kinderhaarschnitt',          20,  0,  0,  5, 1800, NULL),
  ('wasch_schnitt', 'Waschen, Schneiden, Föhnen', 45,  0,  0, 10, 4200, NULL),
  ('komplett',      'Komplettservice',            60,  0,  0, 10, 5500, NULL),
  -- Färben und Strähnen brauchen mehr Vorlauf: Farbe anrühren, Beratung, Anfahrt.
  ('faerben',       'Färben',                     40, 30, 20, 10, 7500,  120),
  ('straehnen',     'Strähnen',                   30, 45, 30, 10, 9500,  120);

-- Soner kann alles.
INSERT OR IGNORE INTO resource_services (resource_id, service_id)
SELECT r.id, s.id FROM resources r CROSS JOIN services s WHERE r.name = 'Soner';

-- ---------------------------------------------------------------------------
-- Öffnungszeiten (weekday: 0=So, 1=Mo, … 6=Sa)
--
-- Montag Ruhetag, Sonntag geschlossen (§ 9 ArbZG).
-- Di–Fr mit Mittagspause 12:30–13:15 — das sind zwei getrennte Intervalle,
-- eine Leistung muss vollständig in eines davon passen.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO business_hours (id, resource_id, weekday, von_zeit, bis_zeit) VALUES
  (1, NULL, 2, '09:00', '12:30'),
  (2, NULL, 2, '13:15', '18:30'),
  (3, NULL, 3, '09:00', '12:30'),
  (4, NULL, 3, '13:15', '18:30'),
  (5, NULL, 4, '09:00', '12:30'),
  (6, NULL, 4, '13:15', '18:30'),
  (7, NULL, 5, '09:00', '12:30'),
  (8, NULL, 5, '13:15', '18:30'),
  (9, NULL, 6, '08:00', '14:00');
