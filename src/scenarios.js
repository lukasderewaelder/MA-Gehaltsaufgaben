// Fertige Fälle als Startpunkt. Alle Firmen und Personen sind erfunden.
import { newFall, newPosten } from './model.js';

const person = (extra) => ({
  name: 'Erika Mustermann',
  strasse: 'Beispielweg 7',
  ort: '12345 Musterstadt',
  personalnr: '00001',
  geburtsjahr: 1995,
  steuerklasse: 1,
  kinder: 0,
  konfession: 'keine',
  kirchensteuersatz: 9,
  krankenkasse: 'Muster-Krankenkasse',
  zusatzbeitrag: 290,
  minijob: false,
  ...extra,
});

const firma = (name) => ({ name, strasse: 'Musterstraße 1', ort: '12345 Musterstadt' });

export const SCENARIOS = [
  {
    id: 'verkaeuferin',
    titel: 'Verkäuferin in Vollzeit',
    beschreibung: 'Steuerklasse I, Monatsgehalt 2.650 €',
    build: () =>
      newFall({
        titel: 'Verkäuferin in Vollzeit',
        firma: firma('Sport Sommer GmbH'),
        person: person({ name: 'Lena Berger', personalnr: '00012', geburtsjahr: 1998 }),
        posten: [newPosten('gehalt', { faktor: 265000 })],
      }),
  },
  {
    id: 'azubi',
    titel: 'Auszubildender, 1. Lehrjahr',
    beschreibung: 'Ausbildungsvergütung 1.100 €, unter 23 Jahren',
    build: () =>
      newFall({
        titel: 'Auszubildender, 1. Lehrjahr',
        firma: firma('Autohaus Neumann KG'),
        person: person({ name: 'Tim Schubert', personalnr: '00031', geburtsjahr: 2008 }),
        posten: [newPosten('gehalt', { bezeichnung: 'Ausbildungsvergütung', faktor: 110000 })],
      }),
  },
  {
    id: 'minijob',
    titel: 'Minijob im Café',
    beschreibung: 'Stundenlohn 13,90 € (Mindestlohn), 40 Stunden',
    build: () =>
      newFall({
        titel: 'Minijob im Café',
        art: 'lohn',
        firma: firma('Café Rosengarten'),
        person: person({ name: 'Mia Hoffmann', personalnr: '00044', geburtsjahr: 2006, minijob: true }),
        posten: [newPosten('stundenlohn', { menge: 4000, faktor: 1390 })],
      }),
  },
  {
    id: 'handwerker',
    titel: 'Handwerker mit Überstunden',
    beschreibung: 'Stundenlohn 18,50 €, 160 Std plus 12 Überstunden',
    build: () =>
      newFall({
        titel: 'Handwerker mit Überstunden',
        art: 'lohn',
        firma: firma('Elektro Franke GmbH'),
        person: person({ name: 'Jonas Wagner', personalnr: '00027', geburtsjahr: 1990, konfession: 'ev' }),
        posten: [
          newPosten('stundenlohn', { menge: 16000, faktor: 1850 }),
          newPosten('ueberstunden', { menge: 1200, faktor: 1850 }),
          newPosten('fahrtkosten', { faktor: 4500 }),
        ],
      }),
  },
  {
    id: 'pflege',
    titel: 'Pflegekraft mit Zuschlägen',
    beschreibung: 'Gehalt 3.100 € plus Nacht- und Sonntagszuschläge',
    build: () =>
      newFall({
        titel: 'Pflegekraft mit Zuschlägen',
        firma: firma('Seniorenhaus Abendsonne'),
        person: person({ name: 'Sabine Keller', personalnr: '00058', geburtsjahr: 1987, konfession: 'rk' }),
        posten: [
          newPosten('gehalt', { faktor: 310000 }),
          newPosten('nacht', { menge: 2400, faktor: 1790 }),
          newPosten('sonntag', { menge: 1600, faktor: 1790 }),
        ],
      }),
  },
  {
    id: 'klasse3',
    titel: 'Verheiratet, Steuerklasse III, 2 Kinder',
    beschreibung: 'Monatsgehalt 4.200 €, Ehepartner in Klasse V',
    build: () =>
      newFall({
        titel: 'Verheiratet, Steuerklasse III, 2 Kinder',
        firma: firma('Maschinenbau Lindner AG'),
        person: person({ name: 'Markus Lindner', personalnr: '00103', geburtsjahr: 1984, steuerklasse: 3, kinder: 2, konfession: 'ev' }),
        posten: [newPosten('gehalt', { faktor: 420000 })],
      }),
  },
  {
    id: 'klasse5',
    titel: 'Verheiratet, Steuerklasse V, Teilzeit',
    beschreibung: 'Teilzeit 1.800 €, Gegenstück zu Klasse III',
    build: () =>
      newFall({
        titel: 'Verheiratet, Steuerklasse V, Teilzeit',
        firma: firma('Praxis Dr. Albrecht'),
        person: person({ name: 'Petra Lindner', personalnr: '00019', geburtsjahr: 1986, steuerklasse: 5, kinder: 2, konfession: 'ev' }),
        posten: [newPosten('gehalt', { bezeichnung: 'Gehalt (Teilzeit)', faktor: 180000 })],
      }),
  },
  {
    id: 'weihnachtsgeld',
    titel: 'Weihnachtsgeld im November',
    beschreibung: 'Gehalt 2.900 € und ein volles Monatsgehalt als Weihnachtsgeld',
    build: () =>
      newFall({
        titel: 'Weihnachtsgeld im November',
        monat: 11,
        firma: firma('Möbelhaus Brandt'),
        person: person({ name: 'Kai Richter', personalnr: '00077', geburtsjahr: 1992 }),
        posten: [newPosten('gehalt', { faktor: 290000 }), newPosten('weihnachtsgeld', { faktor: 290000 })],
      }),
  },
  {
    id: 'gutverdiener',
    titel: 'Gutverdienender über der Beitragsgrenze',
    beschreibung: 'Gehalt 9.200 € – die Beitragsbemessungsgrenzen greifen',
    build: () =>
      newFall({
        titel: 'Gutverdienender über der Beitragsgrenze',
        firma: firma('Software Winter GmbH'),
        person: person({ name: 'Dr. Felix Winter', personalnr: '00002', geburtsjahr: 1980, kinder: 1 }),
        posten: [newPosten('gehalt', { faktor: 920000 })],
      }),
  },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id);
