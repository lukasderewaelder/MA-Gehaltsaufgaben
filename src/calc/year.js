// Jahresrechnung: zwölf Monate mit Sonderzahlung im gewählten Monat, Summen, Durchschnitt, Anteile am Brutto,
// Vergleich der Steuerklassen und Vergleich von Ehepaaren (III/V, IV/IV, V/III).
import { newPosten } from '../model.js';
import { quoteBp } from './inverse.js';
import { mul } from './money.js';
import { berechne } from './payroll.js';

/** Spalten der Jahresübersicht: Schlüssel und Kopfzeile. */
export const SPALTEN = [
  ['brutto', 'Brutto'],
  ['lst', 'Lohnsteuer'],
  ['soli', 'Soli'],
  ['kist', 'Kirchensteuer'],
  ['kv', 'KV'],
  ['rv', 'RV'],
  ['av', 'AV'],
  ['pv', 'PV'],
  ['netto', 'Netto'],
];

/** Der Monat: Sonderzahlungen gibt es nur im Monat des Zettels; von Hand geänderte Felder gelten nur dort. */
function monatsFall(fall, monat) {
  const kopie = structuredClone(fall);
  kopie.monat = monat;
  if (monat !== fall.monat) kopie.ueberschreibungen = {};
  kopie.posten = kopie.posten.filter((p) => !(p.st === 'S' || p.sv === 'S') || monat === fall.monat);
  return kopie;
}

const werteVon = (r) => ({ brutto: r.gesamtBrutto, lst: r.lst, soli: r.soli, kist: r.kist, kv: r.kv, rv: r.rv, av: r.av, pv: r.pv, netto: r.netto });

/** { zeilen: [{ monat, werte }], summe, durchschnitt, quoten (Basispunkte, auf 0,1 % gerundet) } */
export function jahresRechnung(fall) {
  const zeilen = Array.from({ length: 12 }, (_, i) => ({ monat: i + 1, werte: werteVon(berechne(monatsFall(fall, i + 1))) }));
  const summe = Object.fromEntries(SPALTEN.map(([k]) => [k, zeilen.reduce((s, z) => s + z.werte[k], 0)]));
  const durchschnitt = Object.fromEntries(SPALTEN.map(([k]) => [k, mul(summe[k], 1, 12)]));
  const quoten = Object.fromEntries(SPALTEN.map(([k]) => [k, quoteBp(summe[k], summe.brutto)]));
  return { zeilen, summe, durchschnitt, quoten };
}

/** Dieselbe Person in allen sechs Steuerklassen: Jahressteuern und Jahres-Netto. */
export function klassenvergleich(fall) {
  return [1, 2, 3, 4, 5, 6].map((klasse) => {
    const kopie = structuredClone(fall);
    kopie.person.steuerklasse = klasse;
    const s = jahresRechnung(kopie).summe;
    return { klasse, brutto: s.brutto, steuer: s.lst + s.soli + s.kist, sv: s.kv + s.rv + s.av + s.pv, netto: s.netto, summe: s };
  });
}

/** Ehepaar: Person und Partner mit dem Bruttogehalt `partnerBrutto` (Cent im Monat) in III/V, IV/IV und V/III. */
export function paarvergleich(fall, partnerBrutto) {
  const kombis = [
    ['III / V', 3, 5],
    ['IV / IV', 4, 4],
    ['V / III', 5, 3],
  ];
  return kombis.map(([label, ich, partner]) => {
    const a = structuredClone(fall);
    a.person.steuerklasse = ich;
    const b = structuredClone(fall);
    b.person.steuerklasse = partner;
    b.person.name = 'Partner/in';
    b.posten = [newPosten('gehalt', { faktor: partnerBrutto })];
    b.ueberschreibungen = {};
    const sa = jahresRechnung(a).summe;
    const sb = jahresRechnung(b).summe;
    return {
      label,
      ich,
      partner,
      brutto: sa.brutto + sb.brutto,
      steuer: sa.lst + sa.soli + sa.kist + sb.lst + sb.soli + sb.kist,
      sv: sa.kv + sa.rv + sa.av + sa.pv + sb.kv + sb.rv + sb.av + sb.pv,
      netto: sa.netto + sb.netto,
    };
  });
}
