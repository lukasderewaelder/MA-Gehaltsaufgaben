// Fester Steuersatz als Standard und die kleine Satz-Tabelle.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne, setzeSteuersatz } from '../src/calc/payroll.js';
import { ratesFor } from '../src/calc/rates.js';
import { SATZ_BRUTTO, effektiverSatz, satzTabelle } from '../src/calc/tax.js';
import { defaultSpec, erzeugeFall } from '../src/generators/faelle.js';
import { defaultMischSpec, erzeugeMischblatt } from '../src/misch.js';
import { renderAufgabe } from '../src/mischsheet.js';
import { newFall, newPosten, normalizeFall } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';
import { lohnsteuerTabelle, renderBlatt, satzTabelleHtml, teilText, teilaufgaben } from '../src/worksheet.js';

const R = ratesFor(2026);

test('Effektiver Steuersatz: ganze Prozent, steigt mit dem Brutto, III < I < V', () => {
  let letzter = -1;
  for (let brutto = 100000; brutto <= 600000; brutto += 25000) {
    const satz = effektiverSatz(brutto, 1, R);
    assert.equal(satz % 100, 0, 'ganze Prozent');
    assert.ok(satz >= letzter, `steigt: ${brutto}`);
    letzter = satz;
  }
  assert.equal(effektiverSatz(300000, 1, R), 1000, '3.000 €, Klasse I: 10 %');
  for (const brutto of SATZ_BRUTTO.slice(2)) {
    assert.ok(effektiverSatz(brutto, 3, R) < effektiverSatz(brutto, 1, R), `III < I bei ${brutto}`);
    assert.ok(effektiverSatz(brutto, 1, R) < effektiverSatz(brutto, 5, R), `I < V bei ${brutto}`);
  }
  assert.equal(effektiverSatz(0, 1, R), 0);
});

test('Kleine Tabelle: acht Zeilen von 1.500 bis 5.000 €, sechs Steuerklassen', () => {
  const t = satzTabelle(R);
  assert.deepEqual(t.zeilen.map((z) => z.brutto), [150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000]);
  assert.deepEqual(t.klassen, [1, 2, 3, 4, 5, 6]);
  assert.ok(t.zeilen.every((z) => z.saetze.length === 6 && z.saetze.every((s) => s >= 0 && s <= 5000)));
  // Klasse I und IV haben dieselben Sätze (ohne Faktorverfahren)
  assert.ok(t.zeilen.every((z) => z.saetze[0] === z.saetze[3]));
});

test('Neue Zettel starten mit festem Steuersatz, ohne Soli, Satz passt zur Tabelle', () => {
  const f = newFall();
  assert.equal(f.steuer.modus, 'prozent');
  assert.equal(f.steuer.soli, false);
  assert.equal(f.steuer.prozent, effektiverSatz(300000, 1, R));
  assert.equal(f.anzeige.einfach, false);
  assert.equal(f.aufgabe.satzAblesen, false);
  const r = berechne(f);
  assert.equal(r.lst, Math.round((300000 * 1000) / 10000));
  assert.equal(r.soli, 0);
});

test('setzeSteuersatz: Satz für Steuerklasse und Brutto aus der Tabelle', () => {
  const f = newFall({ posten: [newPosten('gehalt', { faktor: 450000 })] });
  f.person.steuerklasse = 5;
  setzeSteuersatz(f);
  assert.equal(f.steuer.prozent, effektiverSatz(450000, 5, R));
  f.person.steuerklasse = 3;
  setzeSteuersatz(f);
  assert.equal(f.steuer.prozent, effektiverSatz(450000, 3, R));
});

test('Alle Szenarien und alle Zufallsstufen: fester Satz, Satz aus der Tabelle', () => {
  for (const s of SCENARIOS) {
    const f = s.build();
    const r = berechne(f);
    assert.equal(f.steuer.modus, 'prozent', s.id);
    assert.equal(f.steuer.prozent, effektiverSatz(r.gesamtBrutto, f.person.steuerklasse, R), s.id);
  }
  for (const stufe of ['leicht', 'mittel', 'schwer']) {
    for (let seed = 1; seed <= 25; seed++) {
      const f = erzeugeFall(defaultSpec(stufe, seed * 7));
      assert.equal(f.steuer.modus, 'prozent', `${stufe}/${seed}`);
      assert.equal(f.steuer.prozent, effektiverSatz(berechne(f).gesamtBrutto, f.person.steuerklasse, R), `${stufe}/${seed}`);
      assert.equal(f.steuer.soli, false);
    }
  }
  const b = erzeugeMischblatt(defaultMischSpec('schwer', 3));
  assert.ok(b.aufgaben.every((a) => a.fall.steuer.modus === 'prozent'));
});

test('Alte Zettel behalten ihren Steuermodus, fehlende Angaben bleiben wie früher', () => {
  const alt = normalizeFall({ id: 'a', steuer: { modus: 'tabelle', prozent: 1500, soli: true } });
  assert.equal(alt.steuer.modus, 'tabelle');
  assert.equal(alt.steuer.soli, true);
  assert.equal(normalizeFall({ id: 'b' }).steuer.modus, 'tabelle');
  assert.equal(normalizeFall({ id: 'c' }).anzeige.einfach, false);
});

test('Steuersatz im Text oder in der Tabelle ablesen', () => {
  const f = newFall({ posten: [newPosten('gehalt', { faktor: 300000 })] });
  const r = berechne(f);
  assert.match(teilText(f, r, 'lst'), /Der Steuersatz ist 10 %\. Rechne 10 % vom Steuer-Brutto\./);
  f.aufgabe.satzAblesen = true;
  const ablesen = teilText(f, r, 'lst');
  assert.match(ablesen, /Tabelle auf dem Beiblatt \(Steuerklasse 1, Zeile mit dem Brutto\)/);
  assert.doesNotMatch(ablesen, /10 %/, 'der Satz steht nicht im Text');
  // Die Tabelle steht im Beiblatt; im Lösungsblatt sind Zeile und Spalte markiert, im Arbeitsblatt nicht
  f.aufgabe.beiblatt = true;
  f.aufgabe.gesucht = ['lst'];
  const arbeit = renderBlatt(f, r, { modus: 'arbeit' });
  const loesung = renderBlatt(f, r, { modus: 'loesung' });
  assert.match(arbeit, /Steuersatz nach Brutto und Steuerklasse/);
  assert.doesNotMatch(arbeit.slice(arbeit.indexOf('Steuersatz nach Brutto')), /treffer/);
  assert.match(loesung.slice(loesung.indexOf('Steuersatz nach Brutto')), /class="r treffer"/);
  assert.match(loesung, /Steuersatz ist 10 %|10 % von|10 %/);
  assert.equal(teilaufgaben(f, r).length, 1);
});

test('Satz-Tabelle in der Lösung markiert die passende Zeile und Spalte', () => {
  const f = newFall({ posten: [newPosten('gehalt', { faktor: 310000 })] });
  f.person.steuerklasse = 3;
  const html = satzTabelleHtml(f, berechne(f), { modus: 'loesung' });
  const markiert = [...html.matchAll(/<tr><td>([\d.,]+) €<\/td>(.*?)<\/tr>/g)].filter((m) => m[2].includes('treffer'));
  assert.equal(markiert.length, 1);
  assert.equal(markiert[0][1], '3.000,00', 'nächste Zeile zu 3.100 € ist 3.000 €');
  assert.equal((html.match(/<th class="r treffer">Klasse III<\/th>/g) ?? []).length, 1);
});

test('Lohnsteuertabelle in Euro: nur bei Tabellen-Modus, bei festem Satz nur auf Wunsch die Satz-Tabelle', () => {
  const f = newFall();
  const r = berechne(f);
  assert.equal(lohnsteuerTabelle(f, r), '');
  f.aufgabe.satzAblesen = true;
  assert.match(lohnsteuerTabelle(f, r), /Steuersatz nach Brutto/);
  f.steuer.modus = 'tabelle';
  assert.match(lohnsteuerTabelle(f, berechne(f)), /Lohnsteuertabelle \(Monat, Ausschnitt\)/);
  f.steuer.modus = 'formel';
  assert.match(lohnsteuerTabelle(f, berechne(f)), /wird in der Aufgabe genannt/);
});

test('Mischblatt: „Steuern ermitteln“ mit „Satz ablesen“ bringt die Tabelle zur Aufgabe', () => {
  const b = erzeugeMischblatt({ ...defaultMischSpec('mittel', 9), anzahl: 1, typen: ['steuer'] });
  const a = b.aufgaben[0];
  assert.doesNotMatch(renderAufgabe(a, 1, b, 'arbeit'), /aufgabe-tabelle/);
  a.fall.aufgabe.satzAblesen = true;
  assert.match(renderAufgabe(a, 1, b, 'arbeit'), /class="aufgabe-tabelle"[\s\S]*Steuersatz nach Brutto/);
});
