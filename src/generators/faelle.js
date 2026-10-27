// Zufallsfälle: aus Stufe, Schaltern und Startwert (Seed) entsteht ein vollständiger Zettel mit Aufgabe.
// Gleiche Einstellungen und gleicher Seed ergeben immer denselben Fall (für Gruppe A/B und Wiederholung).
import { berechne } from '../calc/payroll.js';
import { ratesFor } from '../calc/rates.js';
import { MONATE, newFall, newPosten, normalizeFall } from '../model.js';
import { makeRng, randomSeed } from './rng.js';

export { randomSeed };

export const STUFEN = {
  leicht: { glatt: true, steuer: 'prozent', zuschlaege: false, sonderzahlung: false, kirche: false, kinder: false, klassen: 'I', ueberBbg: false, minijob: false, aufgabe: 'netto' },
  mittel: { glatt: false, steuer: 'tabelle', zuschlaege: false, sonderzahlung: false, kirche: true, kinder: true, klassen: 'I', ueberBbg: false, minijob: false, aufgabe: 'komplett' },
  schwer: { glatt: false, steuer: 'tabelle', zuschlaege: true, sonderzahlung: true, kirche: true, kinder: true, klassen: 'alle', ueberBbg: false, minijob: false, aufgabe: 'komplett' },
};

export const AUFGABEN = {
  komplett: 'Alles: Brutto bis Netto',
  netto: 'Abzüge und Netto',
  sv: 'Sozialversicherung',
  steuer: 'Steuern',
  brutto: 'Brutto (Bezüge zusammenrechnen)',
};

export function defaultSpec(stufe = 'mittel', seed = randomSeed()) {
  return { stufe, seed, art: 'gemischt', rueck: '', gruppe: 0, ...STUFEN[stufe] };
}

const BERUFE = [
  { name: 'Verkäufer/in', art: 'gehalt', band: [2200, 2900], firmen: ['Sport Sommer GmbH', 'Modehaus Lindner', 'Supermarkt Frisch & Fein'], zuschlaege: ['sonntag', 'feiertag'] },
  { name: 'Bürokaufmann/-frau', art: 'gehalt', band: [2600, 3400], firmen: ['Spedition Krämer GmbH', 'Versicherungsbüro Roth', 'Möbel Brandt KG'], zuschlaege: [] },
  { name: 'Pflegefachkraft', art: 'gehalt', band: [3000, 3700], firmen: ['Seniorenhaus Abendsonne', 'Pflegedienst Himmelreich', 'Klinikum Neustadt'], zuschlaege: ['nacht', 'sonntag', 'feiertag'] },
  { name: 'Erzieher/in', art: 'gehalt', band: [3000, 3700], firmen: ['Kita Regenbogen', 'Kinderhaus Sonnenschein', 'Kita Kleine Strolche'], zuschlaege: [] },
  { name: 'Hotelfachmann/-frau', art: 'gehalt', band: [2200, 2700], firmen: ['Hotel Seeblick', 'Gasthof zur Linde', 'Parkhotel Wiesengrund'], zuschlaege: ['sonntag', 'feiertag'] },
  { name: 'Kfz-Mechatroniker/in', art: 'lohn', band: [16, 22], firmen: ['Autohaus Neumann KG', 'Kfz-Werkstatt Wagner', 'Reifen Schulz'], zuschlaege: ['ueberstunden'] },
  { name: 'Elektroniker/in', art: 'lohn', band: [18, 25], firmen: ['Elektro Franke GmbH', 'Elektrotechnik Vogel', 'Haustechnik Böhm'], zuschlaege: ['ueberstunden'] },
  { name: 'Lagerlogistiker/in', art: 'lohn', band: [14, 17], firmen: ['Logistik Nordwind GmbH', 'Lager & Versand Becker', 'Paketdienst Eilig'], zuschlaege: ['nacht', 'ueberstunden'] },
  { name: 'Koch/Köchin', art: 'lohn', band: [14, 19], firmen: ['Restaurant Zum Hirschen', 'Landhaus Eichenhof', 'Kantine Medico'], zuschlaege: ['sonntag', 'feiertag'] },
  { name: 'Busfahrer/in', art: 'lohn', band: [16, 21], firmen: ['Stadtwerke Verkehr', 'Reisebus Möller', 'Regiobus Süd'], zuschlaege: ['sonntag', 'nacht'] },
  { name: 'Industriemechaniker/in', art: 'lohn', band: [20, 27], firmen: ['Maschinenbau Lindner AG', 'Metallwerk Albrecht', 'Stahlbau Hartmann'], zuschlaege: ['nacht', 'ueberstunden'] },
  { name: 'Friseur/in', art: 'lohn', band: [13.9, 16], firmen: ['Salon Haarscharf', 'Friseur Kamm & Schere', 'Haarstudio Elegance'], zuschlaege: [] },
];
const BERUF_BBG = { name: 'Ingenieur/in', art: 'gehalt', band: [8600, 11500], firmen: ['Software Winter GmbH', 'Ingenieurbüro Falk & Partner', 'Anlagenbau Berger AG'], zuschlaege: [] };
const BERUF_MINIJOB = { name: 'Aushilfe (Minijob)', art: 'lohn', band: [13.9, 15.5], firmen: ['Café Rosengarten', 'Bäckerei Sonnenschein', 'Eiscafé Venezia'], zuschlaege: [] };

const VORNAMEN = ['Lena', 'Tim', 'Mia', 'Jonas', 'Sabine', 'Kai', 'Petra', 'Markus', 'Aylin', 'Mehmet', 'Sophie', 'Luca', 'Nadine', 'Tobias', 'Fatma', 'Paul', 'Jana', 'Daniel', 'Katharina', 'Emre', 'Anja', 'Stefan', 'Lea', 'Felix'];
const NACHNAMEN = ['Berger', 'Schubert', 'Hoffmann', 'Wagner', 'Keller', 'Richter', 'Lindner', 'Yilmaz', 'Schneider', 'Fischer', 'Weber', 'Becker', 'Koch', 'Vogel', 'Krüger', 'Aydin', 'Hartmann', 'Neumann', 'Schulz', 'Winter'];
const STRASSEN = ['Lindenallee', 'Bahnhofstraße', 'Gartenweg', 'Schulstraße', 'Birkenweg', 'Mühlenstraße', 'Am Markt', 'Rosenstraße'];
const ORTE = ['12345 Musterstadt', '23456 Beispielhausen', '34567 Neudorf', '45678 Lindenau', '56789 Waldbach'];

const ZUSATZ = { leicht: [140], mittel: [290], schwer: [190, 250, 290, 340] };
const KLASSEN = [[1, 50], [2, 10], [3, 15], [4, 10], [5, 10], [6, 5]];

/** Gewichtete Auswahl aus [[wert, gewicht], …]. */
function gewichtet(rng, liste) {
  const summe = liste.reduce((s, [, g]) => s + g, 0);
  let x = rng.next() * summe;
  for (const [wert, gewicht] of liste) {
    x -= gewicht;
    if (x < 0) return wert;
  }
  return liste[0][0];
}

const gerundet = (rng, lo, hi, schritt) => rng.int(Math.ceil(lo / schritt), Math.floor(hi / schritt)) * schritt;
const euro = (x) => Math.round(x * 100);

function gesuchtFuer(aufgabe, fall, r) {
  const brutto = r.bruttoPosten.map((p) => `p:${p.id}`);
  const steuer = ['stBrutto', 'lst', ...(r.soli > 0 ? ['soli'] : []), ...(r.kist > 0 ? ['kist'] : []), 'steuerAbzuege'];
  const sv = ['kv', 'rv', 'av', 'pv', 'svAbzuege'];
  const bbg = r.gesamtBrutto > r.rvBrutto ? ['kvBrutto', 'rvBrutto'] : [];
  switch (aufgabe) {
    case 'netto':
      return ['steuerAbzuege', 'svAbzuege', 'netto'];
    case 'sv':
      return [...bbg, ...sv];
    case 'steuer':
      return steuer;
    case 'brutto':
      return [...brutto, 'gesamtBrutto', 'stBrutto'];
    default:
      return ['gesamtBrutto', 'stBrutto', ...bbg, 'lst', ...(r.kist > 0 ? ['kist'] : []), 'kv', 'rv', 'av', 'pv', 'netto'];
  }
}

/** Erzeugt einen Fall (gültig normalisiert) aus den Einstellungen. */
export function erzeugeFall(eingabe) {
  const spec = { ...defaultSpec(eingabe.stufe ?? 'mittel', eingabe.seed ?? 1), ...eingabe };
  const rng = makeRng(spec.seed); // Zahlen, Namen
  const sr = makeRng(spec.strukturSeed ?? spec.seed); // Aufbau der Aufgabe: bei Gruppen A/B gleich, nur die Zahlen ändern sich
  const jahr = 2026;
  const rates = ratesFor(jahr);

  // Beruf, Firma, Person
  let beruf;
  if (spec.minijob) beruf = BERUF_MINIJOB;
  else if (spec.ueberBbg) beruf = BERUF_BBG;
  else {
    const art = spec.rueck === 'stundenlohn' ? 'lohn' : spec.art;
    const passend = BERUFE.filter((b) => art === 'gemischt' || b.art === art);
    beruf = sr.pick(passend);
  }
  const lohn = beruf.art === 'lohn';
  const firma = sr.pick(beruf.firmen);
  const person = {
    name: `${rng.pick(VORNAMEN)} ${rng.pick(NACHNAMEN)}`,
    strasse: `${rng.pick(STRASSEN)} ${rng.int(1, 60)}`,
    ort: rng.pick(ORTE),
    personalnr: String(rng.int(1, 300)).padStart(5, '0'),
    geburtsjahr: spec.minijob ? rng.int(2000, 2008) : rng.int(1965, 2004),
    steuerklasse: 1,
    kinder: 0,
    konfession: 'keine',
    kirchensteuersatz: 9,
    krankenkasse: rng.pick(['Muster-Krankenkasse', 'Gesund & Fit BKK', 'Techniker Beispiel', 'AOK Beispielland']),
    zusatzbeitrag: rng.pick(ZUSATZ[spec.stufe] ?? ZUSATZ.mittel),
    minijob: spec.minijob,
  };
  if (spec.kinder && !spec.minijob) person.kinder = gewichtet(rng, [[0, 4], [1, 3], [2, 3], [3, 1]]);
  if (spec.klassen === 'alle' && !spec.minijob) {
    person.steuerklasse = gewichtet(sr, KLASSEN);
    if (person.steuerklasse === 2 && person.kinder === 0) person.kinder = 1;
    if ((person.steuerklasse === 3 || person.steuerklasse === 5) && !spec.kinder) person.kinder = 0;
  }
  if (spec.kirche && !spec.minijob) {
    person.konfession = rng.pick(['keine', 'keine', 'ev', 'rk']);
    person.kirchensteuersatz = rng.chance(0.2) ? 8 : 9;
  }

  // Bezüge
  const posten = [];
  let normal; // laufender Bezug in Cent
  let grundlohn; // Cent je Stunde
  if (lohn) {
    const [lo, hi] = beruf.band;
    const satz = spec.glatt ? rng.int(Math.ceil(lo), Math.floor(hi)) * 100 : rng.int(Math.round(lo * 10), Math.round(hi * 10)) * 10;
    grundlohn = Math.max(satz, rates.mindestlohn);
    let stunden;
    if (spec.minijob) stunden = rng.int(25, Math.max(25, Math.floor(rates.minijob / grundlohn)));
    else stunden = spec.glatt ? 160 : spec.stufe === 'schwer' ? rng.int(304, 352) / 2 : rng.pick([152, 160, 164, 168, 172, 176]);
    posten.push(newPosten('stundenlohn', { menge: Math.round(stunden * 100), faktor: grundlohn }));
    normal = Math.round((stunden * grundlohn));
  } else {
    const [lo, hi] = beruf.band;
    const rund = spec.glatt ? 100 : spec.stufe === 'schwer' ? 1 : 10;
    const brutto = gerundet(rng, lo, hi, rund);
    posten.push(newPosten('gehalt', { faktor: euro(brutto) }));
    normal = euro(brutto);
    const std = spec.glatt ? Math.round(brutto / 173) : Math.round((brutto / 173.33) * 10) / 10;
    grundlohn = euro(std);
  }

  // Zuschläge
  if (spec.zuschlaege && !spec.minijob) {
    const arten = beruf.zuschlaege.length ? beruf.zuschlaege : ['ueberstunden'];
    const erste = sr.pick(arten);
    const wahl = arten.length > 1 && sr.chance(0.6) ? [erste, sr.pick(arten.filter((a) => a !== erste))] : [erste];
    const stundenFuer = { nacht: [8, 24], sonntag: [8, 16], feiertag: [4, 8], ueberstunden: [4, 16] };
    for (const art of wahl) {
      const [lo, hi] = stundenFuer[art];
      const h = spec.glatt ? Math.round((lo + hi) / 2 / 2) * 2 : rng.int(lo, hi);
      posten.push(newPosten(art, { menge: h * 100, faktor: grundlohn }));
    }
  }

  // Sonderzahlung
  let monat = rng.int(1, 12);
  if (spec.sonderzahlung && !spec.minijob) {
    if (sr.chance(0.6)) {
      monat = 11;
      posten.push(newPosten('weihnachtsgeld', { faktor: Math.round(normal / 5000) * 5000 }));
    } else {
      monat = 6;
      posten.push(newPosten('urlaubsgeld', { faktor: rng.int(6, 16) * 5000 }));
    }
  }

  const steuerProzent = rng.pick([12, 14, 15, 16, 18, 20]) * 100;
  const fall = newFall({
    titel: '',
    art: lohn ? 'lohn' : 'gehalt',
    jahr,
    monat,
    firma: { name: firma, strasse: `${rng.pick(STRASSEN)} ${rng.int(1, 40)}`, ort: person.ort },
    person,
    posten,
    steuer: { modus: spec.steuer, prozent: steuerProzent, soli: true },
    zufall: { ...spec, gruppe: spec.gruppe },
  });
  const buchstabe = spec.gruppe > 0 ? ` (Gruppe ${String.fromCharCode(64 + spec.gruppe)})` : '';
  fall.titel = `${beruf.name}, ${MONATE[fall.monat - 1]}${buchstabe}`;
  fall.aufgabe.titel = `${lohn ? 'Lohnabrechnung' : 'Gehaltsabrechnung'} nachrechnen${buchstabe}`;
  fall.aufgabe.blatt = 'aufgabe';
  fall.aufgabe.beiblatt = true;
  fall.aufgabe.zeilen = 2;
  fall.aufgabe.gesucht = gesuchtFuer(spec.aufgabe, fall, berechne(fall));

  if (spec.rueck) {
    const rueckParam = { beitrag: sr.pick(['rv', 'kv', 'av']), stundenlohn: fall.posten.length > 1 && spec.zuschlaege ? sr.pick(['stundenlohn', 'stunden', 'zuschlag']) : sr.pick(['stundenlohn', 'stunden']) };
    fall.aufgabe.rueck = { typ: spec.rueck, param: rueckParam[spec.rueck] ?? '' };
  }
  return normalizeFall(fall);
}

/** `anzahl` Fälle (Gruppen A, B, …) mit aufeinanderfolgenden Startwerten. */
export function erzeugeGruppen(spec, anzahl = 1) {
  return Array.from({ length: anzahl }, (_, i) =>
    erzeugeFall({ ...spec, seed: spec.seed + i, strukturSeed: anzahl > 1 ? spec.seed : null, gruppe: anzahl > 1 ? i + 1 : 0 }),
  );
}
