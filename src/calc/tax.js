// Lohnsteuer, Solidaritätszuschlag und Kirchensteuer – bewusst vereinfacht, aber nach dem echten Tarif (§ 32a EStG).
// Die amtliche Lohnsteuertabelle rechnet genauer (z. B. Vorsorgepauschale); die Abweichung beträgt meist wenige Euro.
import { bpOf, mul } from './money.js';

const floorEps = (x) => Math.floor(x + 1e-9);

/** Tarifliche Einkommenssteuer für ein zu versteuerndes Einkommen (ganze Euro) – Ergebnis in ganzen Euro. */
export function einkommensteuer(zvE, rates) {
  const x = Math.max(0, Math.floor(zvE));
  const t = rates.tarif;
  if (x <= rates.grundfreibetrag) return 0;
  if (x <= rates.zone2Ende) {
    const y = (x - rates.grundfreibetrag) / 10000;
    return floorEps((t.a2 * y + 1400) * y);
  }
  if (x <= rates.zone3Ende) {
    const z = (x - rates.zone2Ende) / 10000;
    return floorEps((t.a3 * z + 2397) * z + t.c3);
  }
  if (x <= rates.zone4Ende) return floorEps(t.s4 * x - t.k4);
  return floorEps(t.s5 * x - t.k5);
}

/** Jahreslohnsteuer (Euro) aus dem zu versteuernden Einkommen je nach Steuerklasse. */
export function jahresLohnsteuer(zvE, klasse, rates) {
  const x = Math.max(0, Math.floor(zvE));
  if (klasse === 3) return 2 * einkommensteuer(Math.floor(x / 2), rates);
  if (klasse === 5 || klasse === 6) {
    // Klasse V/VI: kein Grundfreibetrag; Näherung über den Unterschied der Tarife bei 125 % und 75 %
    const diff = 2 * (einkommensteuer(Math.floor(x * 1.25), rates) - einkommensteuer(Math.floor(x * 0.75), rates));
    return Math.max(diff, Math.floor(x * 0.14));
  }
  return einkommensteuer(x, rates);
}

/** Pauschbeträge und Freibeträge je Steuerklasse (Euro im Jahr). */
export function abzugsbetraege(klasse, rates) {
  const sechs = klasse === 6;
  return {
    arbeitnehmer: sechs ? 0 : rates.arbeitnehmerPauschbetrag,
    sonderausgaben: sechs ? 0 : klasse === 3 ? rates.sonderausgabenPauschbetrag * 2 : rates.sonderausgabenPauschbetrag,
    entlastung: klasse === 2 ? rates.entlastungsbetragAlleinerziehend : 0,
  };
}

/** Zu versteuerndes Jahreseinkommen (Euro) aus Jahres-Steuerbrutto (Euro) und Vorsorgepauschale (Euro). */
export function zuVersteuern(jahresBrutto, vorsorge, klasse, rates) {
  const a = abzugsbetraege(klasse, rates);
  return Math.max(0, jahresBrutto - a.arbeitnehmer - a.sonderausgaben - a.entlastung - vorsorge);
}

/** Kinderfreibetrag (Euro im Jahr) für die Berechnung von Soli und Kirchensteuer. */
export function kinderfreibetrag(klasse, kinder, rates) {
  if (klasse === 5 || klasse === 6) return 0;
  const zaehler = klasse === 2 || klasse === 3 ? 1 : 0.5;
  return Math.round(rates.kinderfreibetrag * zaehler * Math.max(0, kinder));
}

/** Soli auf eine Jahres-Lohnsteuer (Euro) -> Cent im Jahr; mit Freigrenze und Milderungszone. */
export function soliJahr(steuerEuro, klasse, rates) {
  const grenze = rates.soliFreigrenze * (klasse === 3 ? 2 : 1);
  if (steuerEuro <= grenze) return 0;
  const voll = bpOf(steuerEuro * 100, rates.soliSatz);
  const mild = bpOf((steuerEuro - grenze) * 100, rates.soliMilderung);
  return Math.min(voll, mild);
}

/** Standard-Vorsorgepauschale (Euro im Jahr), unabhängig von der Person – für die Lohnsteuertabelle. */
function standardVorsorgeJahr(bruttoMonat, rates) {
  const rv = bpOf(Math.min(bruttoMonat, rates.bbgRv), rates.rv);
  const kv = bpOf(Math.min(bruttoMonat, rates.bbgKv), rates.kvAllgemein + rates.kvZusatzDurchschnitt / 2 + rates.pv);
  return Math.floor(((rv + kv) * 12) / 100);
}

/** Lohnsteuer je Monat aus der „Tabelle“: Brutto wird in Stufen (Standard 50 €) zusammengefasst, Mitte der Stufe zählt. */
export function tabellenStufe(bruttoCent, stufe = 5000) {
  const von = Math.floor(bruttoCent / stufe) * stufe;
  return { von, bis: von + stufe - 1, mitte: von + Math.floor(stufe / 2) };
}

export function tabellenLohnsteuer(bruttoCent, klasse, rates, stufe = 5000) {
  const s = tabellenStufe(bruttoCent, stufe);
  const jahr = Math.floor((s.mitte * 12) / 100);
  const zvE = zuVersteuern(jahr, standardVorsorgeJahr(s.mitte, rates), klasse, rates);
  return { ...s, lohnsteuer: mul(jahresLohnsteuer(zvE, klasse, rates) * 100, 1, 12) };
}

/**
 * Steuerabzüge für einen Monat.
 *  stLaufend/stSonstig: steuerpflichtiges Brutto (laufend / sonstiger Bezug) in Cent
 *  vorsorgeMonat: Arbeitnehmeranteile der Sozialversicherung des Monats in Cent (Grundlage der Vorsorgepauschale)
 *  steuer: { modus: 'tabelle' | 'formel' | 'prozent', prozent (bp), soli, kirche }
 * Sonstige Bezüge werden nach der Jahresdifferenz versteuert (Steuer mit minus Steuer ohne den Bezug).
 */
export function steuerabzuege({ stLaufend, stSonstig = 0, vorsorgeMonat, person, steuer, rates }) {
  const klasse = person.steuerklasse ?? 1;
  const konfession = person.konfession ?? 'keine';
  const kistBp = rates.kistSatz[person.kirchensteuersatz ?? 9] ?? rates.kistSatz[9];
  const mitKirche = konfession !== 'keine';
  const gesamt = stLaufend + stSonstig;
  const out = { lst: 0, soli: 0, kist: 0, modus: steuer.modus, kistBp };
  if (gesamt <= 0) return out;

  if (steuer.modus === 'prozent') {
    out.lst = bpOf(gesamt, steuer.prozent ?? 0);
    out.prozentBasis = gesamt;
    out.soli = steuer.soli === false ? 0 : bpOf(out.lst, rates.soliSatz);
    out.kist = mitKirche ? bpOf(out.lst, kistBp) : 0;
    return out;
  }

  const jahrLaufend = Math.floor((stLaufend * 12) / 100);
  const jahrGesamt = jahrLaufend + Math.floor(stSonstig / 100);
  const vorsorge = Math.floor((vorsorgeMonat * 12) / 100);
  const zvLaufend = zuVersteuern(jahrLaufend, vorsorge, klasse, rates);
  const zvGesamt = zuVersteuern(jahrGesamt, vorsorge, klasse, rates);
  const lstLaufend = jahresLohnsteuer(zvLaufend, klasse, rates);
  const lstGesamt = jahresLohnsteuer(zvGesamt, klasse, rates);
  const sonderEuro = lstGesamt - lstLaufend;
  out.zvE = zvLaufend;
  out.jahrLaufend = jahrLaufend;
  out.sonderLst = sonderEuro * 100;

  if (steuer.modus === 'tabelle') {
    const zeile = tabellenLohnsteuer(stLaufend, klasse, rates);
    out.tabelle = zeile;
    out.lst = zeile.lohnsteuer + sonderEuro * 100;
    // Soli/Kirchensteuer wie in der Tabelle: auf die Lohnsteuer, ohne Kinderfreibetrag
    const baseA = Math.round((zeile.lohnsteuer * 12) / 100);
    const baseB = baseA + sonderEuro;
    const soliA = soliJahr(baseA, klasse, rates);
    const soliB = soliJahr(baseB, klasse, rates);
    out.soli = steuer.soli === false ? 0 : mul(soliA, 1, 12) + (soliB - soliA);
    out.kist = mitKirche ? mul(baseA * 100, kistBp, 120000) + bpOf(sonderEuro * 100, kistBp) : 0;
    return out;
  }

  // Formel: Soli/Kirchensteuer nach Kinderfreibetrag (wie im Programmablaufplan)
  const kfb = kinderfreibetrag(klasse, person.kinder ?? 0, rates);
  out.kinderfreibetrag = kfb;
  const baseA = jahresLohnsteuer(Math.max(0, zvLaufend - kfb), klasse, rates);
  const baseB = jahresLohnsteuer(Math.max(0, zvGesamt - kfb), klasse, rates);
  const soliA = soliJahr(baseA, klasse, rates);
  const soliB = soliJahr(baseB, klasse, rates);
  out.lst = mul(lstLaufend * 100, 1, 12) + sonderEuro * 100;
  out.soli = steuer.soli === false ? 0 : mul(soliA, 1, 12) + (soliB - soliA);
  out.kist = mitKirche ? mul(baseA * 100, kistBp, 120000) + bpOf((baseB - baseA) * 100, kistBp) : 0;
  return out;
}
