// Tarifliche Einkommensteuer nach § 32a EStG (Programmablaufplan UPTAB26), getrennt, damit tax.js und pap2026.js sie teilen.

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
