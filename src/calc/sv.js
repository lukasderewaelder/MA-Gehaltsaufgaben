// Sozialversicherung: Arbeitnehmer- und Arbeitgeberanteile mit Beitragsbemessungsgrenzen.
import { bpOf, mul } from './money.js';

/** Beitrag der Pflegeversicherung (Arbeitnehmer) in Basispunkten: Zuschlag für Kinderlose, Abschlag ab dem 2. Kind. */
export function pvBeitragssatz(person, rates) {
  const kinder = Math.max(0, person.kinder ?? 0);
  const alter = rates.jahr - (person.geburtsjahr ?? 1990);
  let bp = rates.pv;
  if (kinder === 0 && alter >= 23) bp += rates.pvKinderlosZuschlag;
  if (kinder >= 2) bp -= rates.pvAbschlagProKind * (Math.min(kinder, 5) - 1);
  return bp;
}

/** Arbeitnehmersatz Krankenversicherung in Basispunkten (allgemeiner Satz + Zusatzbeitrag, je zur Hälfte). */
export function kvBeitragssatz(person, rates) {
  const zusatz = person.zusatzbeitrag ?? rates.kvZusatzDurchschnitt;
  return { bp: rates.kvAllgemein + zusatz / 2, zusatz };
}

/**
 * Berechnungsgrundlagen und Beiträge für einen Monat.
 * `svLaufend`: laufendes SV-Brutto; `svEinmalig`: einmalig gezahlt (Sonderzahlung); `monat`: 1–12 (Beitragsgrenze läuft über das Jahr).
 */
export function sozialversicherung({ svLaufend, svEinmalig = 0, monat = 1, person, rates }) {
  const kappRv = Math.min(svLaufend, rates.bbgRv);
  const kappKv = Math.min(svLaufend, rates.bbgKv);
  // Einmalzahlung: nur bis zur anteiligen Jahresgrenze (Annahme: gleichbleibendes laufendes Brutto in allen Monaten)
  const platzRv = Math.max(0, rates.bbgRv * monat - kappRv * monat);
  const platzKv = Math.max(0, rates.bbgKv * monat - kappKv * monat);
  const rvBrutto = kappRv + Math.min(svEinmalig, platzRv);
  const avBrutto = rvBrutto;
  const kvBrutto = kappKv + Math.min(svEinmalig, platzKv);
  const pvBrutto = kvBrutto;

  const kv = kvBeitragssatz(person, rates);
  const pvBp = pvBeitragssatz(person, rates);
  const an = {
    kv: mul(kvBrutto, kv.bp, 10000),
    rv: bpOf(rvBrutto, rates.rv),
    av: bpOf(avBrutto, rates.av),
    pv: bpOf(pvBrutto, pvBp),
  };
  // Arbeitgeber: gleicher Satz, aber ohne Kinderlosen-Zuschlag/Kinder-Abschlag
  const ag = {
    kv: an.kv,
    rv: an.rv,
    av: an.av,
    pv: bpOf(pvBrutto, rates.pv),
  };
  return {
    brutto: { kv: kvBrutto, rv: rvBrutto, av: avBrutto, pv: pvBrutto },
    saetze: { kv: kv.bp, rv: rates.rv, av: rates.av, pv: pvBp },
    an,
    ag,
    anSumme: an.kv + an.rv + an.av + an.pv,
    agSumme: ag.kv + ag.rv + ag.av + ag.pv,
  };
}
