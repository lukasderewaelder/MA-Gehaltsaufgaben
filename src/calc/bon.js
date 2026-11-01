// Kassenzettel: Zeilen -> Summen je Steuersatz -> Netto, MwSt., Brutto -> Summe und Rückgeld. Beträge in Cent.
// Eingabeart `basis`: 'brutto' = Preise mit MwSt. (wie auf echten Bons), 'netto' = Preise ohne MwSt. (MwSt. = Prozent vom Netto).
// Variante 'einfach' kennt keinen Rabatt, kein Pfand und kein Rückgeld.
import { bpOf, fmtBp, fmtCents, mul } from './money.js';

export const SAETZE = { A: 1900, B: 700 }; // Kennbuchstaben auf dem Bon: A = 19 %, B = 7 %

const eur = (c) => `${fmtCents(c)} €`;

/** „1,19“ oder „1,07“: durch diese Zahl wird der Bruttobetrag geteilt. */
export const bruttoTeiler = (buchstabe) => `1,${String(SAETZE[buchstabe] / 100).padStart(2, '0')}`;
export const satzText = (buchstabe) => `${fmtBp(SAETZE[buchstabe])} %`;

export function rechneBon(bon) {
  const einfach = bon.variante === 'einfach';
  const brutto = bon.basis === 'brutto';
  const zeilen = bon.zeilen.filter((z) => !einfach || z.art !== 'pfand').map((z) => ({ ...z, betrag: z.menge * z.preis }));
  const rabattBp = einfach ? 0 : bon.rabatt;
  const werte = {};
  const weg = {};
  const feld = (id, wert, text) => {
    werte[id] = wert;
    weg[id] = text;
    return wert;
  };
  for (const z of zeilen) feld(`z:${z.id}`, z.betrag, `${z.menge} · ${eur(z.preis)} = ${eur(z.betrag)}`);

  const saetze = [];
  let rabatt = 0;
  for (const b of Object.keys(SAETZE)) {
    const bp = SAETZE[b];
    const eigene = zeilen.filter((z) => z.satz === b);
    if (!eigene.length) continue;
    const artikel = eigene.filter((z) => z.art !== 'pfand').reduce((s, z) => s + z.betrag, 0);
    const pfand = eigene.filter((z) => z.art === 'pfand').reduce((s, z) => s + z.betrag, 0);
    const nachlass = bpOf(artikel, rabattBp);
    rabatt += nachlass;
    const grund = artikel - nachlass + pfand;
    const posten = `${eigene.length > 1 || nachlass ? 'Summe aller Preise mit ' : 'Preis mit '}${b}${nachlass ? ' nach Rabatt' : ''}`;
    let netto;
    let mwst;
    let summe;
    if (brutto) {
      summe = grund;
      netto = mul(grund, 10000, 10000 + bp);
      mwst = summe - netto;
      feld(`brutto:${b}`, summe, `${posten}: ${eur(summe)}`);
      feld(`netto:${b}`, netto, `${eur(summe)} : ${bruttoTeiler(b)} = ${eur(netto)}`);
      feld(`mwst:${b}`, mwst, `${eur(summe)} − ${eur(netto)} = ${eur(mwst)}`);
    } else {
      netto = grund;
      mwst = bpOf(grund, bp);
      summe = netto + mwst;
      feld(`netto:${b}`, netto, `${posten}: ${eur(netto)}`);
      feld(`mwst:${b}`, mwst, `${fmtBp(bp)} % von ${eur(netto)} = ${eur(mwst)}`);
      feld(`brutto:${b}`, summe, `${eur(netto)} + ${eur(mwst)} = ${eur(summe)}`);
    }
    saetze.push({ buchstabe: b, bp, netto, mwst, brutto: summe, artikel, pfand, rabatt: nachlass });
  }

  const artikelSumme = saetze.reduce((s, x) => s + x.artikel, 0);
  if (rabattBp) feld('rabatt', rabatt, `${fmtBp(rabattBp)} % von ${eur(artikelSumme)} = ${eur(rabatt)}`);
  const nettoSumme = saetze.reduce((s, x) => s + x.netto, 0);
  const mwstSumme = saetze.reduce((s, x) => s + x.mwst, 0);
  const bruttoTexte = saetze.map((x) => eur(x.brutto));
  const summe = saetze.reduce((s, x) => s + x.brutto, 0);
  feld('nettoSumme', nettoSumme, saetze.map((x) => eur(x.netto)).join(' + ') + ` = ${eur(nettoSumme)}`);
  feld('mwstSumme', mwstSumme, saetze.map((x) => eur(x.mwst)).join(' + ') + ` = ${eur(mwstSumme)}`);
  feld('summe', summe, `${bruttoTexte.join(' + ')} = ${eur(summe)}`);
  const gegeben = einfach ? 0 : bon.gegeben;
  const mitRueckgeld = gegeben >= summe && gegeben > 0;
  if (mitRueckgeld) feld('rueckgeld', gegeben - summe, `${eur(gegeben)} − ${eur(summe)} = ${eur(gegeben - summe)}`);
  return { zeilen, saetze, rabatt, rabattBp, artikelSumme, nettoSumme, mwstSumme, summe, gegeben, mitRueckgeld, rueckgeld: gegeben - summe, einfach, werte, weg };
}

/** Werte, die gesucht sein können, in der Reihenfolge des Rechnens: [{ gruppe, felder: [{ id, name }] }]. */
export function bonFelder(bon, r) {
  const gruppen = [];
  if (!r.einfach) gruppen.push({ gruppe: 'Zeilen', felder: r.zeilen.filter((z) => z.menge > 1).map((z) => ({ id: `z:${z.id}`, name: z.name })) });
  const summen = [];
  if (r.rabattBp) summen.push({ id: 'rabatt', name: 'Rabatt' });
  summen.push({ id: 'summe', name: 'Summe' });
  if (r.mitRueckgeld) summen.push({ id: 'rueckgeld', name: 'Rückgeld' });
  gruppen.push({ gruppe: 'Summen', felder: summen });
  for (const s of r.saetze) {
    gruppen.push({
      gruppe: `MwSt. ${satzText(s.buchstabe)}`,
      felder: [
        { id: `netto:${s.buchstabe}`, name: `Netto ${satzText(s.buchstabe)}` },
        { id: `mwst:${s.buchstabe}`, name: `MwSt. ${satzText(s.buchstabe)}` },
        { id: `brutto:${s.buchstabe}`, name: `Brutto ${satzText(s.buchstabe)}` },
      ],
    });
  }
  return gruppen.filter((g) => g.felder.length);
}

/** Gesuchte Werte, die es auf diesem Bon gibt, in Rechenreihenfolge. */
export function bonGesucht(bon, r) {
  const liste = new Set(bon.aufgabe.gesucht);
  return bonFelder(bon, r).flatMap((g) => g.felder).filter((f) => liste.has(f.id));
}

const OPERATOREN = ['Berechne', 'Ermittle', 'Bestimme'];

/** Automatischer Text einer Teilaufgabe, in Operator-Form und einfacher Sprache. */
export function bonTeilText(bon, r, id, i = 0) {
  const op = OPERATOREN[i % 3];
  const brutto = bon.basis === 'brutto';
  const [art, b] = id.split(':');
  if (art === 'z') {
    const z = r.zeilen.find((x) => x.id === b);
    return `${op} den Preis für „${z?.name}“. Rechne: Menge · Einzelpreis.`;
  }
  if (art === 'rabatt') return `${op} den Rabatt. Rechne ${fmtBp(r.rabattBp)} % von ${eur(r.artikelSumme)}.`;
  if (art === 'summe') return `${op} die Summe. ${brutto ? 'Zähle alle Beträge zusammen.' : 'Rechne: alle Brutto-Beträge zusammen.'}`;
  if (art === 'rueckgeld') return `${op} das Rückgeld. Rechne: gegeben − Summe.`;
  const s = satzText(b);
  if (brutto) {
    if (art === 'brutto') return `${op} das Brutto für ${s}. Zähle alle Preise mit ${b} zusammen.`;
    if (art === 'netto') return `${op} das Netto für ${s}. Rechne: Brutto : ${bruttoTeiler(b)}.`;
    return `${op} die MwSt. für ${s}. Rechne: Brutto − Netto.`;
  }
  if (art === 'netto') return `${op} das Netto für ${s}. Zähle alle Preise mit ${b} zusammen.`;
  if (art === 'mwst') return `${op} die MwSt. für ${s}. Rechne ${s} vom Netto.`;
  return `${op} das Brutto für ${s}. Rechne: Netto + MwSt.`;
}

export function bonTeile(bon, r) {
  return bonGesucht(bon, r).map((f, i) => ({
    id: f.id,
    nr: `${String.fromCharCode(97 + (i % 26))})`,
    name: f.name,
    text: bon.aufgabe.texte[f.id] ?? bonTeilText(bon, r, f.id, i),
    auto: bonTeilText(bon, r, f.id, i),
    wert: `${fmtCents(r.werte[f.id] ?? 0)} €`,
    weg: r.weg[f.id] ?? '',
  }));
}

export function bonSachtext(bon) {
  const preise = bon.basis === 'brutto' ? 'Die Preise enthalten die Mehrwertsteuer.' : 'Die Preise sind ohne Mehrwertsteuer.';
  return `Das ist ein Kassenzettel von ${bon.laden}. ${preise} Einige Werte fehlen. Trage sie ein.`;
}
