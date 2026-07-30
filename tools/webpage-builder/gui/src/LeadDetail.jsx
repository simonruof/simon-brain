/**
 * Detailansicht eines Leads.
 *
 * Vier Reiter, die dem tatsaechlichen Ablauf vor dem Versand folgen:
 *
 *   Vergleich — sieht der Entwurf besser aus als das Bestehende? Wenn nein,
 *               gar nicht erst verschicken.
 *   Befunde   — was genau ist an der heutigen Seite schlecht? Das sind die
 *               Saetze, die im Gespraech verwendet werden.
 *   Texte     — der haeufigste Eingriff: ein Satz stimmt nicht ganz.
 *               Korrigieren und sofort neu rendern.
 *   Mail      — der fertige Entwurf zum Kopieren.
 */

import { useEffect, useState } from 'react';
import { api, scoreFarbe } from './api.js';

const REITER = [['vergleich', 'Vergleich'], ['befunde', 'Befunde'], ['texte', 'Texte'], ['mail', 'Mail']];

export default function LeadDetail({ slug, playbooks, zurueck, nachAenderung }) {
  const [p, setP] = useState(null);
  const [reiter, setReiter] = useState('vergleich');
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [cachePuffer, setCachePuffer] = useState(0); // erzwingt iframe-Neuladen

  const laden = () => api.lead(slug).then(setP).catch((e) => setFehler(e.message));
  useEffect(() => { setP(null); setFehler(null); laden(); }, [slug]);

  async function tun(fn) {
    setBeschaeftigt(true); setFehler(null);
    try { await fn(); await laden(); setCachePuffer((n) => n + 1); nachAenderung?.(); }
    catch (e) { setFehler(e.hint ? `${e.message} — ${e.hint}` : e.message); }
    setBeschaeftigt(false);
  }

  if (fehler && !p) return <div className="fehlerbox" style={{ margin: '1.4rem' }}>{fehler}</div>;
  if (!p) return <div className="leer">Wird geladen …</div>;

  const name = p.places?.name || p.scrape?.name || p.eingabe.name || p.slug;
  const vorher = p.auditVorher?.score;
  const nachher = p.auditNachher?.score;
  const fehlgeschlagen = Object.entries(p.stages ?? {}).filter(([, s]) => s.status === 'failed');

  return (
    <>
      <div className="detail__kopf">
        <button className="btn btn--klein" onClick={zurueck} style={{ marginBottom: '.7rem' }}>← Liste</button>
        <div className="detail__name">{name}</div>
        <div className="detail__meta">
          {[p.places?.ort || p.eingabe.ort, p.klassifikation?.label,
            p.places?.rating && `${p.places.rating}★ aus ${p.places.anzahlBewertungen}`,
            p.eingabe.url].filter(Boolean).join(' · ')}
        </div>

        <div className="detail__meta" style={{ marginTop: '.6rem', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <span className="pille" style={{ background: scoreFarbe(vorher) }}>{vorher ?? '–'}</span>
          <span>→</span>
          <span className="pille" style={{ background: scoreFarbe(nachher) }}>{nachher ?? '–'}</span>
          <span style={{ marginLeft: '.3rem' }}>KI-Sichtbarkeit</span>
        </div>

        <div className="detail__aktionen">
          <button className="btn btn--p" disabled={beschaeftigt}
                  onClick={() => tun(() => api.stage(slug, 'render'))}>Neu bauen</button>
          <button className="btn" disabled={beschaeftigt}
                  onClick={() => tun(() => api.stage(slug, 'copy'))}>Texte neu schreiben</button>
          <button className="btn" disabled={beschaeftigt}
                  onClick={() => tun(() => api.deploy(slug))}>Veröffentlichen</button>
          {p.render?.outDir && (
            <a className="btn" href={`/vorschau/${slug}/index.html`} target="_blank" rel="noreferrer">In neuem Tab</a>
          )}
          {p.deploy?.url && (
            <a className="btn" href={p.deploy.url} target="_blank" rel="noreferrer">Vorschau-Link</a>
          )}

          <select className="feld" style={{ width: 'auto' }} disabled={beschaeftigt}
                  value={p.klassifikation?.playbook ?? '_default'}
                  onChange={(e) => tun(() => api.playbookSetzen(slug, e.target.value))}>
            {playbooks.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      </div>

      <div className="reiter">
        {REITER.map(([id, t]) => (
          <button key={id} data-an={reiter === id} onClick={() => setReiter(id)}>{t}</button>
        ))}
      </div>

      <div className="tafel">
        {fehler && <div className="fehlerbox">{fehler}</div>}

        {fehlgeschlagen.length > 0 && (
          <div className="fehlerbox">
            {fehlgeschlagen.map(([id, s]) => (
              <div key={id}><strong>{id}</strong>: {s.fehler}{s.hinweis ? ` → ${s.hinweis}` : ''}</div>
            ))}
          </div>
        )}

        {(p.bilder?.platzhalter ?? []).length > 0 && (
          <div className="hinweis">
            Kein brauchbares Foto gefunden — im Hero steht ein Platzhalter. Vor dem Versand entweder
            Bildmaterial beim Betrieb anfragen oder bewusst so verschicken.
          </div>
        )}

        {reiter === 'vergleich' && <Vergleich p={p} slug={slug} cachePuffer={cachePuffer} />}
        {reiter === 'befunde' && <Befunde p={p} />}
        {reiter === 'texte' && <Texte p={p} slug={slug} beschaeftigt={beschaeftigt} tun={tun} />}
        {reiter === 'mail' && <Mail p={p} slug={slug} beschaeftigt={beschaeftigt} tun={tun} />}
      </div>
    </>
  );
}

/** Der entscheidende Blick: links was ist, rechts was sein koennte. */
function Vergleich({ p, slug, cachePuffer }) {
  return (
    <div className="split">
      <figure>
        <figcaption>
          <span>Heute</span>
          {p.eingabe.url && <a href={p.eingabe.url} target="_blank" rel="noreferrer">Original öffnen</a>}
        </figcaption>
        <div className="rahmen rahmen--scroll">
          {p.scrape
            ? <img src={`/bild/${slug}/vorher-voll.png`} alt="Bestehende Website"
                   onError={(e) => { e.target.src = `/bild/${slug}/vorher.png`; }} />
            : <div className="leer">
                {p.scrapeHinweis?.text ?? 'Keine erreichbare Website — der beste Ausgangspunkt für ein Gespräch.'}
              </div>}
        </div>
      </figure>

      <figure>
        <figcaption>
          <span>Entwurf</span>
          <span>{p.render?.theme} · {p.render?.sektionen?.length} Sektionen</span>
        </figcaption>
        <div className="rahmen">
          {p.render?.outDir
            ? <iframe key={cachePuffer} src={`/vorschau/${slug}/index.html?v=${cachePuffer}`} title="Prototyp" />
            : <div className="leer">Noch kein Prototyp gebaut.</div>}
        </div>
      </figure>
    </div>
  );
}

function Befunde({ p }) {
  const a = p.auditVorher;
  if (!a) return <div className="leer">Noch nicht analysiert.</div>;

  return (
    <>
      <div className="balken">
        {Object.entries(a.kategorien ?? {}).map(([id, k]) => (
          <div className="balken__zeile" key={id}>
            <span>{k.label}</span>
            <span className="balken__spur">
              <span className="balken__wert" style={{ width: `${(k.erreicht / k.gewicht) * 100}%` }} />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{k.erreicht}/{k.gewicht}</span>
          </div>
        ))}
      </div>

      {a.pagespeed && (
        <p style={{ color: 'var(--leise)', fontSize: '.84rem' }}>
          PageSpeed mobil (gemessen von Google): {a.pagespeed.mobilScore}/100
        </p>
      )}

      <ul className="befund">
        {(a.befunde ?? []).map((b, i) => (
          <li key={i}>
            <span className={b.erfuellt ? 'befund__ok' : 'befund__nein'}>{b.erfuellt ? '✓' : '✗'}</span>
            <span>
              {b.text}
              {!b.erfuellt && b.warum && <span className="befund__warum">{b.warum}</span>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Textkorrektur. Speichern rendert sofort neu — der Rundlauf muss kurz sein. */
function Texte({ p, slug, beschaeftigt, tun }) {
  const [entwurf, setEntwurf] = useState(null);
  useEffect(() => { setEntwurf(null); }, [slug]);

  const c = entwurf ?? p.copy ?? {};
  const aendern = (pfad, wert) => {
    const neu = structuredClone(entwurf ?? p.copy ?? {});
    if (pfad === 'heroTitel') neu.hero = { ...neu.hero, titel: wert };
    else if (pfad === 'heroLead') neu.hero = { ...neu.hero, lead: wert };
    else neu[pfad] = wert;
    setEntwurf(neu);
  };

  if (!p.copy) return <div className="leer">Noch keine Texte erzeugt.</div>;

  return (
    <>
      {p.copy._quelle === 'fallback' && (
        <div className="hinweis">
          Diese Texte stammen aus der bestehenden Seite und dem Playbook, nicht von Claude
          (kein ANTHROPIC_API_KEY hinterlegt). Sie sind korrekt, aber nicht auf den Betrieb zugeschnitten.
        </div>
      )}
      {(p.copy._verstoesse ?? []).length > 0 && (
        <div className="hinweis">
          Verbotene Werbefloskeln im Text: {p.copy._verstoesse.join(', ')} — vor dem Versand ersetzen.
        </div>
      )}

      <Feld label="Hauptüberschrift" wert={c.hero?.titel ?? ''} setzen={(v) => aendern('heroTitel', v)} />
      <Feld label="Einleitung" wert={c.hero?.lead ?? ''} setzen={(v) => aendern('heroLead', v)} lang />
      <Feld label="Seitentitel (Google)" wert={c.metaTitel ?? ''} setzen={(v) => aendern('metaTitel', v)} />
      <Feld label="Meta-Beschreibung" wert={c.metaBeschreibung ?? ''} setzen={(v) => aendern('metaBeschreibung', v)} lang />
      <Feld label="Über uns" wert={c.about ?? ''} setzen={(v) => aendern('about', v)} lang />

      <div className="copy-feld">
        <label>Leistungen</label>
        {(c.leistungen ?? []).map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.4rem', marginBottom: '.3rem' }}>
            <input className="feld" value={l.titel ?? ''} onChange={(e) => {
              const neu = structuredClone(entwurf ?? p.copy);
              neu.leistungen[i].titel = e.target.value;
              setEntwurf(neu);
            }} />
            <input className="feld" value={l.text ?? ''} onChange={(e) => {
              const neu = structuredClone(entwurf ?? p.copy);
              neu.leistungen[i].text = e.target.value;
              setEntwurf(neu);
            }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
        <button className="btn btn--p" disabled={beschaeftigt || !entwurf}
                onClick={() => tun(async () => { await api.copySpeichern(slug, entwurf); setEntwurf(null); })}>
          Speichern und neu bauen
        </button>
        <button className="btn" disabled={!entwurf} onClick={() => setEntwurf(null)}>Verwerfen</button>
      </div>
    </>
  );
}

function Feld({ label, wert, setzen, lang }) {
  return (
    <div className="copy-feld">
      <label>{label}</label>
      {lang
        ? <textarea className="feld" value={wert} onChange={(e) => setzen(e.target.value)} />
        : <input className="feld" value={wert} onChange={(e) => setzen(e.target.value)} />}
    </div>
  );
}

function Mail({ p, slug, beschaeftigt, tun }) {
  const o = p.outreach;
  if (!o) {
    return (
      <div className="leer">
        <p>Noch kein Entwurf erzeugt.</p>
        <button className="btn btn--p" disabled={beschaeftigt} onClick={() => tun(() => api.stage(slug, 'outreach'))}>
          Mail-Entwurf erzeugen
        </button>
      </div>
    );
  }

  return (
    <>
      {!p.deploy?.url && (
        <div className="hinweis">
          Noch nicht veröffentlicht — im Mailtext steht deshalb ein Platzhalter statt des Links.
          Erst veröffentlichen, dann den Entwurf neu erzeugen.
        </div>
      )}

      <div className="mail">
        <div className="mail__betreff">{o.betreff}</div>
        <div className="mail__text">{o.text}</div>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button className="btn btn--p" onClick={() => navigator.clipboard.writeText(`${o.betreff}\n\n${o.text}`)}>
          Betreff und Text kopieren
        </button>
        <a className="btn" href={`mailto:${o.empfaenger ?? ''}?subject=${encodeURIComponent(o.betreff)}&body=${encodeURIComponent(o.text)}`}>
          Im Mailprogramm öffnen
        </a>
        <button className="btn" disabled={beschaeftigt} onClick={() => tun(() => api.stage(slug, 'outreach'))}>
          Neu erzeugen
        </button>
      </div>

      {o.vergleichsbild && (
        <figure style={{ margin: '1.4rem 0 0' }}>
          <figcaption style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--leise)', fontWeight: 700, marginBottom: '.4rem' }}>
            Anhang: Vorher/Nachher
          </figcaption>
          <img src={`/bild/${slug}/vergleich.png`} alt="Vorher-Nachher-Vergleich"
               style={{ width: '100%', borderRadius: 'var(--r-l)', border: '1px solid var(--rand)' }} />
        </figure>
      )}

      <p style={{ color: 'var(--leise)', fontSize: '.82rem', marginTop: '1rem' }}>
        Es wird nichts automatisch versendet. Das Absenden bleibt bewusst eine menschliche Entscheidung.
      </p>
    </>
  );
}
