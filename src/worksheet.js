// Arbeitsblatt und Lösungsblatt: Teilaufgaben aus den gesuchten Feldern, Beiblatt „Abzüge im Überblick“, Seitenaufbau (A4).
import { fmtBp, fmtCents } from './calc/money.js';
import { tabellenLohnsteuer, tabellenStufe } from './calc/tax.js';
import { MONATE, POSTEN_TYPEN } from './model.js';
import { esc, feldName, renderSlip } from './slip.js';

export const PAGE_W = 794; // A4 bei 96 dpi
export const PAGE_H = 1122;
const PAGE_PAD = 40;

const GRUPPEN = [
  ['Bezüge', (id) => id.startsWith('p:') || id === 'gesamtBrutto'],
  ['Steuer', (id) => ['stBrutto', 'lst', 'soli', 'kist'].includes(id)],
  ['Sozialversicherung', (id) => ['kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto', 'kv', 'rv', 'av', 'pv'].includes(id)],
  ['Ergebnis', (id) => ['steuerAbzuege', 'svAbzuege', 'netto', 'nettoAbzuege', 'auszahlung'].includes(id)],
  ['Arbeitgeber', (id) => ['agAnteil', 'gesamtKosten'].includes(id)],
  ['Jahressummen', (id) => id.startsWith('kum')],
];

const REIHENFOLGE = [
  'gesamtBrutto', 'stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto', 'lst', 'soli', 'kist', 'kv', 'rv', 'av', 'pv',
  'steuerAbzuege', 'svAbzuege', 'netto', 'nettoAbzuege', 'auszahlung', 'agAnteil', 'gesamtKosten',
  'kumBrutto', 'kumStBrutto', 'kumLst', 'kumKist', 'kumSoli', 'kumSvBrutto', 'kumKv', 'kumRv', 'kumAv', 'kumPv',
];

/** Felder, die auf dem Zettel zu sehen (und damit als „gesucht“ wählbar) sind, in Lese-Reihenfolge, nach Gruppen. */
export function verfuegbareFelder(fall, r) {
  const b = fall.anzeige.bloecke;
  const sichtbar = (id) => {
    if (id === 'nettoAbzuege') return b.netto;
    if (id === 'agAnteil' || id === 'gesamtKosten') return b.arbeitgeber;
    if (id.startsWith('kum')) return b.verdienst;
    return true;
  };
  const postenIds = r.posten.filter((p) => p.bereich === 'brutto' || b.netto).map((p) => `p:${p.id}`);
  const ids = [...postenIds, ...REIHENFOLGE.filter(sichtbar)];
  // Bezüge zuerst (Posten, dann Gesamt-Brutto), danach nach fester Reihenfolge
  const ordnung = new Map(ids.map((id, i) => [id, i]));
  return GRUPPEN.map(([gruppe, passt]) => ({
    gruppe,
    felder: ids.filter(passt).sort((a, c) => ordnung.get(a) - ordnung.get(c)).map((id) => ({ id, name: feldName(id, fall) })),
  })).filter((g) => g.felder.length);
}

const eur = (c) => `${fmtCents(c)} €`;

/** Automatischer Text einer Teilaufgabe. */
export function teilText(fall, r, id) {
  const k = fall.person.steuerklasse;
  const s = r.saetze;
  if (id.startsWith('p:')) {
    const p = r.posten.find((x) => `p:${x.id}` === id);
    const art = POSTEN_TYPEN[p?.typ]?.art ?? 'pauschal';
    const n = p?.bezeichnung ?? 'Posten';
    if (art === 'zuschlag') return `Berechne den Betrag für „${n}“ (Menge · Stundenlohn · Prozentsatz).`;
    if (art === 'menge') return `Berechne den Betrag für „${n}“ (Menge · Faktor).`;
    return `Wie hoch ist der Betrag für „${n}“?`;
  }
  const lst =
    fall.steuer.modus === 'tabelle'
      ? `Lies die Lohnsteuer für Steuerklasse ${k} in der Lohnsteuertabelle ab.`
      : fall.steuer.modus === 'prozent'
        ? `Berechne die Lohnsteuer: ${fmtBp(fall.steuer.prozent)} % vom Steuer-Brutto.`
        : 'Bestimme die Lohnsteuer.';
  const texte = {
    gesamtBrutto: 'Berechne das Gesamt-Brutto (Summe aller Bezüge).',
    stBrutto: 'Bestimme das Steuer-Brutto. Steuerfreie Bezüge (St = F) zählen nicht mit.',
    kvBrutto: 'Wie hoch ist die Berechnungsgrundlage der Krankenversicherung (KV-Brutto)? Beachte die Beitragsbemessungsgrenze.',
    rvBrutto: 'Wie hoch ist die Berechnungsgrundlage der Rentenversicherung (RV-Brutto)? Beachte die Beitragsbemessungsgrenze.',
    avBrutto: 'Wie hoch ist die Berechnungsgrundlage der Arbeitslosenversicherung (AV-Brutto)? Beachte die Beitragsbemessungsgrenze.',
    pvBrutto: 'Wie hoch ist die Berechnungsgrundlage der Pflegeversicherung (PV-Brutto)? Beachte die Beitragsbemessungsgrenze.',
    lst,
    soli: 'Berechne den Solidaritätszuschlag (5,5 % der Lohnsteuer, sofern die Freigrenze überschritten ist).',
    kist:
      fall.person.konfession === 'keine'
        ? 'Wie hoch ist die Kirchensteuer? (Keine Konfession.)'
        : `Berechne die Kirchensteuer (${fmtBp(r.steuerDetail.kistBp)} % der Lohnsteuer).`,
    kv: `Berechne den Beitrag zur Krankenversicherung (${fmtBp(s.kv)} % vom KV-Brutto).`,
    rv: `Berechne den Beitrag zur Rentenversicherung (${fmtBp(s.rv)} % vom RV-Brutto).`,
    av: `Berechne den Beitrag zur Arbeitslosenversicherung (${fmtBp(s.av)} % vom AV-Brutto).`,
    pv: `Berechne den Beitrag zur Pflegeversicherung (${fmtBp(s.pv)} % vom PV-Brutto).`,
    steuerAbzuege: 'Berechne die steuerrechtlichen Abzüge (Lohnsteuer + Solidaritätszuschlag + Kirchensteuer).',
    svAbzuege: 'Berechne die SV-rechtlichen Abzüge (Summe der vier Sozialversicherungsbeiträge).',
    netto: 'Berechne den Netto-Verdienst (Gesamt-Brutto minus alle Abzüge).',
    nettoAbzuege: 'Wie hoch sind die Abzüge vom Netto insgesamt?',
    auszahlung: 'Wie viel Euro werden ausgezahlt?',
    agAnteil: 'Berechne den Arbeitgeberanteil zur Sozialversicherung.',
    gesamtKosten: 'Wie hoch sind die Gesamtkosten für den Arbeitgeber (Brutto plus Arbeitgeberanteil)?',
  };
  return texte[id] ?? `Bestimme: ${feldName(id, fall)}.`;
}

export function sachtextAuto(fall, hatGesucht) {
  const p = fall.person;
  const kinder = p.kinder > 0 ? `${p.kinder} ${p.kinder === 1 ? 'Kind' : 'Kinder'}` : 'keine Kinder';
  return `${p.name} arbeitet bei ${fall.firma.name}. Hier ist die Abrechnung für ${MONATE[fall.monat - 1]} ${fall.jahr} (Steuerklasse ${p.steuerklasse}, ${kinder}). ${hatGesucht ? 'Einige Werte fehlen. Ergänze sie.' : 'Lies die Abrechnung genau.'}`;
}

/** Gesuchte Felder (nur die, die es auf dem Zettel gibt) in Lese-Reihenfolge. */
export function gesuchteFelder(fall, r) {
  const da = new Set(verfuegbareFelder(fall, r).flatMap((g) => g.felder.map((f) => f.id)));
  const wahl = new Set(fall.aufgabe.gesucht.filter((id) => da.has(id)));
  return verfuegbareFelder(fall, r).flatMap((g) => g.felder.map((f) => f.id)).filter((id) => wahl.has(id));
}

export function teilaufgaben(fall, r) {
  return gesuchteFelder(fall, r).map((id, i) => ({
    id,
    nr: `${String.fromCharCode(97 + (i % 26))})`,
    text: fall.aufgabe.texte[id] ?? teilText(fall, r, id),
    wert: r.werte[id],
    weg: r.weg[id]?.text ?? '',
  }));
}

// --- Beiblatt „Abzüge im Überblick“ -----------------------------------------------------------------
export function merkzettel(fall, r, { modus = 'arbeit' } = {}) {
  const rates = r.rates;
  const k = fall.person.steuerklasse;
  const zusatz = fall.person.zusatzbeitrag;
  const s = r.saetze;
  const zeilen = [
    ['Krankenversicherung (KV)', `${fmtBp(rates.kvAllgemein * 2)} % + Zusatzbeitrag ${fmtBp(zusatz)} % = ${fmtBp(rates.kvAllgemein * 2 + zusatz)} %`, `${fmtBp(s.kv)} %`],
    ['Rentenversicherung (RV)', `${fmtBp(rates.rv * 2)} %`, `${fmtBp(s.rv)} %`],
    ['Arbeitslosenversicherung (AV)', `${fmtBp(rates.av * 2)} %`, `${fmtBp(s.av)} %`],
    ['Pflegeversicherung (PV)', `${fmtBp(rates.pv * 2)} %`, `${fmtBp(s.pv)} %`],
  ];
  const sv = zeilen.map(([n, ges, an]) => `<tr><td>${esc(n)}</td><td class="r">${esc(ges)}</td><td class="r"><b>${an}</b></td></tr>`).join('');

  let steuer;
  if (fall.steuer.modus === 'tabelle') {
    const mitte = r.steuerDetail.tabelle?.von ?? tabellenStufe(r.stBrutto).von;
    const stufe = 5000;
    const reihen = [];
    for (let i = -6; i <= 6; i++) {
      const von = mitte + i * stufe;
      if (von >= 0) reihen.push(von);
    }
    const kopf = [1, 2, 3, 4, 5, 6].map((c) => `<th class="r${modus === 'loesung' && c === k ? ' treffer' : ''}">Klasse ${['I', 'II', 'III', 'IV', 'V', 'VI'][c - 1]}</th>`).join('');
    const body = reihen
      .map((von) => {
        const zeile = tabellenLohnsteuer(von, 1, rates, stufe);
        const treffer = modus === 'loesung' && von === mitte;
        const zellen = [1, 2, 3, 4, 5, 6]
          .map((c) => `<td class="r${treffer ? ' treffer' : ''}${modus === 'loesung' && c === k ? ' spalte' : ''}">${fmtCents(tabellenLohnsteuer(von, c, rates, stufe).lohnsteuer)}</td>`)
          .join('');
        return `<tr><td>${fmtCents(zeile.von)} bis ${fmtCents(zeile.bis)}</td>${zellen}</tr>`;
      })
      .join('');
    steuer = `<h3>Lohnsteuertabelle (Monat, Ausschnitt)</h3>
      <table class="mz lst"><thead><tr><th>Steuer-Brutto</th>${kopf}</tr></thead><tbody>${body}</tbody></table>
      <p class="klein">Beträge in Euro. Die Tabelle ist vereinfacht und berücksichtigt keine Kinderfreibeträge.</p>`;
  } else if (fall.steuer.modus === 'prozent') {
    steuer = `<h3>Lohnsteuer</h3><p>Die Lohnsteuer beträgt hier <b>${fmtBp(fall.steuer.prozent)} %</b> vom Steuer-Brutto.</p>`;
  } else {
    steuer = '<h3>Lohnsteuer</h3><p>Die Lohnsteuer richtet sich nach dem Steuertarif, Steuerklasse und Kinderzahl. Sie wird in der Aufgabe angegeben.</p>';
  }

  return `<section class="page page-bei" data-seite="beiblatt">
    <header class="page-kopf"><div><h1>Abzüge im Überblick ${rates.jahr}</h1>${modus === 'loesung' ? '<span class="stempel">Lösung</span>' : ''}</div></header>
    <h3>Sozialversicherung</h3>
    <table class="mz"><thead><tr><th>Versicherung</th><th class="r">Beitragssatz insgesamt</th><th class="r">Anteil Arbeitnehmer</th></tr></thead><tbody>${sv}</tbody></table>
    <p class="klein">Arbeitgeber und Arbeitnehmer teilen sich die Beiträge. Pflegeversicherung: Kinderlose ab 23 Jahren zahlen ${fmtBp(rates.pvKinderlosZuschlag)} % mehr, ab dem 2. Kind gibt es ${fmtBp(rates.pvAbschlagProKind)} % Abschlag je Kind.</p>
    <p><b>Beitragsbemessungsgrenze:</b> Rentenversicherung und Arbeitslosenversicherung ${eur(rates.bbgRv)} im Monat, Kranken- und Pflegeversicherung ${eur(rates.bbgKv)} im Monat. Nur bis zu dieser Grenze werden Beiträge berechnet.</p>
    <h3>Steuern</h3>
    <p><b>Solidaritätszuschlag:</b> ${fmtBp(rates.soliSatz)} % der Lohnsteuer – nur wenn die Lohnsteuer im Jahr über ${rates.soliFreigrenze.toLocaleString('de-DE')} € liegt (Steuerklasse III: ${(rates.soliFreigrenze * 2).toLocaleString('de-DE')} €).</p>
    <p><b>Kirchensteuer:</b> ${fmtBp(rates.kistSatz[fall.person.kirchensteuersatz])} % der Lohnsteuer – nur bei Konfession (ev oder rk).</p>
    ${steuer}
    <p class="klein">Vereinfachte Werte für den Unterricht (${rates.jahr}).</p>
  </section>`;
}

// --- Seiten ---------------------------------------------------------------------------------------------
const linien = (n) => Array.from({ length: n }, () => '<div class="rz"></div>').join('');

/** Seiten als HTML: Aufgabenblatt (oder nur Zettel) und, wenn gewählt, das Beiblatt. */
export function renderBlatt(fall, r, { modus = 'arbeit', interactive = false } = {}) {
  const gesucht = new Set(gesuchteFelder(fall, r));
  const slip = renderSlip(fall, r, { interactive, compact: true, modus, gesucht, hinweis: 'anklicken: gesucht oder angegeben' });
  const stempel = modus === 'loesung' ? '<span class="stempel">Lösung</span>' : '';
  const teile = teilaufgaben(fall, r);
  const a = fall.aufgabe;
  let seite;
  if (a.blatt === 'zettel') {
    seite = `<section class="page page-zettel" data-seite="blatt">${stempel}<div class="slip-fit">${slip}</div></section>`;
  } else {
    const sach = a.sachtext ?? sachtextAuto(fall, teile.length > 0);
    const eintraege = teile
      .map(
        (t) => `<div class="teil"><span class="tl">${t.nr}</span><div class="tb"><div class="tt">${esc(t.text)}</div>${
          modus === 'loesung'
            ? `<div class="tloesung"><b>${eur(t.wert)}</b> <span>${esc(t.weg)}</span></div>`
            : linien(a.zeilen)
        }</div></div>`,
      )
      .join('');
    seite = `<section class="page page-blatt" data-seite="blatt">
      <header class="page-kopf"><div><h1>${esc(a.titel || fall.titel)}</h1>${stempel}</div>
        <div class="felder"><span>Name</span><span>Klasse</span><span>Datum</span></div></header>
      <p class="sachtext">${esc(sach)}</p>
      ${teile.length ? `<div class="teile${teile.length > 4 ? ' zwei' : ''}">${eintraege}</div>` : ''}
      <div class="slip-fit">${slip}</div>
    </section>`;
  }
  return seite + (a.beiblatt ? merkzettel(fall, r, { modus }) : '');
}

/** Passt den Zettel auf jeder Seite in den freien Platz (verkleinert bis 55 %); markiert Seiten, auf denen es nicht reicht. */
export function fitPages(root) {
  for (const page of root.querySelectorAll('.page')) {
    page.classList.remove('is-overflow');
    const wrap = page.querySelector('.slip-fit');
    if (!wrap) {
      if (page.scrollHeight > PAGE_H + 1) page.classList.add('is-overflow');
      continue;
    }
    const slip = wrap.querySelector('.slip');
    slip.style.transform = 'none';
    wrap.style.height = '';
    const natural = slip.offsetHeight;
    const frei = PAGE_H - PAGE_PAD - wrap.offsetTop;
    let scale = Math.min(1, frei / natural);
    if (scale < 0.55) {
      scale = 0.55;
      page.classList.add('is-overflow');
    }
    slip.style.transformOrigin = 'top center';
    slip.style.transform = scale < 1 ? `scale(${scale.toFixed(4)})` : 'none';
    wrap.style.height = `${Math.ceil(natural * scale)}px`;
  }
}
