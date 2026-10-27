// Mischblatt: ein Aufgabenblatt aus mehreren Aufgaben, jede mit eigenem Fall und eigener Art (Vorwärts- und Rückwärtsaufgaben gemischt).
// Jede Aufgabe trägt einen vollständigen Zettel (`fall`); der Typ bestimmt, welcher Ausschnitt des Zettels gezeigt wird und was gesucht ist.
import { berechne } from './calc/payroll.js';
import { defaultSpec, erzeugeFall } from './generators/faelle.js';
import { makeRng, randomSeed } from './generators/rng.js';
import { POSTEN_TYPEN, normalizeFall } from './model.js';

export const MISCH_SCHEMA = 1;
export const MAX_AUFGABEN = 8;

/** Aufgabentypen: Ausschnitt des Zettels (`nur`), Anzeigename und ob die Lohnsteuertabelle dazugehört. */
export const MISCH_TYPEN = {
  bezuege: { label: 'Bezüge berechnen', nur: ['bezuege'], rueck: false },
  sv: { label: 'Sozialversicherung berechnen', nur: ['steuer'], rueck: false },
  steuer: { label: 'Steuern ermitteln', nur: ['steuer'], rueck: false, tabelle: true },
  netto: { label: 'Netto berechnen', nur: ['bezuege', 'steuer'], rueck: false },
  beitrag: { label: 'Rückwärts: Beitrag und Satz → Brutto', nur: ['steuer'], rueck: true },
  stundenlohn: { label: 'Rückwärts: Stundenlohn, Stunden oder Zuschlag', nur: ['bezuege'], rueck: true },
  quote: { label: 'Rückwärts: Netto und Abzugsquote → Brutto', nur: [], rueck: true },
  probieren: { label: 'Rückwärts: Wunsch-Netto → Brutto (Probieren)', nur: [], rueck: true, tabelle: true },
};
export const ALLE_TYPEN = Object.keys(MISCH_TYPEN);

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const oneOf = (v, liste, d) => (liste.includes(v) ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/** Einstellungen für die Zufallsauswahl (Stufe, Startwert, Anzahl, gewählte Typen, Schalter). */
export function normalizeMischSpec(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    stufe: oneOf(s.stufe, ['leicht', 'mittel', 'schwer'], 'mittel'),
    seed: num(s.seed, 1, 0, 4294967295),
    strukturSeed: Number.isFinite(s.strukturSeed) ? num(s.strukturSeed, 1, 0, 4294967295) : null,
    anzahl: num(s.anzahl, 4, 1, MAX_AUFGABEN),
    typen: (Array.isArray(s.typen) ? s.typen : []).filter((t) => ALLE_TYPEN.includes(t)),
    art: oneOf(s.art, ['gehalt', 'lohn', 'gemischt'], 'gemischt'),
    steuer: oneOf(s.steuer, ['prozent', 'tabelle', 'formel'], 'tabelle'),
    glatt: bool(s.glatt, false),
    kirche: bool(s.kirche, true),
    kinder: bool(s.kinder, true),
    klassen: oneOf(s.klassen, ['I', 'alle'], 'I'),
    gruppe: num(s.gruppe, 0, 0, 25),
  };
}

export function defaultMischSpec(stufe = 'mittel', seed = randomSeed()) {
  const d = defaultSpec(stufe, seed);
  return normalizeMischSpec({ stufe, seed, anzahl: 4, typen: [], art: 'gemischt', steuer: d.steuer, glatt: d.glatt, kirche: d.kirche, kinder: d.kinder, klassen: d.klassen });
}

/** Bringt beliebige Daten in die Form eines gültigen Mischblatts (oder null). */
export function normalizeMisch(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !Array.isArray(raw.aufgaben)) return null;
  const now = Date.now();
  const aufgaben = raw.aufgaben
    .map((a) => {
      const fall = normalizeFall(a?.fall);
      return fall && ALLE_TYPEN.includes(a.typ) ? { id: typeof a.id === 'string' && a.id ? a.id : uid(), typ: a.typ, fall } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_AUFGABEN);
  return {
    schema: MISCH_SCHEMA,
    kind: 'misch',
    id: raw.id,
    titel: typeof raw.titel === 'string' ? raw.titel : 'Mischblatt',
    intro: typeof raw.intro === 'string' ? raw.intro : '',
    beiblatt: bool(raw.beiblatt, true),
    zeilen: num(raw.zeilen, 2, 0, 5),
    aufgaben,
    zufall: raw.zufall ? normalizeMischSpec(raw.zufall) : null,
    createdAt: num(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: num(raw.updatedAt, now, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** Stellt den Fall der Aufgabe auf den Typ ein: gesuchte Felder oder Rückwärtsaufgabe. */
export function richteEin(typ, fall, rng = makeRng(1)) {
  const r = berechne(fall);
  const a = fall.aufgabe;
  a.blatt = 'aufgabe';
  a.beiblatt = false;
  a.rueck = null;
  a.texte = {};
  a.sachtext = null;
  a.gesucht = [];
  const rechenposten = r.bruttoPosten.filter((p) => ['menge', 'zuschlag'].includes(POSTEN_TYPEN[p.typ]?.art)).map((p) => `p:${p.id}`);
  const hatZuschlag = r.bruttoPosten.some((p) => POSTEN_TYPEN[p.typ]?.art === 'zuschlag');
  if (typ === 'bezuege') a.gesucht = [...rechenposten, 'gesamtBrutto'];
  else if (typ === 'sv') a.gesucht = ['kv', 'rv', 'av', 'pv', 'svAbzuege'];
  else if (typ === 'steuer') a.gesucht = ['lst', ...(r.soli > 0 ? ['soli'] : []), ...(r.kist > 0 ? ['kist'] : []), 'steuerAbzuege'];
  else if (typ === 'netto') a.gesucht = ['steuerAbzuege', 'svAbzuege', 'netto'];
  else if (typ === 'beitrag') a.rueck = { typ, param: rng.pick(['rv', 'kv', 'av']) };
  else if (typ === 'stundenlohn') a.rueck = { typ, param: rng.pick(hatZuschlag ? ['stundenlohn', 'stunden', 'zuschlag'] : ['stundenlohn', 'stunden']) };
  else a.rueck = { typ, param: '' };
  return fall;
}

/** Fall-Einstellungen für einen Aufgabentyp (z. B. Stundenlohn braucht einen Lohn-Fall). */
function fallSpec(typ, spec) {
  const basis = defaultSpec(spec.stufe, spec.seed);
  const s = {
    ...basis,
    art: spec.art,
    steuer: spec.steuer,
    glatt: spec.glatt,
    kirche: spec.kirche,
    kinder: spec.kinder,
    klassen: spec.klassen,
    zuschlaege: spec.stufe !== 'leicht',
    sonderzahlung: false,
    ueberBbg: false,
    minijob: false,
    rueck: '',
    aufgabe: 'komplett',
  };
  if (typ === 'stundenlohn') return { ...s, art: 'lohn', zuschlaege: true };
  if (typ === 'bezuege') return { ...s, zuschlaege: true };
  if (typ === 'steuer' && spec.stufe === 'leicht') return { ...s, steuer: 'prozent' };
  return s;
}

/** Erzeugt eine Aufgabe des Typs; `zusatz` = gemeinsamer Zusatzbeitrag der Krankenkasse für das ganze Blatt. */
export function baueAufgabe(typ, spec, { seed, strukturSeed, zusatz = null }) {
  const fall = erzeugeFall({ ...fallSpec(typ, spec), seed, strukturSeed });
  if (zusatz !== null) fall.person.zusatzbeitrag = zusatz;
  richteEin(typ, fall, makeRng(strukturSeed ?? seed));
  return { id: uid(), typ, fall };
}

/** Welche Typen kommen vor? Gewählte Typen der Reihe nach, sonst eine zufällige Auswahl ohne Wiederholung. */
export function waehleTypen(spec, sr) {
  if (spec.typen.length) return Array.from({ length: spec.anzahl }, (_, i) => spec.typen[i % spec.typen.length]);
  const pool = [...ALLE_TYPEN];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = sr.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: spec.anzahl }, (_, i) => pool[i % pool.length]);
}

const buchstabe = (g) => (g > 0 ? ` (Gruppe ${String.fromCharCode(64 + g)})` : '');

/** Ein Mischblatt aus den Einstellungen. Gleiche Einstellungen und Startwerte ergeben dasselbe Blatt. */
export function erzeugeMischblatt(eingabe) {
  const spec = normalizeMischSpec(eingabe);
  const struktur = spec.strukturSeed ?? spec.seed;
  const typen = waehleTypen(spec, makeRng(struktur));
  let zusatz = null;
  const aufgaben = typen.map((typ, i) => {
    const aufgabe = baueAufgabe(typ, spec, { seed: spec.seed + i * 17 + 1, strukturSeed: struktur + i * 13 + 1, zusatz });
    zusatz ??= aufgabe.fall.person.zusatzbeitrag;
    return aufgabe;
  });
  const now = Date.now();
  return normalizeMisch({
    id: uid(),
    titel: `Lohn und Gehalt – Aufgaben${buchstabe(spec.gruppe)}`,
    aufgaben,
    zufall: spec,
    createdAt: now,
    updatedAt: now,
  });
}

/** `anzahl` Mischblätter (Gruppen A, B, …): gleicher Aufbau (Typen, Berufe, Steuerklassen), andere Zahlen. */
export function erzeugeMischGruppen(eingabe, anzahl = 1) {
  const spec = normalizeMischSpec(eingabe);
  return Array.from({ length: anzahl }, (_, g) =>
    erzeugeMischblatt({ ...spec, seed: spec.seed + g, strukturSeed: anzahl > 1 ? spec.seed : null, gruppe: anzahl > 1 ? g + 1 : 0 }),
  );
}

/** Aufgabe `index` neu würfeln (anderer Fall, gleicher Typ) oder durch einen anderen Typ ersetzen. */
export function ersetzeAufgabe(blatt, index, typ = blatt.aufgaben[index].typ) {
  const spec = normalizeMischSpec({ ...(blatt.zufall ?? defaultMischSpec()), gruppe: 0 });
  const seed = randomSeed();
  const zusatz = index === 0 ? null : blatt.aufgaben[0].fall.person.zusatzbeitrag;
  const neu = baueAufgabe(typ, spec, { seed, strukturSeed: randomSeed(), zusatz });
  neu.id = blatt.aufgaben[index].id;
  blatt.aufgaben[index] = neu;
  return neu;
}

/** Hängt eine neue Aufgabe an. */
export function fuegeAufgabeHinzu(blatt, typ) {
  const spec = normalizeMischSpec({ ...(blatt.zufall ?? defaultMischSpec()), gruppe: 0 });
  const zusatz = blatt.aufgaben[0]?.fall.person.zusatzbeitrag ?? null;
  const aufgabe = baueAufgabe(typ, spec, { seed: randomSeed(), strukturSeed: randomSeed(), zusatz });
  blatt.aufgaben.push(aufgabe);
  return aufgabe;
}

/** Setzt einen Zettel aus der Bibliothek als Aufgabe ein (Kopie) und stellt ihn auf den Typ ein. */
export function setzeFallEin(blatt, index, fall, typ = blatt.aufgaben[index]?.typ ?? 'netto') {
  const kopie = normalizeFall(structuredClone(fall));
  kopie.zufall = null;
  richteEin(typ, kopie, makeRng(randomSeed()));
  const aufgabe = { id: blatt.aufgaben[index]?.id ?? uid(), typ, fall: kopie };
  if (index >= blatt.aufgaben.length) blatt.aufgaben.push(aufgabe);
  else blatt.aufgaben[index] = aufgabe;
  return aufgabe;
}

export function duplicateMisch(blatt) {
  const kopie = structuredClone(blatt);
  const now = Date.now();
  kopie.id = uid();
  kopie.titel = `${blatt.titel} (Kopie)`;
  kopie.aufgaben = kopie.aufgaben.map((a) => ({ ...a, id: uid(), fall: { ...a.fall, id: uid() } }));
  kopie.createdAt = now;
  kopie.updatedAt = now;
  return normalizeMisch(kopie);
}
