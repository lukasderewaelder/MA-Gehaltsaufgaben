// Arbeitsblatt und Lösungsblatt: Teilaufgaben aus den gesuchten Feldern, Beiblatt „Abzüge im Überblick“, Seitenaufbau (A4).
import { fmtBp, fmtCents } from './calc/money.js';
import { tabellenLohnsteuer, tabellenStufe } from './calc/tax.js';
import { MONATE, POSTEN_TYPEN } from './model.js';
import { rueckPlan } from './rueck.js';
import { esc, feldName, fmtWert, renderSlip } from './slip.js';

export const PAGE_W = 794; // A4 bei 96 dpi
export const PAGE_H = 1122;
const PAGE_PAD = 40;

const GRUPPEN = [
  ['Bezüge', (id) => /^[pmfz]:/.test(id) || id === 'gesamtBrutto'],
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
  const postenIds = r.posten
    .filter((p) => p.bereich === 'brutto' || b.netto)
    .flatMap((p) => [`p:${p.id}`, `m:${p.id}`, `f:${p.id}`, `z:${p.id}`].filter((id) => r.weg[id]));
  const ids = [...postenIds, ...REIHENFOLGE.filter(sichtbar)];
  // Bezüge zuerst (Posten, dann Gesamt-Brutto), danach nach fester Reihenfolge
  const ordnung = new Map(ids.map((id, i) => [id, i]));
  return GRUPPEN.map(([gruppe, passt]) => ({
    gruppe,
    felder: ids.filter(passt).sort((a, c) => ordnung.get(a) - ordnung.get(c)).map((id) => ({ id, name: feldName(id, fall) })),
  })).filter((g) => g.felder.length);
}

const eur = (c) => `${fmtCents(c)} €`;

/**
 * Operatoren der automatischen Aufgabentexte. Bei mehreren Teilaufgaben wechseln die Verben (Index i),
 * damit nicht jede Zeile mit „Berechne“ beginnt.
 */
export const OPERATOREN = {
  rechnen: ['Berechne', 'Ermittle', 'Bestimme'],
  ermitteln: ['Ermittle', 'Bestimme', 'Berechne'],
};
const op = (art, i) => OPERATOREN[art][((i % 3) + 3) % 3];

/** Automatischer Text einer Teilaufgabe in der Operator-Form („Berechne …“, „Ermittle …“, „Lies … ab“). `i` = Nummer der Teilaufgabe. */
export function teilText(fall, r, id, i = 0) {
  const k = fall.person.steuerklasse;
  const s = r.saetze;
  const rechne = op('rechnen', i);
  const ermittle = op('ermitteln', i);
  if (/^[mfz]:/.test(id)) {
    const p = r.posten.find((x) => x.id === id.slice(2));
    const n = p?.bezeichnung ?? 'Posten';
    const zuschlag = p && POSTEN_TYPEN[p.typ].art === 'zuschlag';
    if (id[0] === 'f') return `${ermittle} den ${zuschlag ? 'Stundenlohn' : 'Faktor (z. B. Stundenlohn)'} in der Zeile „${n}“ (Betrag : Menge${zuschlag ? ' : Prozentsatz' : ''}).`;
    if (id[0] === 'm') return `${ermittle} die Anzahl der ${p?.einheit === 'Std' ? 'Stunden' : 'Einheiten'} bei „${n}“ (Betrag : Faktor).`;
    return `${ermittle} den Zuschlagssatz bei „${n}“ in Prozent (Betrag : (Menge · Stundenlohn)).`;
  }
  if (id.startsWith('p:')) {
    const p = r.posten.find((x) => `p:${x.id}` === id);
    const art = POSTEN_TYPEN[p?.typ]?.art ?? 'pauschal';
    const n = p?.bezeichnung ?? 'Posten';
    if (art === 'zuschlag') return `${rechne} den Betrag für „${n}“ (Menge · Stundenlohn · Prozentsatz).`;
    if (art === 'menge') return `${rechne} den Betrag für „${n}“ (Menge · Faktor).`;
    return `${ermittle} den Betrag für „${n}“.`;
  }
  const lst =
    fall.steuer.modus === 'tabelle'
      ? `Lies die Lohnsteuer für Steuerklasse ${k} in der Lohnsteuertabelle ab.`
      : fall.steuer.modus === 'prozent'
        ? `${rechne} die Lohnsteuer (${fmtBp(fall.steuer.prozent)} % vom Steuer-Brutto).`
        : `${ermittle} die Lohnsteuer.`;
  const grundlage = (name, kurz) => `${ermittle} die Berechnungsgrundlage der ${name} (${kurz}-Brutto). Beachte die Beitragsbemessungsgrenze.`;
  const beitrag = (name, kurz, bp) => `${rechne} den Beitrag zur ${name} (${fmtBp(bp)} % vom ${kurz}-Brutto).`;
  const texte = {
    gesamtBrutto: `${rechne} das Gesamt-Brutto (Summe aller Bezüge).`,
    stBrutto: `${ermittle} das Steuer-Brutto. Steuerfreie Bezüge (St = F) zählen nicht mit.`,
    kvBrutto: grundlage('Krankenversicherung', 'KV'),
    rvBrutto: grundlage('Rentenversicherung', 'RV'),
    avBrutto: grundlage('Arbeitslosenversicherung', 'AV'),
    pvBrutto: grundlage('Pflegeversicherung', 'PV'),
    lst,
    soli: `${rechne} den Solidaritätszuschlag (5,5 % der Lohnsteuer, sofern die Freigrenze überschritten ist).`,
    kist:
      fall.person.konfession === 'keine'
        ? `${ermittle} die Kirchensteuer. (Keine Konfession.)`
        : `${rechne} die Kirchensteuer (${fmtBp(r.steuerDetail.kistBp)} % der Lohnsteuer).`,
    kv: beitrag('Krankenversicherung', 'KV', s.kv),
    rv: beitrag('Rentenversicherung', 'RV', s.rv),
    av: beitrag('Arbeitslosenversicherung', 'AV', s.av),
    pv: beitrag('Pflegeversicherung', 'PV', s.pv),
    steuerAbzuege: `${rechne} die steuerrechtlichen Abzüge (Lohnsteuer + Solidaritätszuschlag + Kirchensteuer).`,
    svAbzuege: `${rechne} die SV-rechtlichen Abzüge (Summe der vier Sozialversicherungsbeiträge).`,
    netto: `${rechne} den Netto-Verdienst (Gesamt-Brutto minus alle Abzüge).`,
    nettoAbzuege: `${rechne} die Abzüge vom Netto insgesamt.`,
    auszahlung: `${rechne} den Auszahlungsbetrag.`,
    agAnteil: `${rechne} den Arbeitgeberanteil zur Sozialversicherung.`,
    gesamtKosten: `${rechne} die Gesamtkosten für den Arbeitgeber (Brutto plus Arbeitgeberanteil).`,
  };
  return texte[id] ?? `${ermittle} den Wert „${feldName(id, fall)}“.`;
}

export function sachtextAuto(fall, hatGesucht, plan = null) {
  if (plan?.sachtext) return plan.sachtext;
  const p = fall.person;
  const kinder = p.kinder > 0 ? `${p.kinder} ${p.kinder === 1 ? 'Kind' : 'Kinder'}` : 'keine Kinder';
  return `${p.name} arbeitet bei ${fall.firma.name}. Hier ist die Abrechnung für ${MONATE[fall.monat - 1]} ${fall.jahr} (Steuerklasse ${p.steuerklasse}, ${kinder}). ${hatGesucht ? 'Einige Werte fehlen. Ergänze sie.' : 'Lies die Abrechnung genau.'}`;
}

/** Gesuchte Felder (nur die, die es auf dem Zettel gibt) in Lese-Reihenfolge. */
export function gesuchteFelder(fall, r, plan = rueckPlan(fall, r)) {
  const alle = verfuegbareFelder(fall, r).flatMap((g) => g.felder.map((f) => f.id));
  const wahl = new Set(plan ? plan.gesucht : fall.aufgabe.gesucht);
  return alle.filter((id) => wahl.has(id));
}

const buchstabe = (i) => `${String.fromCharCode(97 + (i % 26))})`;

export function teilaufgaben(fall, r, plan = rueckPlan(fall, r)) {
  if (plan?.teile) return plan.teile.map((t, i) => ({ ...t, nr: buchstabe(i), wert: null }));
  return gesuchteFelder(fall, r, plan).map((id, i) => ({
    id,
    nr: buchstabe(i),
    text: plan ? teilText(fall, r, id, i) : fall.aufgabe.texte[id] ?? teilText(fall, r, id, i),
    wert: r.werte[id],
    anzeige: fmtWert(id, r.werte[id], fall),
    weg: r.weg[id]?.text ?? '',
  }));
}

// --- Lohnsteuertabelle und Beiblatt „Abzüge im Überblick“ ---------------------------------------------
/**
 * Ausschnitt der Lohnsteuertabelle (Monat) um die Zeile des Steuer-Brutto: `halbe` Zeilen darüber und darunter.
 * Im Lösungsblatt sind Zeile und Spalte der Steuerklasse markiert. Leer, wenn die Lohnsteuer nicht aus der Tabelle kommt.
 */
export function lohnsteuerTabelle(fall, r, { modus = 'arbeit', halbe = 6 } = {}) {
  const rates = r.rates;
  const k = fall.person.steuerklasse;
  if (fall.steuer.modus === 'prozent') return `<h3>Lohnsteuer</h3><p>Die Lohnsteuer beträgt hier <b>${fmtBp(fall.steuer.prozent)} %</b> vom Steuer-Brutto.</p>`;
  if (fall.steuer.modus !== 'tabelle') return '<h3>Lohnsteuer</h3><p>Die Lohnsteuer richtet sich nach dem Steuertarif, Steuerklasse und Kinderzahl. Sie wird in der Aufgabe angegeben.</p>';
  const mitte = r.steuerDetail.tabelle?.von ?? tabellenStufe(r.stBrutto).von;
  const stufe = 5000;
  // Beim „Probieren“ (gesucht ist das Brutto) steht die Zeile des Ergebnisses nicht in der Mitte: sonst verriete die Tabelle die Lösung
  const versatz = fall.aufgabe.rueck?.typ === 'probieren' ? -3 : 0;
  const reihen = [];
  for (let i = -halbe; i <= halbe; i++) {
    const von = mitte + (i + versatz) * stufe;
    if (von >= 0) reihen.push(von);
  }
  const klassen = [1, 2, 3, 4, 5, 6];
  const kopf = klassen.map((c) => `<th class="r${modus === 'loesung' && c === k ? ' treffer' : ''}">Klasse ${['I', 'II', 'III', 'IV', 'V', 'VI'][c - 1]}</th>`).join('');
  const body = reihen
    .map((von) => {
      const zeile = tabellenLohnsteuer(von, 1, rates, stufe);
      const treffer = modus === 'loesung' && von === mitte;
      const zellen = klassen
        .map((c) => `<td class="r${treffer ? ' treffer' : ''}${modus === 'loesung' && c === k ? ' spalte' : ''}">${fmtCents(tabellenLohnsteuer(von, c, rates, stufe).lohnsteuer)}</td>`)
        .join('');
      return `<tr><td>${fmtCents(zeile.von)} bis ${fmtCents(zeile.bis)}</td>${zellen}</tr>`;
    })
    .join('');
  return `<h3>Lohnsteuertabelle (Monat, Ausschnitt)</h3>
      <table class="mz lst"><thead><tr><th>Steuer-Brutto</th>${kopf}</tr></thead><tbody>${body}</tbody></table>
      <p class="klein">Beträge in Euro. Die Tabelle ist vereinfacht und berücksichtigt keine Kinderfreibeträge.</p>`;
}

/**
 * Beiblatt mit Beitragssätzen, Beitragsbemessungsgrenzen, Soli und Kirchensteuer (und Lohnsteuertabelle).
 * allgemein: Sätze ohne persönliche Zu- und Abschläge (für Mischblätter mit mehreren Personen);
 * tabelle: false lässt die Lohnsteuertabelle weg (steht dann bei den Aufgaben).
 */
export function merkzettel(fall, r, { modus = 'arbeit', allgemein = false, tabelle = true } = {}) {
  const rates = r.rates;
  const zusatz = fall.person.zusatzbeitrag;
  const s = r.saetze;
  const zeilen = [
    ['Krankenversicherung (KV)', `${fmtBp(rates.kvAllgemein * 2)} % + Zusatzbeitrag ${fmtBp(zusatz)} % = ${fmtBp(rates.kvAllgemein * 2 + zusatz)} %`, `${fmtBp(s.kv)} %`],
    ['Rentenversicherung (RV)', `${fmtBp(rates.rv * 2)} %`, `${fmtBp(s.rv)} %`],
    ['Arbeitslosenversicherung (AV)', `${fmtBp(rates.av * 2)} %`, `${fmtBp(s.av)} %`],
    ['Pflegeversicherung (PV)', `${fmtBp(rates.pv * 2)} %`, `${fmtBp(allgemein ? rates.pv : s.pv)} %`],
  ];
  const sv = zeilen.map(([n, ges, an]) => `<tr><td>${esc(n)}</td><td class="r">${esc(ges)}</td><td class="r"><b>${an}</b></td></tr>`).join('');
  const steuer = tabelle ? lohnsteuerTabelle(fall, r, { modus }) : '<h3>Lohnsteuer</h3><p>Die Lohnsteuertabellen stehen bei den Aufgaben.</p>';

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
export const linien = (n) => Array.from({ length: n }, () => '<div class="rz"></div>').join('');

/** Seiten als HTML: Aufgabenblatt (oder nur Zettel) und, wenn gewählt, das Beiblatt. */
export function renderBlatt(fall, r, { modus = 'arbeit', interactive = false } = {}) {
  const plan = rueckPlan(fall, r);
  const gesucht = new Set(gesuchteFelder(fall, r, plan));
  const stempel = modus === 'loesung' ? '<span class="stempel">Lösung</span>' : '';
  const teile = teilaufgaben(fall, r, plan);
  const a = fall.aufgabe;
  const ohneZettel = Boolean(plan?.ohneZettel);
  const slip = ohneZettel
    ? ''
    : renderSlip(fall, r, { interactive: interactive && !plan, compact: true, modus, gesucht, hinweis: 'anklicken: gesucht oder angegeben' });
  let seite;
  if (a.blatt === 'zettel' && !plan) {
    seite = `<section class="page page-zettel" data-seite="blatt">${stempel}<div class="slip-fit">${slip}</div></section>`;
  } else {
    const sach = a.sachtext ?? sachtextAuto(fall, teile.length > 0, plan);
    const eintraege = teile
      .map((t) => {
        const anzeige = t.anzeige ?? eur(t.wert);
        const unten =
          modus === 'loesung'
            ? anzeige || t.weg
              ? `<div class="tloesung"><b>${esc(anzeige)}</b> <span>${esc(t.weg)}</span></div>`
              : ''
            : plan?.versuchstabelle && t.id === 'rueck'
              ? versuche(modus, plan)
              : linien(a.zeilen);
        return `<div class="teil"><span class="tl">${t.nr}</span><div class="tb"><div class="tt">${esc(t.text)}</div>${unten}</div></div>`;
      })
      .join('');
    seite = `<section class="page page-blatt" data-seite="blatt">
      <header class="page-kopf"><div><h1>${esc(a.titel || fall.titel)}</h1>${stempel}</div>
        <div class="felder"><span>Name</span><span>Klasse</span><span>Datum</span></div></header>
      ${plan?.fehler ? `<p class="fehler">${esc(plan.fehler)}</p>` : `<p class="sachtext">${esc(sach)}</p>`}
      ${teile.length ? `<div class="teile${teile.length > 4 && !ohneZettel ? ' zwei' : ''}">${eintraege}</div>` : ''}
      ${modus === 'loesung' && plan?.versuche ? versuche(modus, plan) : ''}
      ${slip ? `<div class="slip-fit">${slip}</div>` : ''}
    </section>`;
  }
  return seite + (a.beiblatt ? merkzettel(fall, r, { modus }) : '');
}

/** Tabelle zum Ausprobieren: leer im Arbeitsblatt, mit den Versuchen der Lösung im Lösungsblatt. */
export function versuche(modus, plan) {
  const zeilen = modus === 'loesung'
    ? plan.versuche.map((v) => `<tr><td class="r">${fmtCents(v.brutto)}</td><td class="r">${fmtCents(v.netto)}</td><td class="r">${v.netto >= plan.ziel ? 'reicht' : 'zu wenig'}</td></tr>`).join('')
    : Array.from({ length: 6 }, () => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('');
  return `<table class="mz versuche"><thead><tr><th class="r">Brutto (€)</th><th class="r">Netto (€)</th><th class="r">Ziel ${fmtCents(plan.ziel)} € erreicht?</th></tr></thead><tbody>${zeilen}</tbody></table>`;
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
