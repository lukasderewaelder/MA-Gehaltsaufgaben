// Lohnsteuer für laufenden Arbeitslohn nach dem amtlichen Programmablaufplan 2026 (BMF, Anlage 1, Stand 12.11.2025).
// Umgesetzt sind Steuerklassen I bis VI für einen Monat ohne Versorgungsbezüge, Altersentlastung, Freibeträge und Kinder;
// die Vorsorgepauschale rechnet wie in der amtlichen Prüftabelle (gesetzlich versichert, Zusatzbeitrag 2,9 %,
// Kinderlosenzuschlag zur Pflegeversicherung außer in Klasse II).
import { einkommensteuer } from './tarif.js';

const up = (x) => Math.ceil(x - 1e-7); // auf volle Euro aufrunden

/** Vorsorgepauschale (volle Euro) aus dem Jahres-Brutto (Euro). */
export function vorsorgepauschale(jahresBrutto, klasse, rates, { kvz = rates.kvZusatzDurchschnitt, pvz = klasse !== 2 } = {}) {
  const p = rates.pap;
  const rv = Math.min(jahresBrutto, p.bbgRvAlv) * (rates.rv / 10000);
  const kvSatz = kvz / 2 / 10000 + p.kvSatzVsp / 10000;
  const pvSatz = (rates.pv + (pvz ? rates.pvKinderlosZuschlag : 0)) / 10000;
  const kvPv = Math.min(jahresBrutto, p.bbgKvPv) * (kvSatz + pvSatz);
  let vsp = up(kvPv + rv);
  if (klasse !== 6) {
    // Günstigerprüfung mit dem Höchstbetrag (Arbeitslosenversicherung plus Kranken-/Pflegeversicherung, höchstens 1.900 €)
    const alv = Math.min(jahresBrutto, p.bbgRvAlv) * (rates.av / 10000);
    const vspn = up(rv + Math.min(p.vspHoechstbetrag, alv + kvPv));
    if (vspn > vsp) vsp = vspn;
  }
  return vsp;
}

/** Jahreslohnsteuer der Klassen V und VI (volle Euro) aus dem zu versteuernden Einkommen X. */
function steuerKlasse56(zzx, rates) {
  const { w1, w2, w3 } = rates.pap;
  const tarif = (x) => einkommensteuer(x, rates);
  const stufe = (zx) => {
    const diff = (tarif(Math.floor(zx * 1.25)) - tarif(Math.floor(zx * 0.75))) * 2;
    return Math.max(diff, Math.floor(zx * 0.14));
  };
  if (zzx > w2) {
    const grund = stufe(w2);
    return zzx > w3 ? grund + Math.floor((w3 - w2) * 0.42) + Math.floor((zzx - w3) * 0.45) : grund + Math.floor((zzx - w2) * 0.42);
  }
  const st = stufe(zzx);
  if (zzx <= w1) return st;
  const hoch = stufe(w1) + Math.floor((zzx - w1) * 0.42);
  return Math.min(hoch, st);
}

/** Jahreslohnsteuer (volle Euro) für ein Jahres-Brutto (Euro, auch mit Cent) und eine Steuerklasse. */
export function jahresLohnsteuerPap(jahresBrutto, klasse, rates, opt) {
  const teilen = klasse === 3 ? 2 : 1;
  const aktiv = klasse < 6;
  const feste = (klasse === 2 ? rates.entlastungsbetragAlleinerziehend : 0) + (aktiv ? rates.arbeitnehmerPauschbetrag + rates.sonderausgabenPauschbetrag : 0);
  const zve = jahresBrutto - feste - vorsorgepauschale(jahresBrutto, klasse, rates, opt);
  const x = zve < 1 ? 0 : Math.floor(zve / teilen);
  return klasse < 5 ? einkommensteuer(x, rates) * teilen : steuerKlasse56(x, rates);
}

/** Lohnsteuer für einen Monat in Cent (Anteil der Jahreslohnsteuer, abgerundet). */
export function monatsLohnsteuerPap(bruttoCent, klasse, rates, opt) {
  if (bruttoCent <= 0) return 0;
  const jahr = jahresLohnsteuerPap((bruttoCent * 12) / 100, klasse, rates, opt);
  return Math.floor((jahr * 100) / 12);
}
