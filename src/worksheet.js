// Arbeitsblatt und Lösungsblatt: Teilaufgaben aus den gesuchten Feldern, Beiblatt „Abzüge im Überblick“, Seitenaufbau (A4).
import { bpOf, fmtBp, fmtCents } from './calc/money.js';
import { effektiverSatz, satzBand, satzTabelle, tabellenLohnsteuer, tabellenStufe } from './calc/tax.js';
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
  // „Sehr einfach“: diese Felder gibt es auf dem Zettel nicht (Steuer-Brutto = Gesamt-Brutto, keine SV-Brutto, kein Soli)
  const NUR_NORMAL = ['stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto', 'soli', 'kumStBrutto', 'kumSvBrutto', 'kumSoli'];
  const sichtbar = (id) => {
    if (fall.anzeige.einfach && NUR_NORMAL.includes(id)) return false;
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

/**
 * Automatischer Text einer Teilaufgabe in einfacher Sprache und in der Operator-Form („Berechne …“, „Ermittle …“, „Lies … ab“).
 * Kurze Sätze; der Rechenweg steht als Hinweis dabei. `i` = Nummer der Teilaufgabe (für den Wechsel der Verben).
 */
export function teilText(fall, r, id, i = 0) {
  const einfach = Boolean(fall.anzeige.einfach);
  const k = fall.person.steuerklasse;
  const s = r.saetze;
  const rechne = op('rechnen', i);
  const ermittle = op('ermitteln', i);
  const brutto = (kurz) => (einfach ? 'Brutto' : `${kurz}-Brutto`);
  if (/^[mfz]:/.test(id)) {
    const p = r.posten.find((x) => x.id === id.slice(2));
    const n = p?.bezeichnung ?? 'Posten';
    const zuschlag = p && POSTEN_TYPEN[p.typ].art === 'zuschlag';
    if (id[0] === 'f') return `${ermittle} den ${zuschlag ? 'Stundenlohn' : 'Faktor (zum Beispiel den Stundenlohn)'} bei „${n}“. Rechne: Betrag : Menge${zuschlag ? ' : Prozentsatz' : ''}.`;
    if (id[0] === 'm') return `${ermittle} die Anzahl der ${p?.einheit === 'Std' ? 'Stunden' : 'Einheiten'} bei „${n}“. Rechne: Betrag : Faktor.`;
    return `${ermittle} den Zuschlag bei „${n}“ in Prozent. Rechne: Betrag : (Menge · Stundenlohn).`;
  }
  if (id.startsWith('p:')) {
    const p = r.posten.find((x) => `p:${x.id}` === id);
    const art = POSTEN_TYPEN[p?.typ]?.art ?? 'pauschal';
    const n = p?.bezeichnung ?? 'Posten';
    if (art === 'zuschlag') return `${rechne} den Betrag für „${n}“. Rechne: Menge · Stundenlohn · Prozentsatz.`;
    if (art === 'menge') return `${rechne} den Betrag für „${n}“. Rechne: Menge · Faktor.`;
    return `${ermittle} den Betrag für „${n}“.`;
  }
  const satz = fmtBp(fall.steuer.prozent);
  const lst =
    fall.steuer.modus === 'tabelle'
      ? `Lies die Lohnsteuer für Steuerklasse ${k} in der Lohnsteuertabelle ab. Suche die Zeile mit dem Brutto.`
      : fall.steuer.modus === 'prozent'
        ? fall.aufgabe.satzAblesen
          ? `${ermittle} den Steuersatz in der Tabelle auf dem Beiblatt (Steuerklasse ${k}, Zeile mit dem Brutto). Berechne damit die Lohnsteuer: ${einfach ? 'Brutto' : 'Steuer-Brutto'} · Steuersatz.`
          : `${rechne} die Lohnsteuer. Der Steuersatz ist ${satz} %. Rechne ${satz} % vom ${einfach ? 'Brutto' : 'Steuer-Brutto'}.`
        : `${ermittle} die Lohnsteuer.`;
  const grundlage = (name, kurz) => `${ermittle} das ${kurz}-Brutto. Von diesem Betrag wird der Beitrag zur ${name} berechnet. Bei hohem Gehalt gibt es eine Obergrenze.`;
  const beitrag = (name, kurz, bp) => `${rechne} den Beitrag zur ${name}. Rechne ${fmtBp(bp)} % vom ${brutto(kurz)}.`;
  const texte = {
    gesamtBrutto: `${rechne} das Gesamt-Brutto. Zähle alle Beträge zusammen.`,
    stBrutto: `${ermittle} das Steuer-Brutto. Steuerfreie Beträge (St = F) zählst du nicht mit.`,
    kvBrutto: grundlage('Krankenversicherung', 'KV'),
    rvBrutto: grundlage('Rentenversicherung', 'RV'),
    avBrutto: grundlage('Arbeitslosenversicherung', 'AV'),
    pvBrutto: grundlage('Pflegeversicherung', 'PV'),
    lst,
    soli: `${rechne} den Solidaritätszuschlag. Er beträgt 5,5 % von der Lohnsteuer. Ist die Lohnsteuer klein, fällt er weg.`,
    kist:
      fall.person.konfession === 'keine'
        ? `${ermittle} die Kirchensteuer. Hier gibt es keine Konfession, also fällt sie weg.`
        : `${rechne} die Kirchensteuer. Sie beträgt ${fmtBp(r.steuerDetail.kistBp)} % von der Lohnsteuer.`,
    kv: beitrag('Krankenversicherung', 'KV', s.kv),
    rv: beitrag('Rentenversicherung', 'RV', s.rv),
    av: beitrag('Arbeitslosenversicherung', 'AV', s.av),
    pv: beitrag('Pflegeversicherung', 'PV', s.pv),
    steuerAbzuege: `${rechne} die Abzüge für Steuern. Rechne: Lohnsteuer + ${einfach ? '' : 'Soli + '}Kirchensteuer.`,
    svAbzuege: `${rechne} die Abzüge für die Sozialversicherung. Zähle die vier Beiträge zusammen.`,
    netto: `${rechne} den Netto-Verdienst. Rechne: Brutto − alle Abzüge.`,
    nettoAbzuege: `${rechne} die Abzüge vom Netto. Zähle sie zusammen.`,
    auszahlung: `${rechne} den Auszahlungsbetrag. Das ist das Geld, das auf dem Konto ankommt.`,
    agAnteil: `${rechne} den Teil des Chefs an der Sozialversicherung.`,
    gesamtKosten: `${rechne}, was die Person den Betrieb insgesamt kostet. Rechne: Brutto + Teil des Chefs.`,
  };
  return texte[id] ?? `${ermittle} den Wert „${feldName(id, fall)}“.`;
}

export function sachtextAuto(fall, hatGesucht, plan = null) {
  if (plan?.sachtext) return plan.sachtext;
  const p = fall.person;
  const kinder = p.kinder > 0 ? `${p.kinder} ${p.kinder === 1 ? 'Kind' : 'Kinder'}` : 'keine Kinder';
  return `${p.name} arbeitet bei ${fall.firma.name}. Das ist die Abrechnung für ${MONATE[fall.monat - 1]} ${fall.jahr}. Steuerklasse ${p.steuerklasse}, ${kinder}. ${hatGesucht ? 'Einige Werte fehlen. Trage sie ein.' : 'Lies die Abrechnung genau.'}`;
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

// --- Lohnsteuertabelle, Steuersatz-Tabelle und Beiblatt „Abzüge im Überblick“ -------------------------
const KLASSEN_NAME = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * Kleine Tabelle: Steuersatz in Prozent nach Brutto-Band (Zeilen: von … bis unter …) und Steuerklasse (Spalten).
 * Im Lösungsblatt sind die Spalte der Steuerklasse und das Band des Brutto markiert.
 */
export function satzTabelleHtml(fall, r, { modus = 'arbeit' } = {}) {
  const t = satzTabelle(r.rates);
  const k = fall.person.steuerklasse;
  const band = satzBand(r.gesamtBrutto).von;
  const loesung = modus === 'loesung';
  const kopf = t.klassen.map((c) => `<th class="r${loesung && c === k ? ' treffer' : ''}">Klasse ${KLASSEN_NAME[c - 1]}</th>`).join('');
  const body = t.zeilen
    .map((z) => {
      const treffer = loesung && z.von === band;
      const zellen = z.saetze
        .map((bp, i) => `<td class="r${treffer ? ' treffer' : ''}${loesung && t.klassen[i] === k ? ' spalte' : ''}">${fmtBp(bp)} %</td>`)
        .join('');
      return `<tr><td>${fmtCents(z.von)} € bis unter ${fmtCents(z.bis)} €</td>${zellen}</tr>`;
    })
    .join('');
  return `<h3>Steuersatz nach Brutto und Steuerklasse</h3>
      <table class="mz lst"><thead><tr><th>Brutto im Monat</th>${kopf}</tr></thead><tbody>${body}</tbody></table>
      <p class="klein">So viel Prozent vom Brutto gehen als Lohnsteuer ab (gerundet auf eine Nachkommastelle). Such die Zeile, in der das Brutto liegt. Je mehr Brutto, desto höher der Satz.</p>`;
}

/**
 * Ausschnitt der Lohnsteuertabelle (Monat) um die Zeile des Steuer-Brutto: `halbe` Zeilen darüber und darunter.
 * Im Lösungsblatt sind Zeile und Spalte der Steuerklasse markiert. Bei festem Steuersatz: die Satz-Tabelle,
 * wenn die Schüler den Satz ablesen sollen, sonst nichts.
 */
export function lohnsteuerTabelle(fall, r, { modus = 'arbeit', halbe = 6 } = {}) {
  const rates = r.rates;
  const k = fall.person.steuerklasse;
  if (fall.steuer.modus === 'prozent') return fall.aufgabe.satzAblesen ? satzTabelleHtml(fall, r, { modus }) : '';
  if (fall.steuer.modus !== 'tabelle') return '<h3>Lohnsteuer</h3><p>Die Lohnsteuer hängt vom Gehalt, von der Steuerklasse und von den Kindern ab. Sie wird in der Aufgabe genannt.</p>';
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
  const kopf = klassen.map((c) => `<th class="r${modus === 'loesung' && c === k ? ' treffer' : ''}">Klasse ${KLASSEN_NAME[c - 1]}</th>`).join('');
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
      <table class="mz lst"><thead><tr><th>Brutto</th>${kopf}</tr></thead><tbody>${body}</tbody></table>
      <p class="klein">Beträge in Euro. Suche die Zeile mit dem Brutto und die Spalte mit der Steuerklasse.</p>`;
}

const WOFUER = {
  kv: 'Arzt und Krankenhaus',
  rv: 'Rente im Alter',
  av: 'Geld bei Arbeitslosigkeit',
  pv: 'Hilfe bei Pflege',
};

/**
 * Beiblatt „Abzüge im Überblick“: erklärt in einfacher Sprache, was abgezogen wird, mit Rechenbeispielen.
 * allgemein: Sätze ohne persönliche Zu- und Abschläge (für Mischblätter mit mehreren Personen);
 * tabelle: false lässt die Lohnsteuertabelle weg (steht dann bei den Aufgaben).
 * „Sehr einfach“ lässt Obergrenzen und Soli weg.
 */
export function merkzettel(fall, r, { modus = 'arbeit', allgemein = false, tabelle = true } = {}) {
  const rates = r.rates;
  const einfach = Boolean(fall.anzeige.einfach);
  const s = r.saetze;
  const bsp = 200000; // Beispiel: 2.000 € Brutto
  const bspSatz = effektiverSatz(bsp, fall.person.steuerklasse, rates); // Satz der Tabelle für dieses Brutto
  const von = (bp) => `${fmtCents(bp)} €`;
  const zeilen = [
    ['kv', 'Krankenversicherung (KV)', `${fmtBp(rates.kvAllgemein * 2 + fall.person.zusatzbeitrag)} %`, `${fmtBp(s.kv)} %`],
    ['rv', 'Rentenversicherung (RV)', `${fmtBp(rates.rv * 2)} %`, `${fmtBp(s.rv)} %`],
    ['av', 'Arbeitslosenversicherung (AV)', `${fmtBp(rates.av * 2)} %`, `${fmtBp(s.av)} %`],
    ['pv', 'Pflegeversicherung (PV)', `${fmtBp(rates.pv * 2)} %`, `${fmtBp(allgemein ? rates.pv : s.pv)} %`],
  ];
  const sv = zeilen
    .map(([k, n, ges, an]) => `<tr><td>${esc(n)}</td><td>${esc(WOFUER[k])}</td><td class="r">${esc(ges)}</td><td class="r"><b>${an}</b></td></tr>`)
    .join('');

  let steuer;
  if (fall.steuer.modus === 'prozent') {
    steuer = `<p>Die <b>Lohnsteuer</b> bekommt der Staat. In diesen Aufgaben rechnen wir mit einem <b>festen Steuersatz</b>.</p>
      <p class="formel">Lohnsteuer = Brutto · Steuersatz</p>
      <p><b>Beispiel:</b> Brutto 2.000 €, Steuersatz ${fmtBp(bspSatz)} %. Rechnung: 2.000 € · ${fmtBp(bspSatz)} % = <b>${von(bpOf(bsp, bspSatz))}</b>.</p>
      ${satzTabelleHtml(fall, r, { modus })}`;
  } else if (fall.steuer.modus === 'tabelle') {
    steuer = `<p>Die <b>Lohnsteuer</b> bekommt der Staat. Wie viel es ist, hängt vom Brutto und von der Steuerklasse ab. Du liest sie in der Tabelle ab.</p>
      ${tabelle ? lohnsteuerTabelle(fall, r, { modus, halbe: 4 }) : '<p>Die Lohnsteuertabellen stehen bei den Aufgaben.</p>'}`;
  } else {
    steuer = '<p>Die <b>Lohnsteuer</b> bekommt der Staat. Sie hängt vom Gehalt, von der Steuerklasse und von den Kindern ab. In der Aufgabe wird sie genannt.</p>';
  }
  const soli = !einfach && (fall.steuer.modus !== 'prozent' || fall.steuer.soli)
    ? `<p><b>Soli</b> (Solidaritätszuschlag): ${fmtBp(rates.soliSatz)} % von der Lohnsteuer. Bei kleiner Lohnsteuer fällt er weg.</p>`
    : '';
  const kistBp = rates.kistSatz[fall.person.kirchensteuersatz];
  const kistBeispiel = bpOf(30000, kistBp);

  return `<section class="page page-bei" data-seite="beiblatt">
    <header class="page-kopf"><div><h1>Was wird abgezogen? ${rates.jahr}</h1>${modus === 'loesung' ? '<span class="stempel">Lösung</span>' : ''}</div></header>
    <h3>1 · Brutto und Netto</h3>
    <p><b>Brutto</b> ist das Geld, bevor etwas abgezogen wird. <b>Netto</b> bleibt übrig, wenn alle Abzüge weg sind.</p>
    <p class="formel">Netto = Brutto − Steuern − Sozialabgaben</p>
    <h3>2 · Sozialabgaben</h3>
    <p>Mit den Sozialabgaben ist man gegen Krankheit, im Alter, bei Arbeitslosigkeit und bei Pflege abgesichert. Jede Abgabe ist ein <b>Prozentsatz vom ${einfach ? 'Brutto' : 'Brutto (KV-, RV-, AV- oder PV-Brutto)'}</b>. Der Chef zahlt die Hälfte. Du zahlst deinen Teil.</p>
    <table class="mz"><thead><tr><th>Versicherung</th><th>Wofür?</th><th class="r">Zusammen</th><th class="r">Dein Teil</th></tr></thead><tbody>${sv}</tbody></table>
    <p><b>Beispiel:</b> Brutto 2.000 €, Rentenversicherung ${fmtBp(rates.rv)} %. Rechnung: 2.000 € · ${fmtBp(rates.rv)} % = <b>${von(bpOf(bsp, rates.rv))}</b>. <span class="klein">(Tipp: ${fmtBp(rates.rv)} % = ${fmtBp(rates.rv)} : 100 = ${(rates.rv / 10000).toString().replace('.', ',')}.)</span></p>
    <p class="klein">Pflegeversicherung: Wer keine Kinder hat und mindestens 23 Jahre alt ist, zahlt ${fmtBp(rates.pvKinderlosZuschlag)} % mehr. Ab dem 2. Kind gibt es ${fmtBp(rates.pvAbschlagProKind)} % weniger je Kind.</p>
    ${einfach ? '' : `<p><b>Obergrenze:</b> Bei sehr hohem Gehalt wird nicht alles verrechnet. Für KV und PV zählen höchstens ${eur(rates.bbgKv)} im Monat, für RV und AV höchstens ${eur(rates.bbgRv)}.</p>`}
    <h3>3 · Steuern</h3>
    ${steuer}
    ${soli}
    <p><b>Kirchensteuer:</b> Nur wer in der Kirche ist (ev oder rk), zahlt sie. Sie beträgt ${fmtBp(kistBp)} % von der Lohnsteuer. Beispiel: Lohnsteuer 300 € · ${fmtBp(kistBp)} % = <b>${von(kistBeispiel)}</b>.</p>
    <p class="klein"><b>Steuerklassen:</b> I = ledig. II = alleinerziehend. III und V = verheiratet (einer zahlt weniger, der andere mehr). IV = verheiratet mit ähnlichem Verdienst. VI = zweite Arbeitsstelle.</p>
    <h3>4 · So kommt das Netto heraus</h3>
    <ol class="schritte"><li>Rechne das Brutto aus.</li><li>Ziehe die Steuern ab.</li><li>Ziehe die vier Sozialabgaben ab.</li><li>Das Ergebnis ist das Netto.</li></ol>
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

/** Zoom der Vorschau: breit genug für die Spalte; bei drei Spalten (ab 1100 px) passt die ganze Seite in die Höhe. */
export function ganzeSeiteZoom(preview, host) {
  let zoom = (preview.clientWidth - 24) / PAGE_W;
  if (matchMedia('(min-width: 1100px)').matches) {
    const oben = host.getBoundingClientRect().top - preview.getBoundingClientRect().top + preview.scrollTop;
    zoom = Math.min(zoom, (preview.clientHeight - oben - 12) / PAGE_H);
  }
  return Math.min(1.3, Math.max(0.3, zoom));
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
