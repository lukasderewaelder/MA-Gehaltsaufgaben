// Parameter je Jahr. Prozentsätze in Basispunkten (1 % = 100), Beträge in Cent, Jahreswerte der Steuer in Euro.
// Stand 2026, geprüft am 27.10.2026 gegen:
//   § 32a EStG (gesetze-im-internet.de), Rechengrößen der Sozialversicherung 2026 (krankenkassen.de, HWK-Rundschreiben),
//   Soli-Freigrenze 20.350 € (BMF/Steuerportale). Ein weiteres Jahr braucht nur einen weiteren Eintrag.

export const RATES = {
  2026: {
    jahr: 2026,
    // Sozialversicherung (Arbeitnehmeranteile)
    rv: 930, // 18,6 % gesamt
    av: 130, // 2,6 % gesamt
    kvAllgemein: 730, // 14,6 % gesamt
    kvZusatzDurchschnitt: 290, // durchschnittlicher Zusatzbeitrag (gesamt, wird hälftig geteilt)
    pv: 180, // 3,6 % gesamt
    pvKinderlosZuschlag: 60,
    pvAbschlagProKind: 25, // ab dem 2. Kind, höchstens für 4 Kinder (2.–5. Kind)
    bbgRv: 845000, // 8.450 € je Monat (Rente/Arbeitslosenversicherung)
    bbgKv: 581250, // 5.812,50 € je Monat (Kranken-/Pflegeversicherung)
    mindestlohn: 1390,
    minijob: 60300, // 603 € je Monat
    // Steuer
    grundfreibetrag: 12348,
    zone2Ende: 17799,
    zone3Ende: 69878,
    zone4Ende: 277825,
    tarif: { a2: 914.51, a3: 173.1, c3: 1034.87, s4: 0.42, k4: 11135.63, s5: 0.45, k5: 19470.38 },
    arbeitnehmerPauschbetrag: 1230,
    sonderausgabenPauschbetrag: 36,
    entlastungsbetragAlleinerziehend: 4260,
    kinderfreibetrag: 9756, // je Kind für beide Elternteile
    soliSatz: 550,
    soliMilderung: 1190,
    soliFreigrenze: 20350, // Jahressteuer, Einzelveranlagung (Splitting: doppelt)
    kistSatz: { 8: 800, 9: 900 },
  },
};

export const YEARS = Object.keys(RATES).map(Number);

export const ratesFor = (jahr) => RATES[jahr] ?? RATES[Math.max(...YEARS)];
