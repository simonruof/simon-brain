/**
 * Cockpit.
 *
 * Zweck ist eine einzige Frage: Welche Prototypen schicke ich heute raus?
 *
 * Deshalb ist die Liste nach Score-Sprung sortiert (der groesste Sprung ist
 * das staerkste Verkaufsargument), und die Split-Ansicht zeigt Vorher und
 * Nachher nebeneinander — der Moment, in dem man selbst sieht, ob der Entwurf
 * ueberzeugt, bevor der Betrieb ihn sieht.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ereignisse, scoreFarbe } from './api.js';
import LeadDetail from './LeadDetail.jsx';

export default function App() {
  const [zustand, setZustand] = useState(null);
  const [gewaehlt, setGewaehlt] = useState(null);
  const [filter, setFilter] = useState('alle');
  const [strom, setStrom] = useState([]);
  const [stromOffen, setStromOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const stromEnde = useRef(null);

  const laden = () => api.state().then(setZustand).catch((e) => setFehler(e.message));

  useEffect(() => {
    laden();
    return ereignisse((ev) => {
      setStrom((s) => [...s.slice(-250), ev]);
      if (ev.typ === 'lead:done') laden();
    });
  }, []);

  useEffect(() => { stromEnde.current?.scrollIntoView({ block: 'end' }); }, [strom]);

  async function starten(fn) {
    setLaeuft(true); setFehler(null); setStromOffen(true);
    try { await fn(); } catch (e) { setFehler(e.hint ? `${e.message} — ${e.hint}` : e.message); }
    setLaeuft(false);
    laden();
  }

  const leads = useMemo(() => {
    const alle = zustand?.leads ?? [];
    const gefiltert = alle.filter((l) => {
      if (filter === 'alle') return true;
      if (filter === 'bereit') return l.versandbereit;
      if (filter === 'gesperrt') return l.faktenWarnungen > 0;
      if (filter === 'fehler') return l.status === 'failed';
      if (filter === 'online') return Boolean(l.previewUrl);
      return l.branche === filter;
    });
    // Groesster Sprung zuerst — das ist die Reihenfolge, in der versendet wird.
    return gefiltert.sort((a, b) =>
      ((b.scoreNachher ?? 0) - (b.scoreVorher ?? 0)) - ((a.scoreNachher ?? 0) - (a.scoreVorher ?? 0)));
  }, [zustand, filter]);

  const branchen = useMemo(
    () => [...new Set((zustand?.leads ?? []).map((l) => l.branche).filter(Boolean))],
    [zustand]);

  if (!zustand) return <div className="leer">Cockpit wird geladen …</div>;

  const f = zustand.faehigkeiten;
  const gesperrtGesamt = zustand.leads.filter((l) => l.faktenWarnungen > 0).length;

  return (
    <div className="app">
      <header className="kopf">
        <span className="kopf__titel">Prototyp-Fabrik</span>
        <span className="kopf__stat">
          {zustand.leads.length} Leads · {zustand.leads.filter((l) => l.versandbereit).length} versandbereit
          {gesperrtGesamt > 0 && <> · <strong style={{ color: 'var(--schlecht)' }}>{gesperrtGesamt} gesperrt</strong></>}
          {zustand.deploy.online > 0 && ` · ${zustand.deploy.online} online`}
          {zustand.deploy.abgelaufen > 0 && ` · ${zustand.deploy.abgelaufen} abgelaufen`}
        </span>
        <div className="kopf__rechts">
          {!f.copy && <span className="kopf__stat" title="Ohne ANTHROPIC_API_KEY werden Texte aus dem Bestand uebernommen">⚠ kein Claude-Key</span>}
          {!f.places && <span className="kopf__stat" title="Ohne GOOGLE_PLACES_API_KEY fehlen Bewertungen, Fotos und Oeffnungszeiten">⚠ kein Places-Key</span>}
          <button className="btn btn--klein" onClick={() => setStromOffen((o) => !o)}>
            {stromOffen ? 'Protokoll zu' : 'Protokoll'}
          </button>
        </div>
      </header>

      <div className={`inhalt ${gewaehlt ? 'zeigt-detail' : ''}`}>
        <div className="liste">
          <NeuerLead laeuft={laeuft} starten={starten} />

          {fehler && <div className="fehlerbox" style={{ margin: '1rem' }}>{fehler}</div>}

          <div className="filter">
            {[['alle', 'Alle'], ['bereit', 'Versandbereit'], ['gesperrt', 'Gesperrt'], ['online', 'Online'], ['fehler', 'Fehler']].map(([id, t]) => (
              <button key={id} className={`chip ${filter === id ? 'chip--an' : ''}`} onClick={() => setFilter(id)}>{t}</button>
            ))}
            {branchen.map((b) => (
              <button key={b} className={`chip ${filter === b ? 'chip--an' : ''}`} onClick={() => setFilter(b)}>{b}</button>
            ))}
          </div>

          {leads.length === 0 && <div className="leer">Keine Leads in dieser Auswahl.</div>}

          {leads.map((l) => {
            const sprung = (l.scoreNachher ?? 0) - (l.scoreVorher ?? 0);
            return (
              <div
                key={l.slug}
                className={`lead ${gewaehlt === l.slug ? 'lead--aktiv' : ''}`}
                onClick={() => setGewaehlt(l.slug)}
              >
                <div>
                  <div className="lead__name">{l.name}</div>
                  <div className="lead__meta">
                    {[l.ort, l.branche, l.bewertung && `${l.bewertung}★`,
                      l.rang && `Platz ${l.rang.platz}/${l.rang.von}`, l.status]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="lead__scores">
                  {l.faktenWarnungen > 0 && (
                    <span className="sperre" title={`${l.faktenWarnungen} unbelegte Behauptung(en) im Text`}>
                      gesperrt
                    </span>
                  )}
                  <span className="pille" style={{ background: scoreFarbe(l.scoreVorher) }}>{l.scoreVorher ?? '–'}</span>
                  <span className="pfeil">→</span>
                  <span className="pille" style={{ background: scoreFarbe(l.scoreNachher) }}>{l.scoreNachher ?? '–'}</span>
                  {sprung > 0 && <span style={{ color: 'var(--gut)', fontWeight: 700, fontSize: '.78rem' }}>+{sprung}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="detail">
          {gewaehlt
            ? <LeadDetail
                slug={gewaehlt}
                playbooks={zustand.playbooks}
                zurueck={() => setGewaehlt(null)}
                nachAenderung={laden}
              />
            : <div className="leer">Lead auswaehlen, um Vorher und Nachher zu vergleichen.</div>}
        </div>
      </div>

      {stromOffen && (
        <div className="strom">
          <button className="strom__zu" onClick={() => setStromOffen(false)}>schliessen</button>
          {strom.length === 0 && <div style={{ opacity: .6 }}>Noch keine Ereignisse.</div>}
          {strom.map((e, i) => (
            <div key={i} className="strom__zeile">
              <span style={{ opacity: .5 }}>{new Date(e.ts).toLocaleTimeString('de-CH')}</span>
              <span className={
                e.typ === 'stage:ok' ? 'strom__ok'
                : e.typ === 'stage:fail' ? 'strom__fail'
                : e.typ === 'warn' ? 'strom__warn' : ''}>
                {[e.lead, e.stage, e.text, e.fehler].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
          <div ref={stromEnde} />
        </div>
      )}
    </div>
  );
}

/** Eingabe fuer einen einzelnen Lead oder einen ganzen Batch. */
function NeuerLead({ laeuft, starten }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [ort, setOrt] = useState('');
  const [csv, setCsv] = useState('');

  return (
    <div className="neu">
      <div className="neu__reihe">
        <input className="feld" placeholder="Website des Betriebs" value={url}
               onChange={(e) => setUrl(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && url && starten(() => api.build({ url, name, ort }))} />
        <button className="btn btn--p" disabled={laeuft || (!url && !name)}
                onClick={() => starten(() => api.build({ url, name, ort }))}>
          {laeuft ? 'läuft …' : 'Prototyp bauen'}
        </button>
      </div>
      <div className="neu__klein">
        <input className="feld" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="feld" placeholder="Ort (optional)" value={ort} onChange={(e) => setOrt(e.target.value)} />
      </div>
      <div className="neu__reihe">
        <input className="feld" placeholder="Pfad zur CSV für einen Batch-Lauf" value={csv}
               onChange={(e) => setCsv(e.target.value)} />
        <button className="btn" disabled={laeuft || !csv} onClick={() => starten(() => api.batch(csv))}>
          Batch starten
        </button>
      </div>
    </div>
  );
}
