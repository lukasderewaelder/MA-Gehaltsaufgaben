// Zeichnet den Zettel (Entgeltabrechnung, angelehnt an übliche Abrechnungen) als HTML.
import { fmtBp, fmtCents } from './calc/money.js';
import { MONATE, POSTEN_TYPEN } from './model.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Beiblatt: Stichwort links, Text rechts daneben; alle Zeilen darunter beginnen in derselben Spalte (hängender Einzug). */
export const def = (stichwort, ...absaetze) => `<div class="def"><span class="def-k">${stichwort}</span><div class="def-t">${absaetze.join('')}</div></div>`;

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
 * Erklärmodus: Bereiche des Zettels mit Nummern und kurzen Erklärungen in einfacher Sprache (nur vorhandene Bereiche werden gezählt).
 * `nurNormal`: gibt es bei „Sehr einfach“ nicht; `einfach`: anderer Text bei „Sehr einfach“.
 */
const ERKLAERUNGEN = [
  { id: 'kopf', titel: 'Wer ist das?', text: 'Hier stehen die Firma, der Name und wichtige Angaben: Steuerklasse, Kinder, Kirche und Krankenkasse. Davon hängt ab, wie viel abgezogen wird.' },
  { id: 'bezuege', titel: 'Das Geld, das verdient wurde', text: 'Hier steht, wofür es Geld gibt. Oft gilt: Menge mal Faktor, zum Beispiel Stunden mal Stundenlohn. Ein Prozentsatz zeigt einen Zuschlag.' },
  { id: 'stsv', titel: 'St und SV', nurNormal: true, text: 'L heißt: gilt jeden Monat. S heißt: einmalige Zahlung. F heißt: frei. Dann werden keine Steuern und Beiträge abgezogen.' },
  { id: 'brutto', titel: 'Gesamt-Brutto', text: 'Alle Beträge zusammen. Das ist das Geld, bevor etwas abgezogen wird.' },
  {
    id: 'steuer',
    titel: 'Steuern',
    text: 'Lohnsteuer, Kirchensteuer und Soli rechnet man vom Steuer-Brutto aus.',
    einfach: 'Lohnsteuer und Kirchensteuer rechnest du vom Brutto aus. Kirchensteuer zahlt nur, wer in der Kirche ist.',
  },
  {
    id: 'sozial',
    titel: 'Sozialversicherung',
    text: 'Es gibt vier Versicherungen: Kranken-, Renten-, Arbeitslosen- und Pflegeversicherung. Jede kostet einen Prozentsatz vom Brutto. Bei sehr hohem Gehalt gibt es eine Obergrenze.',
    einfach: 'Es gibt vier Versicherungen: Kranken-, Renten-, Arbeitslosen- und Pflegeversicherung. Jede kostet einen Prozentsatz vom Brutto.',
  },
  { id: 'steuerabzug', titel: 'Abzüge für Steuern', text: 'Lohnsteuer + Kirchensteuer + Soli.', einfach: 'Lohnsteuer + Kirchensteuer.' },
  { id: 'svabzug', titel: 'Abzüge für die Sozialversicherung', text: 'Die vier Beiträge zusammen.' },
  { id: 'netto', titel: 'Netto-Verdienst', text: 'Brutto minus alle Abzüge. Das bleibt übrig.' },
  { id: 'verdienst', titel: 'Alles seit Januar', text: 'Hier sind alle Beträge seit Januar zusammengezählt.', block: 'verdienst' },
  { id: 'nettoabzug', titel: 'Abzüge vom Netto', text: 'Zum Beispiel Geld, das gespart wird. Es wird erst zum Schluss abgezogen.', block: 'netto' },
  { id: 'arbeitgeber', titel: 'Das zahlt der Chef', text: 'Der Chef zahlt zusätzlich seinen Teil der Sozialversicherung. Brutto plus sein Teil sind die Gesamtkosten.', block: 'arbeitgeber' },
  { id: 'fehltage', titel: 'Fehltage und Hinweise', text: 'Urlaubstage, Krankheitstage und Anmerkungen.', block: 'fehltage' },
  { id: 'auszahlung', titel: 'Auszahlungsbetrag', text: 'Das Geld, das wirklich auf dem Konto ankommt.' },
];

/** Die Erklärungen mit fortlaufender Nummer (nur Bereiche, die der Zettel gerade zeigt). */
export function erklaerungen(fall) {
  const einfach = fall.anzeige.einfach;
  return ERKLAERUNGEN.filter((e) => (!e.block || fall.anzeige.bloecke[e.block]) && !(einfach && e.nurNormal)).map((e, i) => ({
    id: e.id,
    titel: e.titel,
    text: einfach && e.einfach ? e.einfach : e.text,
    nr: i + 1,
  }));
}

/** Optionen: interactive (Felder anklickbar), compact (ohne Mindesthöhe, für das Arbeitsblatt),
 * modus: 'zettel' (alles sichtbar), 'arbeit' (gesuchte Felder leer), 'loesung' (gesuchte Felder hervorgehoben),
 *        'vorfuehren' (verdeckte Felder als „?“, Zutaten und gewähltes Feld markiert),
 * gesucht: Menge der gesuchten Feld-Ids, hinweis: Text für die Anklick-Hilfe,
 * erklaer: nummerierte Marken, legende: Legende unter dem Zettel (bei Erklärmodus),
 * verdeckt, quellen, aktiv: nur für den Vorführmodus,
 * nur: Menge der Abschnitte, die gezeigt werden ('kopf', 'bezuege', 'steuer', 'unten'); sonst der ganze Zettel. */
export function renderSlip(
  fall,
  r,
  {
    interactive = false,
    compact = false,
    modus = 'zettel',
    gesucht = new Set(),
    hinweis = 'anklicken zum Ändern',
    erklaer = fall.anzeige.erklaermodus,
    legende = true,
    verdeckt = new Set(),
    quellen = new Set(),
    aktiv = null,
    nur = null,
  } = {},
) {
  const optik = fall.anzeige.optik;
  const bloecke = fall.anzeige.bloecke;
  const nummern = new Map(erklaerungen(fall).map((e) => [e.id, e.nr]));
  const marke = (id) => (erklaer && nummern.has(id) ? `<span class="marke" aria-hidden="true">${nummern.get(id)}</span>` : '');
  const val = (id, cents, cls = '', text = null) => {
    const w = r.weg[id];
    if (modus === 'vorfuehren') {
      const klassen = `${cls}${quellen.has(id) ? ' quelle' : ''}${aktiv === id ? ' aktiv' : ''}`;
      const knopf = ' tabindex="0" role="button"';
      if (verdeckt.has(id)) return `<span class="val verdeckt ${klassen}" data-feld="${esc(id)}"${knopf} aria-label="Verdeckter Wert, antippen zum Aufdecken">&nbsp;</span>`;
      return `<span class="val ${klassen}" data-feld="${esc(id)}"${knopf}>${text ?? eur(cents)}</span>`;
    }
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

  // „Sehr einfach“: keine Spalten St/SV, kein Steuer-Brutto, kein SV-Brutto, kein Soli – alles wird vom Gesamt-Brutto gerechnet
  const einfach = Boolean(fall.anzeige.einfach);
  const zeilen = r.bruttoPosten
    .map((x) => {
      const art = POSTEN_TYPEN[x.typ]?.art ?? 'pauschal';
      const menge = art === 'pauschal' ? '' : val(`m:${x.id}`, x.menge);
      const faktor = art === 'pauschal' ? '' : val(`f:${x.id}`, x.faktor);
      const prozent = art === 'zuschlag' ? val(`z:${x.id}`, x.prozent ?? 0, '', fmtBp(x.prozent ?? 0)) : '';
      return `<tr>
        <td class="c">${esc(x.lohnart)}</td><td>${esc(x.bezeichnung)}</td><td class="c">${art === 'pauschal' ? '' : esc(x.einheit)}</td>
        <td class="r">${menge}</td><td class="r">${faktor}</td><td class="r">${prozent}</td>
        ${einfach ? '' : `<td class="c">${esc(x.st)}</td><td class="c">${esc(x.sv)}</td>`}
        <td class="r betrag">${val(`p:${x.id}`, x.betrag)}</td></tr>`;
    })
    .join('');
  const spalten = einfach ? 7 : 9;
  const leer = r.bruttoPosten.length ? '' : `<tr><td colspan="${spalten}" class="leer">Noch keine Bezüge.</td></tr>`;

  const svLabel = (kurz, bp) => `${kurz}-Beitrag <small>${fmtBp(bp)} %</small>`;
  const steuerTabelle = einfach
    ? `<table class="grid">
          <tr><th>Lohnsteuer${marke('steuer')}</th><th>Kirchensteuer</th></tr>
          <tr><td class="r">${val('lst', r.lst)}</td><td class="r">${val('kist', r.kist)}</td></tr>
        </table>`
    : `<table class="grid">
          <tr><th>Steuer-Brutto${marke('steuer')}</th><th>Lohnsteuer</th><th>Kirchensteuer</th><th>Solidaritätszuschlag</th></tr>
          <tr><td class="r">${val('stBrutto', r.stBrutto)}</td><td class="r">${val('lst', r.lst)}</td><td class="r">${val('kist', r.kist)}</td><td class="r">${val('soli', r.soli)}</td></tr>
        </table>`;
  const svTabelle = einfach
    ? `<table class="grid">
          <tr><th>${svLabel('KV', r.saetze.kv)}${marke('sozial')}</th><th>${svLabel('RV', r.saetze.rv)}</th><th>${svLabel('AV', r.saetze.av)}</th><th>${svLabel('PV', r.saetze.pv)}</th></tr>
          <tr><td class="r">${val('kv', r.kv)}</td><td class="r">${val('rv', r.rv)}</td><td class="r">${val('av', r.av)}</td><td class="r">${val('pv', r.pv)}</td></tr>
        </table>`
    : `<table class="grid">
          <tr><th>KV-Brutto${marke('sozial')}</th><th>RV-Brutto</th><th>AV-Brutto</th><th>PV-Brutto</th></tr>
          <tr><td class="r">${val('kvBrutto', r.kvBrutto)}</td><td class="r">${val('rvBrutto', r.rvBrutto)}</td><td class="r">${val('avBrutto', r.avBrutto)}</td><td class="r">${val('pvBrutto', r.pvBrutto)}</td></tr>
          <tr class="kopf2"><th>${svLabel('KV', r.saetze.kv)}</th><th>${svLabel('RV', r.saetze.rv)}</th><th>${svLabel('AV', r.saetze.av)}</th><th>${svLabel('PV', r.saetze.pv)}</th></tr>
          <tr><td class="r">${val('kv', r.kv)}</td><td class="r">${val('rv', r.rv)}</td><td class="r">${val('av', r.av)}</td><td class="r">${val('pv', r.pv)}</td></tr>
        </table>`;
  const steuerBlock = `
    <div class="steuer-sv">
      <div class="tabellen">
        ${steuerTabelle}
        ${svTabelle}
        ${einfach ? '<p class="klein einfach-hinweis">Alles wird vom Gesamt-Brutto berechnet.</p>' : ''}
      </div>
      <div class="summen">
        <div class="sum"><span>${einfach ? 'Abzüge für Steuern' : 'Steuerrechtliche Abzüge'}${marke('steuerabzug')}</span>${val('steuerAbzuege', r.steuerAbzuege)}</div>
        <div class="sum"><span>${einfach ? 'Abzüge für die Sozialversicherung' : 'SV-rechtliche Abzüge'}${marke('svabzug')}</span>${val('svAbzuege', r.svAbzuege)}</div>
        <div class="sum sum-gross"><span>Netto-Verdienst${marke('netto')}</span>${val('netto', r.netto)}</div>
      </div>
    </div>`;

  const k = r.kumuliert;
  const verdienst = bloecke.verdienst
    ? `<section class="block"><h3>Verdienstbescheinigung (seit Januar)${marke('verdienst')}</h3>
        ${
          einfach
            ? `<table class="grid"><tr><th>Gesamt-Brutto</th><th>Lohnsteuer</th><th>Kirchensteuer</th></tr>
        <tr><td class="r">${val('kumBrutto', k.brutto)}</td><td class="r">${val('kumLst', k.lst)}</td><td class="r">${val('kumKist', k.kist)}</td></tr></table>
        <table class="grid"><tr><th>KV-Beitrag</th><th>RV-Beitrag</th><th>AV-Beitrag</th><th>PV-Beitrag</th></tr>
        <tr><td class="r">${val('kumKv', k.kv)}</td><td class="r">${val('kumRv', k.rv)}</td><td class="r">${val('kumAv', k.av)}</td><td class="r">${val('kumPv', k.pv)}</td></tr></table>`
            : `<table class="grid"><tr><th>Gesamt-Brutto</th><th>Steuer-Brutto</th><th>Lohnsteuer</th><th>Kirchensteuer</th><th>Solidaritätszuschlag</th></tr>
        <tr><td class="r">${val('kumBrutto', k.brutto)}</td><td class="r">${val('kumStBrutto', k.stBrutto)}</td><td class="r">${val('kumLst', k.lst)}</td><td class="r">${val('kumKist', k.kist)}</td><td class="r">${val('kumSoli', k.soli)}</td></tr></table>
        <table class="grid"><tr><th>SV-Brutto</th><th>KV-Beitrag</th><th>RV-Beitrag</th><th>AV-Beitrag</th><th>PV-Beitrag</th></tr>
        <tr><td class="r">${val('kumSvBrutto', k.svBrutto)}</td><td class="r">${val('kumKv', k.kv)}</td><td class="r">${val('kumRv', k.rv)}</td><td class="r">${val('kumAv', k.av)}</td><td class="r">${val('kumPv', k.pv)}</td></tr></table>`
        }
      </section>`
    : '';

  const nettoBlock = bloecke.netto
    ? `<section class="block"><h3>Netto-Bezüge/-Abzüge${marke('nettoabzug')}</h3><table class="grid liste">
        ${r.nettoPosten.map((x) => `<tr><td class="c">${esc(x.lohnart)}</td><td>${esc(x.bezeichnung)}</td><td class="r">${val(`p:${x.id}`, x.betrag)}</td></tr>`).join('') || '<tr><td colspan="3" class="leer">Keine.</td></tr>'}
        <tr class="gesamt"><td></td><td>Summe der Abzüge</td><td class="r">${val('nettoAbzuege', r.nettoAbzuege)}</td></tr></table></section>`
    : '';

  const agBlock = bloecke.arbeitgeber
    ? `<section class="block"><h3>Arbeitgeberseite${marke('arbeitgeber')}</h3><table class="grid"><tr><th>Gesamt-Brutto</th><th>SV-AG-Anteil</th><th>Gesamtkosten</th></tr>
        <tr><td class="r">${val('gesamtBrutto', r.gesamtBrutto)}</td><td class="r">${val('agAnteil', r.agAnteil)}</td><td class="r">${val('gesamtKosten', r.gesamtKosten)}</td></tr></table></section>`
    : '';

  const fehltage = bloecke.fehltage
    ? `<section class="block"><h3>Fehltage und Hinweise${marke('fehltage')}</h3><div class="kopf">${kopfZelle('Urlaubstage', fall.fehltage.urlaub)}${kopfZelle('Krankheitstage', fall.fehltage.krank)}</div>
        ${fall.hinweis ? `<p class="hinweis">${esc(fall.hinweis)}</p>` : ''}</section>`
    : '';

  const bank = bloecke.bank
    ? `<section class="block anschriften"><div><strong>${esc(fall.firma.name)}</strong><br>${esc(fall.firma.strasse)}<br>${esc(fall.firma.ort)}</div>
        <div><strong>${esc(p.name)}</strong><br>${esc(p.strasse)}<br>${esc(p.ort)}</div>
        <div><strong>${esc(fall.bank.name)}</strong><br>${esc(fall.bank.iban)}</div></section>`
    : '';

  const legendeHtml =
    erklaer && legende
      ? `<section class="legende" aria-label="Legende"><h3>So liest du die Abrechnung</h3><ol>${erklaerungen(fall)
          .map((e) => `<li><span class="marke" aria-hidden="true">${e.nr}</span><span><b>${esc(e.titel)}:</b> ${esc(e.text)}</span></li>`)
          .join('')}</ol></section>`
      : '';

  // Ausschnitt (Mischblatt): nur die genannten Abschnitte 'kopf', 'bezuege', 'steuer', 'unten' zeigen
  const zeige = (abschnitt) => !nur || nur.has(abschnitt);
  const ausschnitt = Boolean(nur);

  return `<article class="slip optik-${optik}${compact ? ' slip-compact' : ''}${ausschnitt ? ' slip-ausschnitt' : ''}" aria-label="${titel} ${esc(monat)}">
    ${zeige('kopf') ? `<header class="slip-kopf" data-abschnitt="kopf">
      <h2>${titel} für ${esc(monat)}${marke('kopf')}</h2>
      <div class="kopf">
        ${kopfZelle('Firma', fall.firma.name)}${kopfZelle('Name', p.name)}
        ${kopfZelle('Personal-Nr.', p.personalnr)}${kopfZelle('Steuerklasse', p.steuerklasse)}${kopfZelle('Kinder', p.kinder)}
        ${kopfZelle('Konfession', p.konfession === 'keine' ? '–' : p.konfession)}${kopfZelle('Krankenkasse', p.krankenkasse)}
      </div>
    </header>` : ''}
    ${ausschnitt ? '' : bank}
    ${zeige('bezuege') ? `<section class="block" data-abschnitt="bezuege">
      <h3>Brutto-Bezüge${marke('bezuege')}</h3>
      <table class="bezuege">
        <thead><tr><th>Lohnart</th><th>Bezeichnung</th><th>Einheit</th><th>Menge</th><th>Faktor (€)</th><th>Prozent</th>${einfach ? '' : `<th>St${marke('stsv')}</th><th>SV</th>`}<th>Betrag (€)</th></tr></thead>
        <tbody>${zeilen}${leer}</tbody>
        <tfoot><tr><td colspan="${spalten - 1}" class="r"><strong>Gesamt-Brutto</strong>${marke('brutto')}</td><td class="r betrag">${val('gesamtBrutto', r.gesamtBrutto)}</td></tr></tfoot>
      </table>
    </section>` : ''}
    ${zeige('steuer') ? `<section class="block" data-abschnitt="steuer"><h3>Steuer und Sozialversicherung</h3>${steuerBlock}</section>` : ''}
    ${zeige('unten') ? `<div class="slip-unten" data-abschnitt="unten">
      ${verdienst}${nettoBlock}${agBlock}${fehltage}${legendeHtml}
      <footer class="slip-fuss">
        <div class="auszahlung"><span>Auszahlungsbetrag${marke('auszahlung')}</span>${val('auszahlung', r.auszahlung, 'gross')}</div>
        <p class="vereinfacht">Vereinfachte Abrechnung für den Unterricht (${r.rates.jahr}) – kein echter Entgeltnachweis. Erfundene Firma und Person.</p>
      </footer>
    </div>` : ''}
  </article>`;
}
