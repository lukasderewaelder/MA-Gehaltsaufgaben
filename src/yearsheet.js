// Jahresübersicht als Blatt: Tabelle der zwölf Monate mit Lücken, Diagramm, Steuerklassen- und Paarvergleich, Teilaufgaben.
import { fmtBp, fmtCents } from './calc/money.js';
import { SPALTEN, jahresRechnung, klassenvergleich, paarvergleich } from './calc/year.js';
import { berechne } from './calc/payroll.js';
import { MONATE } from './model.js';
import { esc } from './slip.js';
import { renderBlatt } from './worksheet.js';

const KURZ = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const eur = (c) => `${fmtCents(c)} €`;
const KLASSEN_NAME = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** Wert oder Lücke: leer im Arbeitsblatt, grün im Lösungsblatt. */
const zelle = (text, luecke, modus) =>
  luecke ? (modus === 'arbeit' ? '<span class="val luecke">&nbsp;</span>' : `<span class="val loesung">${text}</span>`) : text;

function sonderMonat(fall) {
  return fall.posten.some((p) => p.st === 'S' || p.sv === 'S') ? fall.monat : null;
}

/** Diagramm: je Monat ein Balken aus Netto (unten) und Abzügen (oben), Höhe = Brutto. */
export function diagramm(j) {
  const W = 714;
  const H = 140;
  const links = 8;
  const unten = 22;
  const hoch = H - unten - 8;
  const max = Math.max(...j.zeilen.map((z) => z.werte.brutto), 1);
  const breite = (W - links) / 12;
  const balken = j.zeilen
    .map((z, i) => {
      const x = links + i * breite + breite * 0.15;
      const w = breite * 0.7;
      const hn = Math.round((z.werte.netto / max) * hoch);
      const hb = Math.round((z.werte.brutto / max) * hoch);
      const y0 = H - unten;
      return `<rect x="${x.toFixed(1)}" y="${y0 - hn}" width="${w.toFixed(1)}" height="${hn}" fill="#2563eb"/>
        <rect x="${x.toFixed(1)}" y="${y0 - hb}" width="${w.toFixed(1)}" height="${hb - hn}" fill="#f59e0b"/>
        <text x="${(x + w / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="11" fill="#111827">${KURZ[i]}</text>`;
    })
    .join('');
  const beschreibung = `Balkendiagramm: Brutto je Monat, aufgeteilt in Netto und Abzüge. Höchstes Brutto: ${eur(max)}.`;
  return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(beschreibung)}" xmlns="http://www.w3.org/2000/svg">
    <title>Brutto, Netto und Abzüge je Monat</title>
    ${balken}
    <line x1="${links}" y1="${H - unten}" x2="${W}" y2="${H - unten}" stroke="#111827" stroke-width="1"/>
    <rect x="${W - 190}" y="4" width="10" height="10" fill="#2563eb"/><text x="${W - 175}" y="13" font-size="11" fill="#111827">Netto</text>
    <rect x="${W - 120}" y="4" width="10" height="10" fill="#f59e0b"/><text x="${W - 105}" y="13" font-size="11" fill="#111827">Steuern und Sozialabgaben</text>
  </svg>`;
}

function tabelle(j, modus, l) {
  const kopf = `<tr><th>Monat</th>${SPALTEN.map(([, t]) => `<th class="r">${t}</th>`).join('')}</tr>`;
  const zeilen = j.zeilen
    .map(
      (z) => `<tr><td>${MONATE[z.monat - 1]}</td>${SPALTEN.map(([k]) => `<td class="r">${zelle(fmtCents(z.werte[k]), k === 'netto' && l.netto, modus)}</td>`).join('')}</tr>`,
    )
    .join('');
  const summe = `<tr class="summe"><td>Summe</td>${SPALTEN.map(([k]) => `<td class="r">${zelle(fmtCents(j.summe[k]), l.summen || (k === 'netto' && l.netto), modus)}</td>`).join('')}</tr>`;
  const schnitt = `<tr class="summe"><td>Ø je Monat</td>${SPALTEN.map(([k]) => `<td class="r">${zelle(fmtCents(j.durchschnitt[k]), l.durchschnitt || (k === 'netto' && l.netto), modus)}</td>`).join('')}</tr>`;
  const quote = `<tr class="quote"><td>Anteil am Brutto</td>${SPALTEN.map(([k]) => `<td class="r">${zelle(`${fmtBp(j.quoten[k])} %`, l.quoten, modus)}</td>`).join('')}</tr>`;
  return `<table class="jahrtab"><thead>${kopf}</thead><tbody>${zeilen}</tbody><tfoot>${summe}${schnitt}${quote}</tfoot></table>`;
}

function vergleichTabelle(fall, modus) {
  const jb = fall.jahresblatt;
  const ersteSpalte = jb.vergleich === 'klassen' ? 'Steuerklasse' : 'Steuerklassen (Person / Partner)';
  const zeilen =
    jb.vergleich === 'klassen'
      ? klassenvergleich(fall).map((x) => ({ name: `${KLASSEN_NAME[x.klasse - 1]}${x.klasse === fall.person.steuerklasse ? ' (aktuell)' : ''}`, ...x }))
      : paarvergleich(fall, jb.partner).map((x) => ({ name: x.label, ...x }));
  const body = zeilen
    .map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${fmtCents(x.brutto)}</td><td class="r">${fmtCents(x.steuer)}</td><td class="r">${fmtCents(x.sv)}</td><td class="r">${zelle(fmtCents(x.netto), true, modus)}</td></tr>`)
    .join('');
  const titel = jb.vergleich === 'klassen' ? 'Steuerklassenvergleich (Jahr)' : `Ehepaar im Vergleich (Jahr) – Partner/in verdient ${eur(jb.partner)} im Monat`;
  return `<h3>${titel}</h3><table class="jahrtab vergleich"><thead><tr><th>${ersteSpalte}</th><th class="r">Brutto</th><th class="r">Steuern</th><th class="r">Sozialabgaben</th><th class="r">Netto</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** Teilaufgaben mit Lösungstext. */
export function jahrTeilaufgaben(fall, j) {
  const l = fall.jahresblatt.luecken;
  const teile = [];
  const sm = sonderMonat(fall);
  const bestes = (liste, key) => liste.reduce((a, b) => (b[key] > a[key] ? b : a));
  if (l.netto) teile.push({ text: 'Berechne für jeden Monat das Netto (Brutto minus alle Abzüge).', loesung: `Netto im Jahr: ${eur(j.summe.netto)}` });
  if (l.summen) teile.push({ text: 'Berechne die Jahressummen jeder Spalte.', loesung: `Jahresbrutto ${eur(j.summe.brutto)}, Jahresnetto ${eur(j.summe.netto)}` });
  if (l.durchschnitt) teile.push({ text: 'Berechne den Durchschnitt je Monat (Jahressumme : 12).', loesung: `Netto im Durchschnitt: ${eur(j.durchschnitt.netto)} je Monat` });
  if (l.quoten) {
    const sv = j.quoten.kv + j.quoten.rv + j.quoten.av + j.quoten.pv;
    const st = j.quoten.lst + j.quoten.soli + j.quoten.kist;
    teile.push({
      text: 'Wie viel Prozent vom Jahresbrutto bleiben netto übrig, wie viel gehen an Steuern und an die Sozialversicherung? (auf 0,1 % genau)',
      loesung: `Netto ${fmtBp(j.quoten.netto)} %, Steuern ${fmtBp(st)} %, Sozialversicherung ${fmtBp(sv)} %`,
    });
  }
  if (sm) {
    teile.push({ text: `Warum sind Brutto und Abzüge im ${MONATE[sm - 1]} höher als in den anderen Monaten? Lies im Diagramm nach.`, loesung: 'Es gibt eine Sonderzahlung; sie wird zusätzlich versteuert und verbeitragt (bis zur Beitragsbemessungsgrenze).' });
  }
  if (fall.jahresblatt.vergleich === 'klassen') {
    const v = klassenvergleich(fall);
    const b = bestes(v, 'netto');
    teile.push({ text: 'Vergleiche das Jahres-Netto in den Steuerklassen. Welche Klasse ist für diese Person am günstigsten?', loesung: `Klasse ${KLASSEN_NAME[b.klasse - 1]}: ${eur(b.netto)} netto im Jahr` });
  } else if (fall.jahresblatt.vergleich === 'paar') {
    const v = paarvergleich(fall, fall.jahresblatt.partner);
    const b = bestes(v, 'netto');
    teile.push({ text: 'Berechne für jede Kombination das gemeinsame Netto. Welche Kombination zahlt im Jahr am wenigsten Steuern?', loesung: `Höchstes gemeinsames Netto: ${b.label} mit ${eur(b.netto)}` });
  }
  return teile;
}

const linien = (n) => Array.from({ length: n }, () => '<div class="rz"></div>').join('');

/** Seite der Jahresübersicht. modus: 'arbeit' | 'loesung'. */
export function renderJahr(fall, modus = 'arbeit') {
  const j = jahresRechnung(fall);
  const jb = fall.jahresblatt;
  const l = jb.luecken;
  const stempel = modus === 'loesung' ? '<span class="stempel">Lösung</span>' : '';
  const sm = sonderMonat(fall);
  const sach = `${fall.person.name} arbeitet bei ${fall.firma.name}. Die Tabelle zeigt alle zwölf Monate des Jahres ${fall.jahr}${sm ? ` (mit Sonderzahlung im ${MONATE[sm - 1]})` : ''}. Ergänze die fehlenden Werte.`;
  const teile = jahrTeilaufgaben(fall, j)
    .map(
      (t, i) => `<div class="teil"><span class="tl">${String.fromCharCode(97 + (i % 26))})</span><div class="tb"><div class="tt">${esc(t.text)}</div>${
        modus === 'loesung' ? `<div class="tloesung"><b>${esc(t.loesung)}</b></div>` : linien(1)
      }</div></div>`,
    )
    .join('');
  const zeigeDiagramm = jb.diagramm && !(modus === 'arbeit' && l.netto);
  return `<section class="page page-jahr" data-seite="jahr">
    <header class="page-kopf"><div><h1>${esc(jb.titel || `Jahresübersicht ${fall.jahr}`)}</h1>${stempel}</div>
      <div class="felder"><span>Name</span><span>Klasse</span><span>Datum</span></div></header>
    <p class="sachtext">${esc(sach)}</p>
    ${tabelle(j, modus, l)}
    ${zeigeDiagramm ? diagramm(j) : ''}
    ${jb.vergleich !== 'aus' ? vergleichTabelle(fall, modus) : ''}
    ${teile ? `<div class="teile">${teile}</div>` : ''}
  </section>`;
}

/** Alle Seiten einer Ansicht: 'arbeit' | 'loesung' (Monatszettel mit Aufgaben) oder 'jahr-arbeit' | 'jahr-loesung'. */
export function renderSeiten(fall, { modus = 'arbeit', interactive = false } = {}) {
  if (modus.startsWith('jahr-')) return renderJahr(fall, modus.slice(5));
  return renderBlatt(fall, berechne(fall), { modus, interactive });
}
