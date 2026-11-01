// Datenmodell Kassenzettel: Laden, Zeilen, Rabatt, gegebener Betrag und die Aufgabe dazu. Beträge in Cent, Rabatt in Basispunkten.
import { uid } from './model.js';

const num = (v, fallback, min = -Infinity, max = Infinity) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export const VARIANTEN = { einfach: 'Einfach', standard: 'Standard' };
export const BASEN = { netto: 'Netto gegeben', brutto: 'Brutto gegeben' };

export const newZeile = (werte = {}) => ({ id: uid(), art: 'artikel', name: 'Artikel', menge: 1, preis: 100, satz: 'B', ...werte });

export function newBon(overrides = {}) {
  const now = Date.now();
  return normalizeBon({
    id: uid(),
    titel: 'Neuer Kassenzettel',
    laden: 'Markt Sonne',
    strasse: 'Hauptstraße 3',
    ort: '12345 Musterstadt',
    datum: '12.03.2026',
    uhrzeit: '10:14',
    bonNr: '4711',
    variante: 'einfach',
    basis: 'netto',
    zeilen: [newZeile({ name: 'Milch', preis: 120, satz: 'B' }), newZeile({ name: 'Seife', preis: 250, satz: 'A' })],
    rabatt: 0,
    gegeben: 0,
    aufgabe: { gesucht: ['summe', 'mwst:A', 'mwst:B'] },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function normalizeAufgabe(a) {
  const raw = a ?? {};
  return {
    titel: str(raw.titel),
    sachtext: typeof raw.sachtext === 'string' ? raw.sachtext : null,
    texte: Object.fromEntries(Object.entries(raw.texte ?? {}).filter(([, v]) => typeof v === 'string')),
    gesucht: Array.isArray(raw.gesucht) ? raw.gesucht.filter((g) => typeof g === 'string') : [],
    blatt: oneOf(raw.blatt, ['aufgabe', 'zettel'], 'aufgabe'),
    zeilen: num(raw.zeilen, 2, 0, 5),
    beiblatt: raw.beiblatt !== false,
  };
}

export function normalizeBon(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const now = Date.now();
  return {
    kind: 'bon',
    id: raw.id,
    titel: str(raw.titel, 'Kassenzettel'),
    laden: str(raw.laden),
    strasse: str(raw.strasse),
    ort: str(raw.ort),
    datum: str(raw.datum),
    uhrzeit: str(raw.uhrzeit),
    bonNr: str(raw.bonNr),
    variante: oneOf(raw.variante, Object.keys(VARIANTEN), 'einfach'),
    basis: oneOf(raw.basis, Object.keys(BASEN), 'netto'),
    zeilen: (Array.isArray(raw.zeilen) ? raw.zeilen : [])
      .filter((z) => z && typeof z === 'object')
      .map((z) => ({
        id: str(z.id) || uid(),
        art: oneOf(z.art, ['artikel', 'pfand'], 'artikel'),
        name: str(z.name),
        menge: num(z.menge, 1, 1, 999),
        preis: num(z.preis, 0, 0, 10_000_000),
        satz: oneOf(z.satz, ['A', 'B'], 'B'),
      })),
    rabatt: num(raw.rabatt, 0, 0, 10000),
    gegeben: num(raw.gegeben, 0, 0, 100_000_000),
    aufgabe: normalizeAufgabe(raw.aufgabe),
    zufall: raw.zufall && typeof raw.zufall === 'object' ? raw.zufall : null,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

export function duplicateBon(bon) {
  const kopie = structuredClone(bon);
  const now = Date.now();
  const alt = new Map();
  for (const z of kopie.zeilen) {
    const neu = uid();
    alt.set(z.id, neu);
    z.id = neu;
  }
  kopie.aufgabe.gesucht = kopie.aufgabe.gesucht.map((g) => (g.startsWith('z:') ? `z:${alt.get(g.slice(2)) ?? g.slice(2)}` : g));
  kopie.aufgabe.texte = Object.fromEntries(Object.entries(kopie.aufgabe.texte).map(([k, v]) => [k.startsWith('z:') ? `z:${alt.get(k.slice(2)) ?? k.slice(2)}` : k, v]));
  return { ...kopie, id: uid(), titel: `${bon.titel} (Kopie)`, createdAt: now, updatedAt: now };
}
