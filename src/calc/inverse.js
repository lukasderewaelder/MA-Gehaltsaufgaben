// Rückwärts rechnen: aus Beitrag und Satz, Betrag und Menge, Netto und Abzugsquote oder einem Wunsch-Netto zurück zum Brutto.
import { POSTEN_TYPEN } from '../model.js';
import { berechne } from './payroll.js';
import { mul } from './money.js';

/** Grundwert aus Prozentwert: Beitrag (Cent) und Satz (Basispunkte) -> Brutto (Cent). */
export const bruttoAusBeitrag = (beitrag, bp) => mul(beitrag, 10000, bp);

/** Betrag und Menge (Hundertstel) -> Faktor, z. B. Stundenlohn (Cent). */
export const faktorAusBetrag = (betrag, mengeHundertstel) => mul(betrag, 100, mengeHundertstel);

/** Betrag und Faktor (Cent) -> Menge (Hundertstel). */
export const mengeAusBetrag = (betrag, faktor) => mul(betrag, 100, faktor);

/** Betrag, Menge (Hundertstel) und Grundlohn (Cent) -> Zuschlagssatz in Basispunkten. */
export const prozentAusBetrag = (betrag, mengeHundertstel, faktor) => mul(betrag, 10000 * 100, mengeHundertstel * faktor);

/** Netto und Abzugsquote (Basispunkte) -> Brutto: Netto : (1 − Quote). */
export const bruttoAusNetto = (netto, quoteBp) => mul(netto, 10000, 10000 - quoteBp);

/** Anteil `teil` am Ganzen in Basispunkten, auf `schritt` gerundet (10 = eine Nachkommastelle in Prozent). */
export const quoteBp = (teil, ganzes, schritt = 10) => (ganzes > 0 ? Math.round(((teil * 10000) / ganzes) / schritt) * schritt : 0);

/** Der Posten, dessen Betrag beim Ausprobieren verändert wird: der erste Bezug mit Betrag oder Menge × Faktor. */
export function hauptposten(fall) {
  return fall.posten.find((p) => p.bereich === 'brutto' && ['pauschal', 'menge'].includes(POSTEN_TYPEN[p.typ]?.art));
}

/** Ergebnis der Abrechnung, wenn das Gesamt-Brutto genau `brutto` Cent wäre (Hauptposten wird angepasst). */
export function ergebnisBeiBrutto(fall, brutto) {
  const kopie = structuredClone(fall);
  kopie.ueberschreibungen = {};
  const haupt = hauptposten(kopie);
  if (!haupt) return null;
  const andere = berechne({ ...kopie, posten: kopie.posten.filter((p) => p !== haupt && p.bereich === 'brutto' && p.id !== haupt.id) }).gesamtBrutto;
  const rest = Math.max(0, brutto - andere);
  if (POSTEN_TYPEN[haupt.typ].art === 'pauschal') haupt.faktor = rest;
  else haupt.faktor = mul(rest, 100, Math.max(1, haupt.menge));
  return berechne(kopie);
}

/**
 * Kleinstes Brutto (auf `schritt` Cent genau), bei dem mindestens `ziel` Cent ausgezahlt werden.
 * `versuche`: die Brutto-/Auszahlungspaare der Suche (Intervallschachtelung), aufsteigend nach Brutto sortiert.
 */
export function bruttoFuerNetto(fall, ziel, { schritt = 1000, max = 2_000_000 } = {}) {
  if (!hauptposten(fall)) return null;
  const auszahlung = (b) => ergebnisBeiBrutto(fall, b).auszahlung;
  const versuche = new Map();
  const probe = (b) => {
    const n = auszahlung(b);
    versuche.set(b, n);
    return n;
  };
  let lo = 0;
  let hi = Math.ceil(max / schritt);
  if (auszahlung(hi * schritt) < ziel) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (probe(mid * schritt) >= ziel) hi = mid;
    else lo = mid + 1;
  }
  const brutto = lo * schritt;
  probe(brutto);
  if (lo > 0) probe(brutto - schritt);
  return {
    brutto,
    netto: versuche.get(brutto),
    versuche: [...versuche].map(([b, n]) => ({ brutto: b, netto: n })).sort((a, b) => a.brutto - b.brutto),
  };
}
