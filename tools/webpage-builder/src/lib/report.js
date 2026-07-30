/**
 * Uebersichtsseite out/_report.html.
 *
 * Nach einem Batch-Lauf mit fuenfzig Leads ist die Frage nicht "hat es
 * funktioniert", sondern "welche fuenf schicke ich heute raus". Genau dafuer
 * ist diese Seite: sortiert nach Score-Sprung, weil der groesste Sprung das
 * staerkste Verkaufsargument hergibt.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { zusammenfassung } from '../core/profile.js';
import { esc } from './guard.js';

/** Screenshots als Data-URI einbetten, damit die Datei allein verschickbar ist. */
function bildEinbetten(pfad, maxBytes = 400_000) {
  try {
    if (!existsSync(pfad)) return null;
    const buf = readFileSync(pfad);
    if (buf.length > maxBytes) return null;
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

export function reportSchreiben(profile) {
  mkdirSync(config.outDir, { recursive: true });

  const zeilen = profile.map((p) => {
    const z = zusammenfassung(p);
    const sprung = (z.scoreNachher ?? 0) - (z.scoreVorher ?? 0);
    return {
      ...z, sprung, profil: p,
      vorherBild: bildEinbetten(join(config.dataDir, p.slug, 'vorher.png')),
      nachherBild: bildEinbetten(join(config.dataDir, p.slug, 'nachher.png')),
      luecken: p.auditVorher?.luecken ?? [],
      fehler: Object.entries(p.stages ?? {})
        .filter(([, s]) => s.status === 'failed')
        .map(([id, s]) => `${id}: ${s.fehler}`),
      platzhalter: (p.bilder?.platzhalter ?? []).length > 0,
    };
  }).sort((a, b) => b.sprung - a.sprung);

  const fertig = zeilen.filter((z) => z.status !== 'failed' && z.scoreNachher != null);
  const mittelVorher = fertig.length ? Math.round(fertig.reduce((a, z) => a + (z.scoreVorher ?? 0), 0) / fertig.length) : 0;
  const mittelNachher = fertig.length ? Math.round(fertig.reduce((a, z) => a + (z.scoreNachher ?? 0), 0) / fertig.length) : 0;

  const html = `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Prototyp-Fabrik — Uebersicht</title>
<style>
  :root {
    --bg:#F7F8FA; --flaeche:#fff; --text:#141A21; --leise:#68737F; --rand:#E3E8ED;
    --gut:#0E8A5F; --mittel:#C98A00; --schlecht:#C8102E; --akzent:#15607A;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0E141A; --flaeche:#161E26; --text:#E9EFF4; --leise:#93A2B0; --rand:#26313C;
            --gut:#3FCB96; --mittel:#F0B429; --schlecht:#FF5C70; --akzent:#4FB3D4; }
  }
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
       font:15px/1.6 "Inter","Helvetica Neue","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{width:min(100% - 2.5rem,1280px);margin-inline:auto;padding-block:2.5rem 5rem}
  h1{font-size:1.9rem;margin:0 0 .3rem;letter-spacing:-.02em}
  .unter{color:var(--leise);margin:0 0 2rem}
  .kacheln{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1rem;margin-bottom:2.5rem}
  .kachel{background:var(--flaeche);border:1px solid var(--rand);border-radius:12px;padding:1.2rem}
  .kachel .zahl{font-size:2.1rem;font-weight:700;letter-spacing:-.03em;line-height:1.1}
  .kachel .label{font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--leise);font-weight:600}
  .lead{background:var(--flaeche);border:1px solid var(--rand);border-radius:12px;margin-bottom:1rem;overflow:hidden}
  .lead__kopf{display:grid;grid-template-columns:1fr auto;gap:1rem;padding:1.1rem 1.3rem;align-items:center;cursor:pointer}
  .lead__name{font-weight:650;font-size:1.05rem}
  .lead__meta{color:var(--leise);font-size:.85rem;margin-top:.15rem}
  .scores{display:flex;align-items:center;gap:.7rem;font-variant-numeric:tabular-nums}
  .pille{display:inline-grid;place-items:center;min-width:2.9rem;padding:.3rem .55rem;border-radius:999px;
         font-weight:700;font-size:.95rem;color:#fff}
  .pfeil{color:var(--leise)}
  .sprung{font-weight:700;font-size:.85rem;color:var(--gut)}
  .lead__body{display:none;padding:0 1.3rem 1.3rem;border-top:1px solid var(--rand)}
  .lead.auf .lead__body{display:block}
  .vergleich{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin:1.1rem 0}
  .vergleich figure{margin:0}
  .vergleich img{width:100%;border-radius:8px;border:1px solid var(--rand);display:block;aspect-ratio:16/10;object-fit:cover;object-position:top}
  .vergleich figcaption{font-size:.75rem;text-transform:uppercase;letter-spacing:.09em;color:var(--leise);
                        font-weight:600;margin-bottom:.35rem}
  .luecken{margin:1rem 0 0;padding:0;list-style:none;display:grid;gap:.5rem}
  .luecken li{font-size:.88rem;padding-left:1.3rem;position:relative;color:var(--leise)}
  .luecken li::before{content:'✗';position:absolute;left:0;color:var(--schlecht);font-weight:700}
  .luecken strong{color:var(--text);font-weight:600}
  .aktionen{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.2rem}
  .btn{display:inline-block;padding:.55rem 1.05rem;border-radius:8px;text-decoration:none;
       font-size:.85rem;font-weight:600;border:1.5px solid var(--rand);color:var(--text);background:var(--flaeche)}
  .btn--p{background:var(--akzent);border-color:var(--akzent);color:#fff}
  .warn{background:color-mix(in srgb,var(--mittel) 14%,transparent);border:1px solid color-mix(in srgb,var(--mittel) 40%,transparent);
        border-radius:8px;padding:.6rem .85rem;font-size:.85rem;margin-top:.9rem}
  .fehler{background:color-mix(in srgb,var(--schlecht) 12%,transparent);border:1px solid color-mix(in srgb,var(--schlecht) 35%,transparent);
          border-radius:8px;padding:.6rem .85rem;font-size:.85rem;margin-top:.9rem;font-family:ui-monospace,monospace}
  .leer{text-align:center;color:var(--leise);padding:4rem 0}
  @media (max-width:720px){ .lead__kopf{grid-template-columns:1fr} .vergleich{grid-template-columns:1fr} }
</style>
</head>
<body>
<div class="wrap">
  <h1>Prototyp-Fabrik</h1>
  <p class="unter">${zeilen.length} Leads · Stand ${new Intl.DateTimeFormat('de-CH', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}</p>

  <div class="kacheln">
    <div class="kachel"><div class="zahl">${zeilen.length}</div><div class="label">Leads gesamt</div></div>
    <div class="kachel"><div class="zahl">${fertig.length}</div><div class="label">Prototyp fertig</div></div>
    <div class="kachel"><div class="zahl" style="color:var(--schlecht)">${mittelVorher}</div><div class="label">Score vorher (Mittel)</div></div>
    <div class="kachel"><div class="zahl" style="color:var(--gut)">${mittelNachher}</div><div class="label">Score nachher (Mittel)</div></div>
    <div class="kachel"><div class="zahl">${zeilen.filter((z) => z.status === 'failed').length}</div><div class="label">Fehlgeschlagen</div></div>
  </div>

  ${zeilen.length ? zeilen.map((z) => karte(z)).join('\n') : '<p class="leer">Noch keine Leads. Starte mit <code>wb discover</code> oder <code>wb build --url …</code></p>'}
</div>
<script>
document.querySelectorAll('.lead__kopf').forEach(function(k){
  k.addEventListener('click', function(){ k.parentElement.classList.toggle('auf'); });
});
</script>
</body>
</html>`;

  const pfad = join(config.outDir, '_report.html');
  writeFileSync(pfad, html);
  return pfad;
}

function farbe(score) {
  if (score == null) return 'var(--leise)';
  if (score >= 75) return 'var(--gut)';
  if (score >= 45) return 'var(--mittel)';
  return 'var(--schlecht)';
}

function karte(z) {
  const p = (n) => `<span class="pille" style="background:${farbe(n)}">${n ?? '–'}</span>`;
  return `<article class="lead">
  <div class="lead__kopf">
    <div>
      <div class="lead__name">${esc(z.name)}</div>
      <div class="lead__meta">${esc(z.ort || '')}${z.branche ? ` · ${esc(z.branche)}` : ''}${z.bewertung ? ` · ${z.bewertung}★` : ''}${z.url ? ` · ${esc(z.url.replace(/^https?:\/\/(www\.)?/, ''))}` : ' · keine Website'}</div>
    </div>
    <div class="scores">
      ${p(z.scoreVorher)}<span class="pfeil">→</span>${p(z.scoreNachher)}
      ${z.sprung > 0 ? `<span class="sprung">+${z.sprung}</span>` : ''}
    </div>
  </div>
  <div class="lead__body">
    ${z.vorherBild || z.nachherBild ? `<div class="vergleich">
      <figure><figcaption>Heute</figcaption>${z.vorherBild ? `<img src="${z.vorherBild}" alt="">` : '<div style="aspect-ratio:16/10;border:1px dashed var(--rand);border-radius:8px"></div>'}</figure>
      <figure><figcaption>Entwurf</figcaption>${z.nachherBild ? `<img src="${z.nachherBild}" alt="">` : '<div style="aspect-ratio:16/10;border:1px dashed var(--rand);border-radius:8px"></div>'}</figure>
    </div>` : ''}

    ${z.luecken.length ? `<ul class="luecken">
      ${z.luecken.map((l) => `<li><strong>${esc(l.text)}</strong> ${esc(l.warum)}</li>`).join('\n      ')}
    </ul>` : ''}

    ${z.platzhalter ? '<div class="warn">Kein brauchbares Foto gefunden — im Hero steht ein Platzhalter. Vor dem Versand pruefen.</div>' : ''}
    ${z.fehler.length ? `<div class="fehler">${z.fehler.map(esc).join('<br>')}</div>` : ''}

    <div class="aktionen">
      ${z.profil.render?.outDir ? `<a class="btn btn--p" href="./${esc(z.slug)}/index.html" target="_blank">Prototyp oeffnen</a>` : ''}
      ${z.previewUrl ? `<a class="btn" href="${esc(z.previewUrl)}" target="_blank">Vorschau-Link</a>` : ''}
      ${z.url ? `<a class="btn" href="${esc(z.url)}" target="_blank">Alte Seite</a>` : ''}
      ${z.profil.outreach?.betreff ? `<a class="btn" href="mailto:?subject=${encodeURIComponent(z.profil.outreach.betreff)}&body=${encodeURIComponent(z.profil.outreach.text ?? '')}">Mail oeffnen</a>` : ''}
    </div>
  </div>
</article>`;
}
