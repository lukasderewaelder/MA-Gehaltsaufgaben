import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import { bpOf, fmtBp, fmtCents, mul, parseNumber, parseScaled } from '../src/calc/money.js';
import { ratesFor } from '../src/calc/rates.js';
import { kvBeitragssatz, pvBeitragssatz, sozialversicherung } from '../src/calc/sv.js';
import { einkommensteuer, jahresLohnsteuer, soliJahr, tabellenLohnsteuer, tabellenStufe } from '../src/calc/tax.js';
import { newFall, newPosten } from '../src/model.js';

const R = ratesFor(2026);

test('Geld: Runden, Formatieren, Einlesen', () => {
  assert.equal(mul(10, 1, 2), 5);
  assert.equal(mul(5, 1, 2), 3); // 2,5 -> 3
  assert.equal(bpOf(300000, 930), 27900);
  assert.equal(fmtCents(123456), '1.234,56');
  assert.equal(fmtCents(-5), '−0,05');
  assert.equal(fmtBp(930), '9,3');
  assert.equal(fmtBp(2500), '25');
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('12,5 %'), 12.5);
  assert.equal(parseNumber('1.234'), 1234);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseScaled('2.500,00 €'), 250000);
});

test('Tarif § 32a EStG 2026: Grenzen und Stichproben', () => {
  assert.equal(einkommensteuer(12348, R), 0);
  assert.equal(einkommensteuer(17799, R), 1034);
  assert.equal(einkommensteuer(17800, R), 1035);
  assert.equal(einkommensteuer(69878, R), 18213);
  assert.equal(einkommensteuer(69879, R), 18213);
  assert.equal(einkommensteuer(100000, R), 30864);
  assert.equal(einkommensteuer(300000, R), 115529);
  // Der Tarif steigt nie sinkend
  let last = 0;
  for (let x = 0; x <= 320000; x += 997) {
    const t = einkommensteuer(x, R);
    assert.ok(t >= last, `Tarif sinkt bei ${x}`);
    last = t;
  }
});

test('Steuerklassen: Splitting (III) und Klasse V/VI', () => {
  assert.equal(jahresLohnsteuer(60000, 3, R), 2 * einkommensteuer(30000, R));
  assert.equal(jahresLohnsteuer(30000, 1, R), einkommensteuer(30000, R));
  // V ist teurer als I, III billiger als I
  assert.ok(jahresLohnsteuer(30000, 5, R) > jahresLohnsteuer(30000, 1, R));
  assert.ok(jahresLohnsteuer(30000, 3, R) < jahresLohnsteuer(30000, 1, R));
  // Hoher Verdienst: Klasse V nähert sich dem Spitzensatz
  assert.equal(jahresLohnsteuer(100000, 5, R), 2 * (einkommensteuer(125000, R) - einkommensteuer(75000, R)));
});

test('Solidaritätszuschlag: Freigrenze und Milderungszone', () => {
  assert.equal(soliJahr(20350, 1, R), 0);
  assert.equal(soliJahr(30000, 1, R), bpOf(3000000, 550) - 0 > 0 ? Math.min(bpOf(3000000, 550), bpOf((30000 - 20350) * 100, 1190)) : 0);
  assert.equal(soliJahr(50000, 1, R), bpOf(5000000, 550)); // volle 5,5 %
  assert.equal(soliJahr(40700, 3, R), 0); // Splitting: doppelte Grenze
});

test('Sozialversicherung: Sätze, Pflegeversicherung nach Kindern', () => {
  const person = { kinder: 0, geburtsjahr: 1995, zusatzbeitrag: 290 };
  assert.equal(kvBeitragssatz(person, R).bp, 875);
  assert.equal(pvBeitragssatz(person, R), 240); // 1,8 % + 0,6 % Kinderlose
  assert.equal(pvBeitragssatz({ ...person, kinder: 1 }, R), 180);
  assert.equal(pvBeitragssatz({ ...person, kinder: 3 }, R), 130); // 2 Abschläge à 0,25
  assert.equal(pvBeitragssatz({ ...person, geburtsjahr: 2005 }, R), 180); // unter 23: kein Zuschlag
  const sv = sozialversicherung({ svLaufend: 300000, person, rates: R });
  assert.deepEqual(sv.an, { kv: 26250, rv: 27900, av: 3900, pv: 7200 });
});

test('Sozialversicherung: Beitragsbemessungsgrenzen', () => {
  const person = { kinder: 0, geburtsjahr: 1995 };
  const sv = sozialversicherung({ svLaufend: 1000000, person, rates: R });
  assert.equal(sv.brutto.rv, R.bbgRv);
  assert.equal(sv.brutto.kv, R.bbgKv);
  // Sonderzahlung im Dezember bei niedrigem Brutto zählt voll, bei hohem wird sie gekappt
  const niedrig = sozialversicherung({ svLaufend: 300000, svEinmalig: 300000, monat: 12, person, rates: R });
  assert.equal(niedrig.brutto.rv, 600000);
  const hoch = sozialversicherung({ svLaufend: 900000, svEinmalig: 300000, monat: 12, person, rates: R });
  assert.equal(hoch.brutto.rv, R.bbgRv);
});

function gehaltFall(extra = {}) {
  return newFall({ posten: [newPosten('gehalt', { faktor: 300000 })], steuer: { modus: 'formel', prozent: 1500, soli: true }, ...extra });
}

test('Gehaltszettel 3.000 €, Klasse I, nach Tarif (von Hand nachgerechnet)', () => {
  const r = berechne(gehaltFall());
  assert.equal(r.gesamtBrutto, 300000);
  assert.equal(r.kv, 26250);
  assert.equal(r.rv, 27900);
  assert.equal(r.av, 3900);
  assert.equal(r.pv, 7200);
  assert.equal(r.svAbzuege, 65250);
  // zvE 36000 − 1230 − 36 − 7362 = 27372 → ESt 3488 € → 290,67 € je Monat
  assert.equal(r.steuerDetail.zvE, 27372);
  assert.equal(r.lst, 29067);
  assert.equal(r.soli, 0);
  assert.equal(r.kist, 0);
  assert.equal(r.netto, 300000 - 29067 - 65250);
  assert.equal(r.auszahlung, r.netto);
});

test('Kirchensteuer und Prozentmodus', () => {
  const kirche = berechne(gehaltFall({ person: { ...gehaltFall().person, konfession: 'ev' } }));
  assert.equal(kirche.kist, 2616); // 9 % von 3488 € / 12
  const prozent = berechne(gehaltFall({ steuer: { modus: 'prozent', prozent: 1500, soli: false } }));
  assert.equal(prozent.lst, 45000);
  assert.equal(prozent.soli, 0);
});

test('Lohnsteuertabelle: Stufen und Näherung zum Tarif', () => {
  assert.deepEqual(tabellenStufe(302500), { von: 300000, bis: 304999, mitte: 302500 });
  const a = tabellenLohnsteuer(300000, 1, R).lohnsteuer;
  const b = tabellenLohnsteuer(304999, 1, R).lohnsteuer;
  assert.equal(a, b, 'gleiche Zeile, gleicher Wert');
  const formel = berechne(gehaltFall()).lst;
  assert.ok(Math.abs(a - formel) < 3000, `Tabelle ${a} und Tarif ${formel} liegen nah beieinander`);
  const tab = berechne(gehaltFall({ steuer: { modus: 'tabelle', prozent: 1500, soli: true } }));
  assert.equal(tab.lst, a);
});

test('Zuschläge, steuerfreie Bezüge und Sonderzahlung', () => {
  const fall = newFall({
    posten: [
      newPosten('stundenlohn', { menge: 16000, faktor: 1500 }), // 160 Std × 15 €
      newPosten('nacht', { menge: 2000, faktor: 1500 }), // 20 Std × 15 € × 25 %
      newPosten('weihnachtsgeld', { faktor: 100000 }),
    ],
    monat: 11,
    steuer: { modus: 'formel', prozent: 1500, soli: true },
  });
  const r = berechne(fall);
  assert.equal(r.posten[0].betrag, 240000);
  assert.equal(r.posten[1].betrag, 7500);
  assert.equal(r.gesamtBrutto, 240000 + 7500 + 100000);
  // Nachtzuschlag ist steuer- und SV-frei, Weihnachtsgeld nicht
  assert.equal(r.stBrutto, 240000 + 100000);
  assert.equal(r.rvBrutto, 240000 + 100000);
  assert.ok(r.steuerDetail.sonderLst > 0, 'Sonderzahlung wird zusätzlich versteuert');
  const ohne = berechne({ ...fall, posten: fall.posten.slice(0, 2) });
  assert.ok(r.lst > ohne.lst);
});

test('Überschreiben: abhängige Felder rechnen mit dem neuen Wert weiter', () => {
  const fall = gehaltFall();
  fall.ueberschreibungen = { rv: 30000 };
  const r = berechne(fall);
  assert.equal(r.rv, 30000);
  assert.equal(r.weg.rv.ueberschrieben, true);
  assert.equal(r.svAbzuege, 26250 + 30000 + 3900 + 7200);
  assert.equal(r.netto, 300000 - r.steuerAbzuege - r.svAbzuege);
});

test('Überschriebene Lohnsteuer wirkt auf Kirchensteuer und Soli', () => {
  const fall = gehaltFall({ person: { ...gehaltFall().person, konfession: 'ev' }, steuer: { modus: 'tabelle', prozent: 1500, soli: true } });
  fall.ueberschreibungen = { lst: 200000 };
  const r = berechne(fall);
  assert.equal(r.kist, 18000); // 9 % von 2.000 €
  assert.ok(r.soli > 0, '24.000 € Jahressteuer liegen über der Freigrenze (20.350 €)');
  fall.ueberschreibungen = { lst: 10000 };
  assert.equal(berechne(fall).soli, 0);
});

test('Netto-Abzüge und Arbeitgeberkosten', () => {
  const fall = gehaltFall();
  fall.posten.push(newPosten('vwlAn', { faktor: 4000 }));
  const r = berechne(fall);
  assert.equal(r.nettoAbzuege, 4000);
  assert.equal(r.auszahlung, r.netto - 4000);
  assert.equal(r.agAnteil, 26250 + 27900 + 3900 + 5400); // AG zahlt PV ohne Kinderlosen-Zuschlag
  assert.equal(r.gesamtKosten, 300000 + r.agAnteil);
});

test('Minijob: keine Abzüge', () => {
  const fall = gehaltFall();
  fall.person.minijob = true;
  fall.posten = [newPosten('gehalt', { faktor: 55600 })];
  const r = berechne(fall);
  assert.equal(r.steuerAbzuege, 0);
  assert.equal(r.svAbzuege, 0);
  assert.equal(r.auszahlung, 55600);
});

test('Invarianten über viele Fälle: Netto = Brutto − Abzüge, nichts negativ', () => {
  for (const brutto of [0, 55600, 120000, 250000, 450000, 800000, 1200000]) {
    for (const klasse of [1, 2, 3, 4, 5, 6]) {
      for (const modus of ['tabelle', 'formel', 'prozent']) {
        const fall = gehaltFall({ steuer: { modus, prozent: 1500, soli: true } });
        fall.person.steuerklasse = klasse;
        fall.person.kinder = klasse === 2 ? 1 : 0;
        fall.posten = [newPosten('gehalt', { faktor: brutto })];
        const r = berechne(fall);
        assert.equal(r.netto, r.gesamtBrutto - r.steuerAbzuege - r.svAbzuege);
        for (const k of ['lst', 'soli', 'kist', 'kv', 'rv', 'av', 'pv', 'netto']) assert.ok(r[k] >= 0, `${k} < 0 bei ${brutto}/${klasse}/${modus}`);
      }
    }
  }
});
