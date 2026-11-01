// Kassenzettel als Blatt: der Bon selbst, Arbeits- und Lösungsblatt, Beiblatt „So liest du einen Kassenzettel“.
// TSE, Seriennummern und Prüfwerte fehlen bewusst: es ist ein Übungsbeleg.
import { SAETZE, bonGesucht, bonSachtext, bonTeile, bruttoTeiler, rechneBon, satzText } from './calc/bon.js';
import { bpOf, fmtBp, fmtCents, mul } from './calc/money.js';
import { def, esc } from './slip.js';

const linien = (n) => Array.from({ length: n }, () => '<div class="rz"></div>').join('');

/** Bon als HTML. modus: 'zettel' (alles sichtbar), 'arbeit' (gesuchte Werte leer), 'loesung' (gesuchte Werte grün). */
export function renderBonZettel(bon, r, { modus = 'zettel', interactive = false } = {}) {
  const gesucht = new Set(bonGesucht(bon, r).map((f) => f.id));
  const val = (id, cents) => {
    const hat = gesucht.has(id);
    const knopf = interactive && r.werte[id] !== undefined ? ` data-feld="${esc(id)}" role="button" tabindex="0" title="Antippen: gesucht oder angegeben"` : '';
    if (hat && modus === 'arbeit') return `<span class="val luecke"${knopf}></span>`;
    return `<span class="val${hat && modus === 'loesung' ? ' loesung' : ''}"${knopf}>${fmtCents(cents)}</span>`;
  };
  const zeile = (z) => {
    if (r.einfach) return `<div class="bz"><span>${z.menge > 1 ? `${z.menge} x ` : ''}${esc(z.name)}</span><span class="bw">${val(`z:${z.id}`, z.betrag)} ${z.satz}</span></div>`;
    if (z.menge > 1) {
      return `<div class="bz"><span>${esc(z.name)}</span></div>
        <div class="bz bz-menge"><span>${z.menge} x ${fmtCents(z.preis)}</span><span class="bw">${val(`z:${z.id}`, z.betrag)} ${z.satz}</span></div>`;
    }
    return `<div class="bz"><span>${esc(z.name)}</span><span class="bw">${val(`z:${z.id}`, z.betrag)} ${z.satz}</span></div>`;
  };
  const artikel = r.zeilen.filter((z) => z.art !== 'pfand').map(zeile).join('');
  const pfand = r.zeilen.filter((z) => z.art === 'pfand').map(zeile).join('');
  const nettoPreise = bon.basis === 'netto';
  const rabatt = r.rabattBp ? `<div class="bz"><span>Rabatt ${fmtBp(r.rabattBp)} %</span><span class="bw">-${val('rabatt', r.rabatt)}</span></div>` : '';
  const tabelle = r.saetze
    .map((s) => `<tr><td>${s.buchstabe} ${fmtBp(s.bp)} %</td><td class="r">${val(`netto:${s.buchstabe}`, s.netto)}</td><td class="r">${val(`mwst:${s.buchstabe}`, s.mwst)}</td><td class="r">${val(`brutto:${s.buchstabe}`, s.brutto)}</td></tr>`)
    .join('');
  return `<div class="bon">
    <div class="bon-kopf"><b>${esc(bon.laden)}</b>${r.einfach ? '' : `<br>${esc(bon.strasse)}<br>${esc(bon.ort)}`}</div>
    <div class="bz bon-spalte"><span>${nettoPreise ? 'Preise ohne MwSt.' : ''}</span><span>EUR</span></div>
    ${artikel}${rabatt}${pfand}
    <div class="bon-linie"></div>
    <div class="bz bon-summe"><span>SUMME</span><span class="bw">${val('summe', r.summe)}</span></div>
    ${r.gegeben ? `<div class="bz"><span>gegeben</span><span class="bw">${fmtCents(r.gegeben)}</span></div>` : ''}
    ${r.mitRueckgeld ? `<div class="bz"><span>Rückgeld</span><span class="bw">${val('rueckgeld', r.rueckgeld)}</span></div>` : ''}
    <div class="bon-linie"></div>
    <table class="bon-mwst"><thead><tr><th>Satz</th><th class="r">Netto</th><th class="r">MwSt.</th><th class="r">Brutto</th></tr></thead><tbody>${tabelle}</tbody></table>
    ${r.einfach ? '' : `<div class="bon-fuss">${esc(bon.datum)} ${esc(bon.uhrzeit)} · Bon ${esc(bon.bonNr)}</div>`}
    <div class="bon-fuss">Übungsbeleg, kein echter Kassenbeleg</div>
  </div>`;
}

function renderBonBlatt(bon, r, { modus, interactive }) {
  const a = bon.aufgabe;
  const stempel = modus === 'loesung' ? '<span class="stempel">Lösung</span>' : '';
  const kopf = `<header class="page-kopf"><div><h1>${esc(a.titel || bon.titel)}</h1>${stempel}</div><div class="felder"><span>Name</span><span>Klasse</span><span>Datum</span></div></header>`;
  const bonHtml = renderBonZettel(bon, r, { modus, interactive });
  if (a.blatt === 'zettel') return `<section class="page page-bon" data-seite="blatt">${kopf}<div class="bon-mitte">${bonHtml}</div></section>`;
  const teile = bonTeile(bon, r)
    .map(
      (t) => `<div class="teil"><span class="tl">${esc(t.nr)}</span><div class="tb"><div class="tt">${esc(t.text)}</div>${
        modus === 'loesung' ? `<div class="tloesung"><b>${esc(t.wert)}</b> <span>${esc(t.weg)}</span></div>` : linien(a.zeilen)
      }</div></div>`,
    )
    .join('');
  return `<section class="page page-bon" data-seite="blatt">
    ${kopf}
    <p class="sachtext">${esc(a.sachtext ?? bonSachtext(bon))}</p>
    <div class="bon-reihe">${bonHtml}<div class="teile">${teile}</div></div>
  </section>`;
}

export function bonBeiblatt(bon) {
  const beispiel = 10000;
  const netto = mul(beispiel, 10000, 11900);
  const stNetto = bpOf(beispiel, SAETZE.A);
  return `<section class="page page-bei" data-seite="beiblatt">
    <header class="page-kopf"><div><h1>So liest du einen Kassenzettel</h1></div></header>
    <h3>1 · Was ist die Mehrwertsteuer?</h3>
    <p>Die <b>Mehrwertsteuer</b> (MwSt.) ist eine Steuer auf das, was du kaufst. Der Laden gibt sie an den Staat weiter.</p>
    <p><b>Netto</b> ist der Preis ohne MwSt. <b>Brutto</b> ist der Preis mit MwSt. Das Brutto bezahlst du an der Kasse.</p>
    <p class="formel">Brutto = Netto + MwSt.</p>
    <h3>2 · Die zwei Steuersätze</h3>
    <table class="mz"><thead><tr><th>Buchstabe</th><th class="r">Steuersatz</th><th>Das gilt zum Beispiel für</th></tr></thead><tbody>
      <tr><td>A</td><td class="r"><b>${satzText('A')}</b></td><td>Getränke, Seife, Waschmittel, Werkzeug, Schreibwaren</td></tr>
      <tr><td>B</td><td class="r"><b>${satzText('B')}</b></td><td>Lebensmittel, Bücher, Zeitschriften</td></tr>
    </tbody></table>
    <p>Hinter jedem Preis steht ein Buchstabe. Er sagt dir, welcher Satz gilt.</p>
    <h3>3 · Netto ist gegeben</h3>
    <p class="formel">MwSt. = Netto · Steuersatz</p>
    ${def('Beispiel', `<p>Netto 100,00 €, Steuersatz ${satzText('A')}</p>`, `<p class="rechnung">MwSt.: 100,00 € · ${satzText('A')} = <b>${fmtCents(stNetto)} €</b></p>`, `<p class="rechnung">Brutto: 100,00 € + ${fmtCents(stNetto)} € = <b>${fmtCents(beispiel + stNetto)} €</b></p>`)}
    <h3>4 · Brutto ist gegeben</h3>
    <p class="formel">Netto = Brutto : ${bruttoTeiler('A')} (bei ${satzText('A')}) oder Brutto : ${bruttoTeiler('B')} (bei ${satzText('B')})</p>
    ${def('Beispiel', `<p>Brutto 100,00 €, Steuersatz ${satzText('A')}</p>`, `<p class="rechnung">Netto: 100,00 € : ${bruttoTeiler('A')} = <b>${fmtCents(netto)} €</b></p>`, `<p class="rechnung">MwSt.: 100,00 € − ${fmtCents(netto)} € = <b>${fmtCents(beispiel - netto)} €</b></p>`)}
    ${def('Achtung', `<p>Rechne nicht ${satzText('A')} vom Brutto. Das Brutto ist schon mehr als 100 %.</p>`)}
    <h3>5 · Rabatt, Pfand und Rückgeld</h3>
    ${def('Rabatt', '<p>Ein Teil vom Preis fällt weg.</p>', '<p class="rechnung">Beispiel: 10 % von 20,00 € = <b>2,00 €</b></p>')}
    ${def('Pfand', '<p>Du bezahlst es für Flaschen und bekommst es bei der Rückgabe zurück.</p>')}
    ${def('Rückgeld', '<p>gegeben − Summe</p>', '<p class="rechnung">Beispiel: 10,00 € − 7,40 € = <b>2,60 €</b></p>')}
    <p class="klein">Vereinfachte Regeln für den Unterricht.</p>
  </section>`;
}

/** Alle Seiten einer Ansicht: 'arbeit' | 'loesung' oder 'zettel' (nur der Bon). */
export function renderBonSeiten(bon, { modus = 'arbeit', interactive = false } = {}) {
  const r = rechneBon(bon);
  if (modus === 'zettel') return `<section class="page page-bon" data-seite="zettel"><div class="bon-mitte">${renderBonZettel(bon, r, { modus, interactive })}</div></section>`;
  return renderBonBlatt(bon, r, { modus, interactive }) + (bon.aufgabe.beiblatt && bon.aufgabe.blatt === 'aufgabe' ? bonBeiblatt(bon) : '');
}
