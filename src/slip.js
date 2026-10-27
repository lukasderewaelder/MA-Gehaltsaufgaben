// Zeichnet den Zettel (Entgeltabrechnung, angelehnt an übliche Abrechnungen) als HTML.
import { fmtBp, fmtCents } from './calc/money.js';
import { MONATE, POSTEN_TYPEN } from './model.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const FELD_NAMEN = {
  gesamtBrutto: 'Gesamt-Brutto',
  stBrutto: 'Steuer-Brutto',
  kvBrutto: 'KV-Brutto',
  rvBrutto: 'RV-Brutto',
  avBrutto: 'AV-Brutto',
  pvBrutto: 'PV-Brutto',
  lst: 'Lohnsteuer',
  soli: 'Solidaritätszuschlag',
  kist: 'Kirchensteuer',
  kv: 'KV-Beitrag',
  rv: 'RV-Beitrag',
  av: 'AV-Beitrag',
  pv: 'PV-Beitrag',
  steuerAbzuege: 'Steuerrechtliche Abzüge',
  svAbzuege: 'SV-rechtliche Abzüge',
  netto: 'Netto-Verdienst',
  nettoAbzuege: 'Netto-Abzüge',
  auszahlung: 'Auszahlungsbetrag',
  agAnteil: 'SV-AG-Anteil',
  gesamtKosten: 'Gesamtkosten',
  kumBrutto: 'Gesamt-Brutto (seit Januar)',
  kumStBrutto: 'Steuer-Brutto (seit Januar)',
  kumLst: 'Lohnsteuer (seit Januar)',
  kumSoli: 'Solidaritätszuschlag (seit Januar)',
  kumKist: 'Kirchensteuer (seit Januar)',
  kumSvBrutto: 'SV-Brutto (seit Januar)',
  kumKv: 'KV-Beitrag (seit Januar)',
  kumRv: 'RV-Beitrag (seit Januar)',
  kumAv: 'AV-Beitrag (seit Januar)',
  kumPv: 'PV-Beitrag (seit Januar)',
};

const POSTEN_FELD = { p: 'Betrag', m: 'Menge', f: 'Faktor', z: 'Prozentsatz' };

export function feldName(id, fall) {
  const art = id.slice(0, 2);
  if (['p:', 'm:', 'f:', 'z:'].includes(art)) {
    const p = fall.posten.find((x) => x.id === id.slice(2));
    const was = POSTEN_FELD[art[0]];
    return p ? `${was}: ${p.bezeichnung}` : was;
  }
  return FELD_NAMEN[id] ?? id;
}

/** Wert eines Feldes als Text (Betrag in €, Menge mit Einheit, Prozentsatz). */
export function fmtWert(id, wert, fall) {
  if (id.startsWith('z:')) return `${fmtBp(wert)} %`;
  if (id.startsWith('m:')) {
    const p = fall.posten.find((x) => x.id === id.slice(2));
    return `${fmtCents(wert)}${p ? ` ${p.einheit}` : ''}`;
  }
  return `${fmtCents(wert)} €`;
}

const eur = fmtCents;

/**
 * Optionen: interactive (Felder anklickbar), compact (ohne Mindesthöhe, für das Arbeitsblatt),
 * modus: 'zettel' (alles sichtbar), 'arbeit' (gesuchte Felder leer), 'loesung' (gesuchte Felder hervorgehoben),
 * gesucht: Menge der gesuchten Feld-Ids, hinweis: Text für die Anklick-Hilfe.
 */
export function renderSlip(fall, r, { interactive = false, compact = false, modus = 'zettel', gesucht = new Set(), hinweis = 'anklicken zum Ändern' } = {}) {
  const optik = fall.anzeige.optik;
  const bloecke = fall.anzeige.bloecke;
  const val = (id, cents, cls = '', text = null) => {
    const w = r.weg[id];
    const gefragt = modus !== 'zettel' && gesucht.has(id);
    const attrs = interactive && !(modus === 'zettel' && w?.nurAnzeige) ? ` tabindex="0" role="button" title="${esc(`${gefragt && modus === 'arbeit' ? '' : `${w?.text ?? ''} – `}${hinweis}`)}"` : '';
    if (gefragt && modus === 'arbeit') return `<span class="val luecke ${cls}" data-feld="${esc(id)}"${attrs}>&nbsp;</span>`;
    const extra = `${w?.ueberschrieben ? ' is-override' : ''}${gefragt ? ' loesung' : ''}`;
    return `<span class="val ${cls}${extra}" data-feld="${esc(id)}"${attrs}>${text ?? eur(cents)}</span>`;
  };
  const kopfZelle = (label, wert) => `<div class="kz"><span class="kl">${esc(label)}</span><span class="kw">${esc(wert)}</span></div>`;
  const p = fall.person;
  const monat = `${MONATE[fall.monat - 1]} ${fall.jahr}`;
  const titel = fall.art === 'lohn' ? 'Lohnabrechnung' : 'Gehaltsabrechnung';

  const zeilen = r.bruttoPosten
    .map((x) => {
      const art = POSTEN_TYPEN[x.typ]?.art ?? 'pauschal';
      const menge = art === 'pauschal' ? '' : val(`m:${x.id}`, x.menge);
      const faktor = art === 'pauschal' ? '' : val(`f:${x.id}`, x.faktor);
      const prozent = art === 'zuschlag' ? val(`z:${x.id}`, x.prozent ?? 0, '', fmtBp(x.prozent ?? 0)) : '';
      return `<tr>
        <td class="c">${esc(x.lohnart)}</td><td>${esc(x.bezeichnung)}</td><td class="c">${art === 'pauschal' ? '' : esc(x.einheit)}</td>
        <td class="r">${menge}</td><td class="r">${faktor}</td><td class="r">${prozent}</td>
        <td class="c">${esc(x.st)}</td><td class="c">${esc(x.sv)}</td>
        <td class="r betrag">${val(`p:${x.id}`, x.betrag)}</td></tr>`;
    })
    .join('');
  const leer = r.bruttoPosten.length ? '' : '<tr><td colspan="9" class="leer">Noch keine Bezüge.</td></tr>';

  const svLabel = (kurz, bp) => `${kurz}-Beitrag <small>${fmtBp(bp)} %</small>`;
  const steuerBlock = `
    <div class="steuer-sv">
      <div class="tabellen">
        <table class="grid">
          <tr><th>Steuer-Brutto</th><th>Lohnsteuer</th><th>Kirchensteuer</th><th>Solidaritätszuschlag</th></tr>
          <tr><td class="r">${val('stBrutto', r.stBrutto)}</td><td class="r">${val('lst', r.lst)}</td><td class="r">${val('kist', r.kist)}</td><td class="r">${val('soli', r.soli)}</td></tr>
        </table>
        <table class="grid">
          <tr><th>KV-Brutto</th><th>RV-Brutto</th><th>AV-Brutto</th><th>PV-Brutto</th></tr>
          <tr><td class="r">${val('kvBrutto', r.kvBrutto)}</td><td class="r">${val('rvBrutto', r.rvBrutto)}</td><td class="r">${val('avBrutto', r.avBrutto)}</td><td class="r">${val('pvBrutto', r.pvBrutto)}</td></tr>
          <tr class="kopf2"><th>${svLabel('KV', r.saetze.kv)}</th><th>${svLabel('RV', r.saetze.rv)}</th><th>${svLabel('AV', r.saetze.av)}</th><th>${svLabel('PV', r.saetze.pv)}</th></tr>
          <tr><td class="r">${val('kv', r.kv)}</td><td class="r">${val('rv', r.rv)}</td><td class="r">${val('av', r.av)}</td><td class="r">${val('pv', r.pv)}</td></tr>
        </table>
      </div>
      <div class="summen">
        <div class="sum"><span>Steuerrechtliche Abzüge</span>${val('steuerAbzuege', r.steuerAbzuege)}</div>
        <div class="sum"><span>SV-rechtliche Abzüge</span>${val('svAbzuege', r.svAbzuege)}</div>
        <div class="sum sum-gross"><span>Netto-Verdienst</span>${val('netto', r.netto)}</div>
      </div>
    </div>`;

  const k = r.kumuliert;
  const verdienst = bloecke.verdienst
    ? `<section class="block"><h3>Verdienstbescheinigung (seit Januar)</h3>
        <table class="grid"><tr><th>Gesamt-Brutto</th><th>Steuer-Brutto</th><th>Lohnsteuer</th><th>Kirchensteuer</th><th>Solidaritätszuschlag</th></tr>
        <tr><td class="r">${val('kumBrutto', k.brutto)}</td><td class="r">${val('kumStBrutto', k.stBrutto)}</td><td class="r">${val('kumLst', k.lst)}</td><td class="r">${val('kumKist', k.kist)}</td><td class="r">${val('kumSoli', k.soli)}</td></tr></table>
        <table class="grid"><tr><th>SV-Brutto</th><th>KV-Beitrag</th><th>RV-Beitrag</th><th>AV-Beitrag</th><th>PV-Beitrag</th></tr>
        <tr><td class="r">${val('kumSvBrutto', k.svBrutto)}</td><td class="r">${val('kumKv', k.kv)}</td><td class="r">${val('kumRv', k.rv)}</td><td class="r">${val('kumAv', k.av)}</td><td class="r">${val('kumPv', k.pv)}</td></tr></table>
      </section>`
    : '';

  const nettoBlock = bloecke.netto
    ? `<section class="block"><h3>Netto-Bezüge/-Abzüge</h3><table class="grid liste">
        ${r.nettoPosten.map((x) => `<tr><td class="c">${esc(x.lohnart)}</td><td>${esc(x.bezeichnung)}</td><td class="r">${val(`p:${x.id}`, x.betrag)}</td></tr>`).join('') || '<tr><td colspan="3" class="leer">Keine.</td></tr>'}
        <tr class="gesamt"><td></td><td>Summe der Abzüge</td><td class="r">${val('nettoAbzuege', r.nettoAbzuege)}</td></tr></table></section>`
    : '';

  const agBlock = bloecke.arbeitgeber
    ? `<section class="block"><h3>Arbeitgeberseite</h3><table class="grid"><tr><th>Gesamt-Brutto</th><th>SV-AG-Anteil</th><th>Gesamtkosten</th></tr>
        <tr><td class="r">${val('gesamtBrutto', r.gesamtBrutto)}</td><td class="r">${val('agAnteil', r.agAnteil)}</td><td class="r">${val('gesamtKosten', r.gesamtKosten)}</td></tr></table></section>`
    : '';

  const fehltage = bloecke.fehltage
    ? `<section class="block"><h3>Fehltage und Hinweise</h3><div class="kopf">${kopfZelle('Urlaubstage', fall.fehltage.urlaub)}${kopfZelle('Krankheitstage', fall.fehltage.krank)}</div>
        ${fall.hinweis ? `<p class="hinweis">${esc(fall.hinweis)}</p>` : ''}</section>`
    : '';

  const bank = bloecke.bank
    ? `<section class="block anschriften"><div><strong>${esc(fall.firma.name)}</strong><br>${esc(fall.firma.strasse)}<br>${esc(fall.firma.ort)}</div>
        <div><strong>${esc(p.name)}</strong><br>${esc(p.strasse)}<br>${esc(p.ort)}</div>
        <div><strong>${esc(fall.bank.name)}</strong><br>${esc(fall.bank.iban)}</div></section>`
    : '';

  return `<article class="slip optik-${optik}${compact ? ' slip-compact' : ''}" aria-label="${titel} ${esc(monat)}">
    <header class="slip-kopf">
      <h2>${titel} für ${esc(monat)}</h2>
      <div class="kopf">
        ${kopfZelle('Firma', fall.firma.name)}${kopfZelle('Name', p.name)}
        ${kopfZelle('Personal-Nr.', p.personalnr)}${kopfZelle('Steuerklasse', p.steuerklasse)}${kopfZelle('Kinder', p.kinder)}
        ${kopfZelle('Konfession', p.konfession === 'keine' ? '–' : p.konfession)}${kopfZelle('Krankenkasse', p.krankenkasse)}
      </div>
    </header>
    ${bank}
    <section class="block">
      <h3>Brutto-Bezüge</h3>
      <table class="bezuege">
        <thead><tr><th>Lohnart</th><th>Bezeichnung</th><th>Einheit</th><th>Menge</th><th>Faktor (€)</th><th>Prozent</th><th>St</th><th>SV</th><th>Betrag (€)</th></tr></thead>
        <tbody>${zeilen}${leer}</tbody>
        <tfoot><tr><td colspan="8" class="r"><strong>Gesamt-Brutto</strong></td><td class="r betrag">${val('gesamtBrutto', r.gesamtBrutto)}</td></tr></tfoot>
      </table>
    </section>
    <section class="block"><h3>Steuer und Sozialversicherung</h3>${steuerBlock}</section>
    ${verdienst}${nettoBlock}${agBlock}${fehltage}
    <footer class="slip-fuss">
      <div class="auszahlung"><span>Auszahlungsbetrag</span>${val('auszahlung', r.auszahlung, 'gross')}</div>
      <p class="vereinfacht">Vereinfachte Abrechnung für den Unterricht (${r.rates.jahr}) – kein echter Entgeltnachweis. Erfundene Firma und Person.</p>
    </footer>
  </article>`;
}
