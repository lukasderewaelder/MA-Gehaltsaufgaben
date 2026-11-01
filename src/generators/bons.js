// Zufallsbons: Katalog nach Ladenart, Stufen leicht bis schwer, Gruppen A/B (gleicher Aufbau, andere Zahlen). Alle Läden sind erfunden.
import { newBon, newZeile, normalizeBon } from '../bon.js';
import { bonFelder, rechneBon } from '../calc/bon.js';
import { makeRng } from './rng.js';

// [Name, niedrigster und höchster Preis in Cent, Kennbuchstabe] – A = 19 %, B = 7 %
const LAEDEN = {
  supermarkt: {
    name: 'Supermarkt',
    namen: ['Markt Sonne', 'Frischmarkt Linde', 'Kaufhalle Nord', 'Marktplatz am Park'],
    artikel: [
      ['Milch', 99, 139, 'B'], ['Brot', 189, 349, 'B'], ['Butter', 199, 279, 'B'], ['Äpfel', 199, 329, 'B'], ['Bananen', 129, 219, 'B'],
      ['Nudeln', 89, 169, 'B'], ['Käse', 199, 349, 'B'], ['Eier', 229, 329, 'B'], ['Joghurt', 49, 99, 'B'], ['Schokolade', 89, 189, 'B'],
      ['Spülmittel', 99, 199, 'A'], ['Küchenrolle', 179, 299, 'A'], ['Müllbeutel', 149, 249, 'A'],
    ],
    getraenke: [['Mineralwasser', 49, 89, 'A'], ['Cola', 99, 159, 'A'], ['Apfelsaft', 129, 199, 'A']],
  },
  drogerie: {
    name: 'Drogerie',
    namen: ['Drogerie Klar', 'Pflegewelt Berger', 'Haus & Pflege'],
    artikel: [
      ['Shampoo', 149, 349, 'A'], ['Zahnpasta', 89, 229, 'A'], ['Seife', 79, 199, 'A'], ['Waschmittel', 399, 699, 'A'], ['Taschentücher', 99, 179, 'A'],
      ['Duschgel', 99, 249, 'A'], ['Deo', 149, 299, 'A'], ['Babybrei', 89, 149, 'B'], ['Müsli', 229, 349, 'B'], ['Tee', 129, 229, 'B'],
    ],
  },
  baeckerei: {
    name: 'Bäckerei, Imbiss',
    namen: ['Bäckerei Hansen', 'Backstube Korn', 'Imbiss am Eck'],
    artikel: [
      ['Brötchen', 45, 69, 'B'], ['Laugenstange', 89, 129, 'B'], ['Brot', 329, 479, 'B'], ['Belegtes Brötchen', 249, 379, 'B'], ['Kuchen', 239, 349, 'B'],
      ['Currywurst', 379, 549, 'B'], ['Pommes', 279, 379, 'B'], ['Kaffee', 229, 349, 'A'], ['Cola', 229, 299, 'A'], ['Wasser', 149, 229, 'A'],
    ],
  },
  baumarkt: {
    name: 'Baumarkt, Schreibwaren',
    namen: ['Baumarkt Stark', 'Werkzeug Keller', 'Papier & Stift'],
    artikel: [
      ['Schrauben', 249, 499, 'A'], ['Farbe', 1299, 2499, 'A'], ['Pinsel', 199, 449, 'A'], ['Klebeband', 149, 349, 'A'], ['Collegeblock', 129, 249, 'A'],
      ['Füller', 499, 999, 'A'], ['Bleistifte', 149, 299, 'A'], ['Taschenrechner', 899, 1499, 'A'], ['Buch', 799, 1499, 'B'], ['Zeitschrift', 299, 549, 'B'], ['Atlas', 1499, 2299, 'B'],
    ],
  },
};
export const LADEN_ARTEN = { gemischt: 'Zufällig', ...Object.fromEntries(Object.entries(LAEDEN).map(([k, v]) => [k, v.name])) };
export const BON_AUFGABEN = { auto: 'Passend zur Stufe', summe: 'Zeilen und Summe', mwst: 'MwSt. und Netto', alles: 'Alles zusammen' };
export const BON_STUFEN = {
  leicht: 'Leicht – wenige Artikel, runde Preise, Variante Einfach',
  mittel: 'Mittel – echte Preise, Brutto gegeben, Rückgeld',
  schwer: 'Schwer – viele Artikel, Rabatt, Pfand',
};

export const defaultBonSpec = (stufe = 'mittel', seed = 1) => ({
  stufe,
  seed,
  strukturSeed: null,
  gruppe: 0,
  laden: 'gemischt',
  aufgabe: 'auto',
  variante: stufe === 'leicht' ? 'einfach' : 'standard',
  basis: stufe === 'leicht' ? 'netto' : 'brutto',
});

const ANZAHL = { leicht: [3, 4], mittel: [4, 6], schwer: [6, 8] };

function preisVon(rng, lo, hi, stufe) {
  if (stufe === 'leicht') return Math.max(50, Math.round(rng.int(lo, hi) / 50) * 50);
  return Math.ceil(rng.int(lo, hi) / 10) * 10 - 1; // Preise wie 1,29 oder 2,49
}

function gesuchtFuer(aufgabe, bon) {
  const r = rechneBon(bon);
  const felder = bonFelder(bon, r);
  const ids = (gruppe) => felder.filter((g) => gruppe.test(g.gruppe)).flatMap((g) => g.felder.map((f) => f.id));
  const mwst = r.saetze.flatMap((s) => (bon.basis === 'brutto' ? [`netto:${s.buchstabe}`, `mwst:${s.buchstabe}`] : [`mwst:${s.buchstabe}`, `brutto:${s.buchstabe}`]));
  if (aufgabe === 'summe') return [...ids(/Zeilen/), ...ids(/Summen/)];
  if (aufgabe === 'mwst') return mwst;
  return [...ids(/Zeilen/), ...ids(/Summen/), ...mwst];
}

/** Ein Bon aus den Einstellungen; gleicher Startwert = gleicher Bon. */
export function erzeugeBon(eingabe) {
  const spec = { ...defaultBonSpec(eingabe.stufe ?? 'mittel', eingabe.seed ?? 1), ...eingabe };
  const rng = makeRng(spec.seed); // Zahlen
  const sr = makeRng(spec.strukturSeed ?? spec.seed); // Aufbau: bei Gruppen gleich
  const art = spec.laden !== 'gemischt' && LAEDEN[spec.laden] ? spec.laden : sr.pick(Object.keys(LAEDEN));
  const laden = LAEDEN[art];
  const standard = spec.variante === 'standard';
  const schwer = spec.stufe === 'schwer';

  const anzahl = sr.int(...ANZAHL[spec.stufe]);
  const katalog = [...laden.artikel];
  // Beide Sätze sollen vorkommen, wenn der Laden sie führt
  const wahl = [];
  for (const b of ['A', 'B']) {
    const eigene = katalog.filter((a) => a[3] === b);
    if (eigene.length) wahl.push(sr.pick(eigene));
  }
  while (wahl.length < anzahl) {
    const a = sr.pick(katalog);
    if (!wahl.includes(a)) wahl.push(a);
    else if (wahl.length >= katalog.length) break;
  }
  const zeilen = wahl.map(([name, lo, hi, satz]) =>
    newZeile({ name, satz, preis: preisVon(rng, lo, hi, spec.stufe), menge: standard && sr.chance(0.35) ? sr.int(2, 4) : 1 }),
  );
  if (schwer && laden.getraenke) {
    const [name, lo, hi, satz] = sr.pick(laden.getraenke);
    const menge = sr.int(2, 6);
    zeilen.push(newZeile({ name, satz, preis: preisVon(rng, lo, hi, spec.stufe), menge }));
    zeilen.push(newZeile({ art: 'pfand', name: 'Pfand', satz, preis: 25, menge }));
  }

  const buchstabe = spec.gruppe > 0 ? ` (Gruppe ${String.fromCharCode(64 + spec.gruppe)})` : '';
  const bon = newBon({
    titel: `Kassenzettel ${sr.pick(laden.namen)}${buchstabe}`,
    laden: '',
    strasse: `Hauptstraße ${rng.int(1, 60)}`,
    ort: rng.pick(['12345 Musterstadt', '23456 Beispielstadt', '34567 Neustadt', '45678 Altdorf']),
    datum: `${String(rng.int(1, 28)).padStart(2, '0')}.${String(rng.int(1, 12)).padStart(2, '0')}.2026`,
    uhrzeit: `${String(rng.int(8, 19)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`,
    bonNr: String(rng.int(1000, 9999)),
    variante: spec.variante,
    basis: spec.basis,
    zeilen,
    rabatt: schwer ? sr.pick([500, 1000, 2000]) : 0,
    zufall: { ...spec },
  });
  bon.laden = bon.titel.replace(/^Kassenzettel /, '').replace(buchstabe, '');
  bon.aufgabe.titel = `Kassenzettel nachrechnen${buchstabe}`;
  if (standard) {
    const summe = rechneBon(bon).summe;
    const schein = [500, 1000, 2000, 5000, 10000].find((s) => s >= summe) ?? Math.ceil(summe / 10000) * 10000;
    bon.gegeben = schein;
  }
  const aufgabe = spec.aufgabe === 'auto' ? { leicht: 'alles', mittel: 'alles', schwer: 'alles' }[spec.stufe] : spec.aufgabe;
  bon.aufgabe.gesucht = gesuchtFuer(aufgabe, bon);
  return normalizeBon(bon);
}

/** Mehrere Bons (Gruppen A, B, …) mit gleichem Aufbau; bei einer Gruppe genau ein Bon ohne Zusatz. */
export function erzeugeBonGruppen(spec, anzahl = 1) {
  if (anzahl <= 1) return [erzeugeBon(spec)];
  const struktur = spec.strukturSeed ?? spec.seed;
  return Array.from({ length: anzahl }, (_, i) => erzeugeBon({ ...spec, strukturSeed: struktur, seed: (spec.seed + (i + 1) * 7919) % 4294967296, gruppe: i + 1 }));
}
