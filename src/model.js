// Datenmodell: Fall (= ein Lohn-/Gehaltszettel mit allem, was dazugehört), Posten und Voreinstellungen.
// Beträge in Cent, Mengen in Hundertsteln (104 Std = 10400), Prozentsätze in Basispunkten (25 % = 2500).

export const SCHEMA = 1;
export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Berechnungsart: pauschal = Betrag steht im Faktor; menge = Menge × Faktor; zuschlag = Menge × Grundlohn × Prozentsatz. */
export const POSTEN_TYPEN = {
  gehalt: { label: 'Gehalt', lohnart: '1000', name: 'Gehalt', einheit: 'Mon', art: 'pauschal', st: 'L', sv: 'L', bereich: 'brutto' },
  stundenlohn: { label: 'Stundenlohn', lohnart: '2000', name: 'Stundenlohn', einheit: 'Std', art: 'menge', st: 'L', sv: 'L', bereich: 'brutto' },
  ueberstunden: { label: 'Überstunden (mit Zuschlag)', lohnart: '2100', name: 'Überstunden', einheit: 'Std', art: 'zuschlag', prozent: 12500, st: 'L', sv: 'L', bereich: 'brutto' },
  nacht: { label: 'Nachtzuschlag', lohnart: '2200', name: 'Nachtzuschlag', einheit: 'Std', art: 'zuschlag', prozent: 2500, st: 'F', sv: 'F', bereich: 'brutto' },
  sonntag: { label: 'Sonntagszuschlag', lohnart: '2210', name: 'Sonntagszuschlag', einheit: 'Std', art: 'zuschlag', prozent: 5000, st: 'F', sv: 'F', bereich: 'brutto' },
  feiertag: { label: 'Feiertagszuschlag', lohnart: '2220', name: 'Feiertagszuschlag', einheit: 'Std', art: 'zuschlag', prozent: 12500, st: 'F', sv: 'F', bereich: 'brutto' },
  urlaubsgeld: { label: 'Urlaubsgeld', lohnart: '3000', name: 'Urlaubsgeld', einheit: 'Eur', art: 'pauschal', st: 'S', sv: 'S', bereich: 'brutto' },
  weihnachtsgeld: { label: 'Weihnachtsgeld', lohnart: '3010', name: 'Weihnachtsgeld', einheit: 'Eur', art: 'pauschal', st: 'S', sv: 'S', bereich: 'brutto' },
  vwlAg: { label: 'VWL-Zuschuss Arbeitgeber', lohnart: '4000', name: 'VWL Arbeitgeberanteil', einheit: 'Eur', art: 'pauschal', st: 'L', sv: 'L', bereich: 'brutto' },
  sachbezug: { label: 'Sachbezug', lohnart: '4100', name: 'Sachbezug', einheit: 'Eur', art: 'pauschal', st: 'L', sv: 'L', bereich: 'brutto' },
  fahrtkosten: { label: 'Fahrtkostenzuschuss (steuerfrei)', lohnart: '4200', name: 'Fahrtkostenzuschuss', einheit: 'Eur', art: 'pauschal', st: 'F', sv: 'F', bereich: 'brutto' },
  vwlAn: { label: 'Vermögenswirksame Leistung (Abzug)', lohnart: '9800', name: 'Vermögensbildung', einheit: 'Eur', art: 'pauschal', st: 'F', sv: 'F', bereich: 'netto' },
  vorschuss: { label: 'Vorschuss (Abzug)', lohnart: '9900', name: 'Vorschuss', einheit: 'Eur', art: 'pauschal', st: 'F', sv: 'F', bereich: 'netto' },
};

export const STEUERMODI = {
  tabelle: 'Lohnsteuertabelle (Stufen von 50 €)',
  prozent: 'Fester Prozentsatz',
  formel: 'Rechnerisch nach Steuertarif',
};

export const BLOECKE = {
  verdienst: 'Verdienstbescheinigung (Jahressummen)',
  netto: 'Netto-Bezüge/-Abzüge',
  arbeitgeber: 'Arbeitgeberseite (Gesamtkosten)',
  fehltage: 'Fehltage, Urlaub, Hinweise',
  bank: 'Anschriften und Bankverbindung',
};

export const KONFESSIONEN = { keine: '–', ev: 'ev', rk: 'rk' };

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function newPosten(typ, values = {}) {
  const def = POSTEN_TYPEN[typ] ?? POSTEN_TYPEN.gehalt;
  return {
    id: uid(),
    typ,
    lohnart: def.lohnart,
    bezeichnung: def.name,
    einheit: def.einheit,
    menge: def.art === 'pauschal' ? 100 : 0,
    faktor: 0,
    prozent: def.prozent ?? null,
    st: def.st,
    sv: def.sv,
    bereich: def.bereich,
    ...values,
  };
}

export const DEFAULT_SETTINGS = { optik: 'modern', lastBackupAt: 0, changesSinceBackup: 0 };

const num = (v, fallback, min = -Infinity, max = Infinity) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export function newFall(overrides = {}) {
  const now = Date.now();
  return normalizeFall({
    id: uid(),
    titel: 'Neuer Zettel',
    art: 'gehalt',
    jahr: 2026,
    monat: 3,
    firma: { name: 'Mustermann Handels GmbH', strasse: 'Musterstraße 1', ort: '12345 Musterstadt' },
    person: {
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
    },
    posten: [newPosten('gehalt', { faktor: 300000 })],
    steuer: { modus: 'tabelle', prozent: 1500, soli: true },
    ueberschreibungen: {},
    anzeige: { optik: 'modern', bloecke: {}, erklaermodus: false },
    aufgabe: { gesucht: ['kv', 'rv', 'av', 'pv', 'netto'] },
    hinweis: '',
    fehltage: { urlaub: 0, krank: 0 },
    bank: { name: 'Musterbank', iban: 'DE00 0000 0000 0000 0000 00' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

/**
 * Arbeitsblatt: `gesucht` = Felder, die auf dem Arbeitsblatt leer bleiben; `texte` überschreibt einzelne Teilaufgaben,
 * `sachtext` (null = automatisch) den einleitenden Text; `blatt`: Aufgabenblatt mit Zettel oder nur der Zettel.
 */
function normalizeAufgabe(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    blatt: oneOf(a.blatt, ['aufgabe', 'zettel'], 'aufgabe'),
    beiblatt: a.beiblatt !== false,
    titel: str(a.titel),
    sachtext: typeof a.sachtext === 'string' ? a.sachtext : null,
    gesucht: [...new Set((Array.isArray(a.gesucht) ? a.gesucht : []).filter((id) => typeof id === 'string'))],
    texte: Object.fromEntries(Object.entries(a.texte ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())),
    zeilen: num(a.zeilen, 2, 0, 5),
    rueck: normalizeRueck(a.rueck),
  };
}

/** Rückwärtsaufgabe: null (vorwärts) oder { typ, param }. */
function normalizeRueck(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const typ = oneOf(raw.typ, ['beitrag', 'stundenlohn', 'quote', 'probieren'], null);
  if (!typ) return null;
  const params = { beitrag: ['rv', 'kv', 'av', 'pv'], stundenlohn: ['stundenlohn', 'stunden', 'zuschlag'] };
  return { typ, param: params[typ] ? oneOf(raw.param, params[typ], params[typ][0]) : '' };
}

/** Zufallsfall-Einstellungen (nur wenn der Fall erzeugt wurde, damit „Neu würfeln“ möglich ist); null sonst. */
function normalizeZufall(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const b = (v, d) => (typeof v === 'boolean' ? v : d);
  return {
    stufe: oneOf(raw.stufe, ['leicht', 'mittel', 'schwer'], 'mittel'),
    seed: num(raw.seed, 1, 0, 4294967295),
    strukturSeed: Number.isFinite(raw.strukturSeed) ? num(raw.strukturSeed, 1, 0, 4294967295) : null,
    art: oneOf(raw.art, ['gehalt', 'lohn', 'gemischt'], 'gemischt'),
    aufgabe: oneOf(raw.aufgabe, ['komplett', 'netto', 'sv', 'steuer', 'brutto'], 'komplett'),
    steuer: oneOf(raw.steuer, ['prozent', 'tabelle', 'formel'], 'tabelle'),
    glatt: b(raw.glatt, false),
    zuschlaege: b(raw.zuschlaege, false),
    sonderzahlung: b(raw.sonderzahlung, false),
    kirche: b(raw.kirche, false),
    kinder: b(raw.kinder, false),
    klassen: oneOf(raw.klassen, ['I', 'alle'], 'I'),
    ueberBbg: b(raw.ueberBbg, false),
    minijob: b(raw.minijob, false),
    gruppe: num(raw.gruppe, 0, 0, 25),
    rueck: oneOf(raw.rueck, ['beitrag', 'stundenlohn', 'quote', 'probieren'], ''),
  };
}

/** Macht aus beliebigen (auch unvollständigen oder älteren) Daten einen gültigen Fall. */
export function normalizeFall(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const person = raw.person ?? {};
  const steuer = raw.steuer ?? {};
  const posten = Array.isArray(raw.posten) ? raw.posten : [];
  const now = Date.now();
  return {
    schema: SCHEMA,
    id: raw.id,
    titel: str(raw.titel, 'Zettel'),
    art: oneOf(raw.art, ['gehalt', 'lohn'], 'gehalt'),
    jahr: num(raw.jahr, 2026, 2000, 2100),
    monat: num(raw.monat, 1, 1, 12),
    firma: { name: str(raw.firma?.name), strasse: str(raw.firma?.strasse), ort: str(raw.firma?.ort) },
    person: {
      name: str(person.name),
      strasse: str(person.strasse),
      ort: str(person.ort),
      personalnr: str(person.personalnr),
      geburtsjahr: num(person.geburtsjahr, 1990, 1900, 2100),
      steuerklasse: num(person.steuerklasse, 1, 1, 6),
      kinder: num(person.kinder, 0, 0, 12),
      konfession: oneOf(person.konfession, Object.keys(KONFESSIONEN), 'keine'),
      kirchensteuersatz: oneOf(person.kirchensteuersatz, [8, 9], 9),
      krankenkasse: str(person.krankenkasse),
      zusatzbeitrag: num(person.zusatzbeitrag, 290, 0, 1000),
      minijob: Boolean(person.minijob),
    },
    posten: posten
      .filter((p) => p && typeof p === 'object')
      .map((p) => {
        const typ = oneOf(p.typ, Object.keys(POSTEN_TYPEN), 'gehalt');
        const def = POSTEN_TYPEN[typ];
        return {
          id: str(p.id) || uid(),
          typ,
          lohnart: str(p.lohnart, def.lohnart),
          bezeichnung: str(p.bezeichnung, def.name),
          einheit: str(p.einheit, def.einheit),
          menge: num(p.menge, 0),
          faktor: num(p.faktor, 0),
          prozent: def.art === 'zuschlag' ? num(p.prozent, def.prozent ?? 0, 0, 100000) : null,
          st: oneOf(p.st, ['L', 'S', 'F'], def.st),
          sv: oneOf(p.sv, ['L', 'S', 'F'], def.sv),
          bereich: oneOf(p.bereich, ['brutto', 'netto'], def.bereich),
        };
      }),
    steuer: {
      modus: oneOf(steuer.modus, Object.keys(STEUERMODI), 'tabelle'),
      prozent: num(steuer.prozent, 1500, 0, 6000),
      soli: steuer.soli !== false,
    },
    ueberschreibungen: Object.fromEntries(
      Object.entries(raw.ueberschreibungen ?? {}).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, Math.round(v)]),
    ),
    anzeige: {
      optik: oneOf(raw.anzeige?.optik, ['modern', 'original'], 'modern'),
      bloecke: Object.fromEntries(Object.keys(BLOECKE).map((k) => [k, Boolean(raw.anzeige?.bloecke?.[k])])),
      erklaermodus: Boolean(raw.anzeige?.erklaermodus),
    },
    aufgabe: normalizeAufgabe(raw.aufgabe),
    zufall: normalizeZufall(raw.zufall),
    hinweis: str(raw.hinweis),
    fehltage: { urlaub: num(raw.fehltage?.urlaub, 0, 0, 366), krank: num(raw.fehltage?.krank, 0, 0, 366) },
    bank: { name: str(raw.bank?.name), iban: str(raw.bank?.iban) },
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

export function duplicateFall(fall) {
  const copy = structuredClone(fall);
  const now = Date.now();
  copy.id = uid();
  copy.titel = `${fall.titel} (Kopie)`;
  copy.posten = copy.posten.map((p) => ({ ...p, id: uid() }));
  copy.createdAt = now;
  copy.updatedAt = now;
  return normalizeFall(copy);
}

/** Alle `p:<id>`-Überschreibungen, gesuchten Felder und Texte von Posten, die es nicht mehr gibt, entfernen. */
export function pruneOverrides(fall) {
  const ids = new Set(fall.posten.map((p) => `p:${p.id}`));
  const gone = (key) => key.startsWith('p:') && !ids.has(key);
  for (const key of Object.keys(fall.ueberschreibungen)) if (gone(key)) delete fall.ueberschreibungen[key];
  for (const key of Object.keys(fall.aufgabe.texte)) if (gone(key)) delete fall.aufgabe.texte[key];
  fall.aufgabe.gesucht = fall.aufgabe.gesucht.filter((key) => !gone(key));
  return fall;
}
