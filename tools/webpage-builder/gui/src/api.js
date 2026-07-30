/**
 * Zugriff auf den Cockpit-Server.
 *
 * Duenn gehalten: Die Oberflaeche trifft keine fachlichen Entscheidungen,
 * sie zeigt an und loest aus. Alles Inhaltliche steckt im Kern.
 */

async function anfrage(pfad, optionen = {}) {
  const res = await fetch(pfad, {
    ...optionen,
    headers: optionen.body ? { 'Content-Type': 'application/json' } : undefined,
    body: optionen.body ? JSON.stringify(optionen.body) : undefined,
  });
  const daten = await res.json().catch(() => ({}));
  if (daten?.error) {
    const e = new Error(daten.error.message);
    e.hint = daten.error.hint;
    e.code = daten.error.code;
    throw e;
  }
  if (!res.ok) throw new Error(`Serverfehler ${res.status}`);
  return daten;
}

export const api = {
  state: () => anfrage('/api/state'),
  lead: (slug) => anfrage(`/api/lead/${slug}`),

  scan: (b) => anfrage('/api/scan', { method: 'POST', body: b }),
  build: (b) => anfrage('/api/build', { method: 'POST', body: b }),
  batch: (csv, concurrency = 3) => anfrage('/api/batch', { method: 'POST', body: { csv, concurrency } }),
  discover: (b) => anfrage('/api/discover', { method: 'POST', body: b }),
  stage: (slug, stage) => anfrage('/api/stage', { method: 'POST', body: { slug, stage } }),
  deploy: (slug) => anfrage('/api/deploy', { method: 'POST', body: { slug } }),

  copySpeichern: (slug, copy) => anfrage(`/api/lead/${slug}/copy`, { method: 'PATCH', body: { copy } }),
  playbookSetzen: (slug, playbook) => anfrage(`/api/lead/${slug}/playbook`, { method: 'POST', body: { playbook } }),
};

/** Ereignisstrom des Servers abonnieren. Liefert eine Abmeldefunktion. */
export function ereignisse(beiEreignis) {
  const quelle = new EventSource('/api/events');
  quelle.onmessage = (e) => {
    try { beiEreignis(JSON.parse(e.data)); } catch { /* Puls-Zeilen ignorieren */ }
  };
  return () => quelle.close();
}

export const scoreFarbe = (n) =>
  n == null ? 'var(--leise)' : n >= 75 ? 'var(--gut)' : n >= 45 ? 'var(--mittel)' : 'var(--schlecht)';
