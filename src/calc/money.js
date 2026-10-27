// Geldrechnen mit ganzen Cent (keine Gleitkommafehler) und deutsche Ein-/Ausgabe.

/** Rundet `cents * num / den` kaufmännisch (0,5 und mehr wird aufgerundet). */
export function mul(cents, num, den = 1) {
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(cents) * num * 2 + den) / (den * 2));
}

/** Prozentsatz in Basispunkten (9,3 % = 930) von einem Betrag in Cent. */
export const bpOf = (cents, bp) => mul(cents, bp, 10000);

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 123456 -> "1.234,56" */
export function fmtCents(cents) {
  const abs = Math.abs(cents);
  const text = `${group(Math.floor(abs / 100))},${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `−${text}` : text;
}

/** Hundertstel (z. B. Stunden 10400) -> "104,00" */
export const fmtHundredths = fmtCents;

/** Basispunkte -> "9,3" (ohne überflüssige Nullen) */
export function fmtBp(bp) {
  const text = (bp / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
  return text.replace('.', ',');
}

/** Zahl aus deutscher oder englischer Schreibweise ("1.234,5", "12,5", "12.5"); sonst null. */
export function parseNumber(input) {
  let s = String(input ?? '').replace(/[\s€%]/g, '').replace('−', '-');
  if (!s || !/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^-?\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, ''); // "1.234" = Tausenderpunkt
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Text -> ganze Zahl mal `scale` (Euro -> Cent: 100). Ungültig -> null. */
export function parseScaled(input, scale = 100) {
  const n = parseNumber(input);
  return n === null ? null : Math.round(n * scale);
}
