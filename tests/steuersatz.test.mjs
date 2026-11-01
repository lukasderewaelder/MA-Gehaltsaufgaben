// Fester Steuersatz als Standard und die kleine Satz-Tabelle.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne, setzeSteuersatz } from '../src/calc/payroll.js';
import { ratesFor } from '../src/calc/rates.js';
import { SATZ_BIS, SATZ_BREITE, SATZ_VON, effektiverSatz, erlaubteSaetze, naechsterSatz, satzBand, satzTabelle } from '../src/calc/tax.js';
import { defaultSpec, erzeugeFall } from '../src/generators/faelle.js';
import { defaultMischSpec, erzeugeMischblatt } from '../src/misch.js';
import { renderAufgabe } from '../src/mischsheet.js';
import { newFall, newPosten, normalizeFall } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';
import { lohnsteuerTabelle, renderBlatt, satzTabelleHtml, teilText, teilaufgaben } from '../src/worksheet.js';

const R = ratesFor(2026);

test('Effektiver Steuersatz: eine Nachkommastelle, steigt mit dem Brutto, III < I < V', () => {
  let letzter = -1;
  for (let brutto = 100000; brutto <= 600000; brutto += 25000) {
    const satz = effektiverSatz(brutto, 1, R);
    assert.equal(satz % 10, 0, 'Vielfaches von 0,1 %');
    assert.ok(satz >= letzter, `steigt: ${brutto}`);
    letzter = satz;
  }
  assert.equal(effektiverSatz(300000, 1, R), 1030, '3.000 €, Klasse I: 10,3 % (Band 3.000 bis unter 3.250 €)');
  for (let brutto = 200000; brutto < SATZ_BIS; brutto += SATZ_BREITE) {
    assert.ok(effektiverSatz(brutto, 3, R) < effektiverSatz(brutto, 1, R), `III < I bei ${brutto}`);
    assert.ok(effektiverSatz(brutto, 1, R) < effektiverSatz(brutto, 5, R), `I < V bei ${brutto}`);
  }
  assert.equal(effektiverSatz(0, 1, R), 0);
});

test('Kleine Tabelle: Bänder zu 250 € von 1.500 bis unter 5.500 € ohne Lücken, sechs Steuerklassen', () => {
  const t = satzTabelle(R);
  assert.equal(t.zeilen.length, 16);
  assert.equal(t.zeilen[0].von, SATZ_VON);
  assert.equal(t.zeilen.at(-1).bis, SATZ_BIS);
  t.zeilen.forEach((z, i) => {
    assert.equal(z.bis - z.von, SATZ_BREITE);
    if (i) assert.equal(z.von, t.zeilen[i - 1].bis, 'Bänder grenzen aneinander');
  });
  assert.deepEqual(t.klassen, [1, 2, 3, 4, 5, 6]);
  assert.ok(t.zeilen.every((z) => z.saetze.length === 6 && z.saetze.every((s) => s >= 0 && s <= 3000 && s % 10 === 0)));
  // Klasse I und IV haben dieselben Sätze (ohne Faktorverfahren)
  assert.ok(t.zeilen.every((z) => z.saetze[0] === z.saetze[3]));
});

test('Band: jedes Brutto liegt in genau einem Band, außerhalb gilt das Randband', () => {
  assert.equal(satzBand(300000).von, 300000);
  assert.equal(satzBand(324999).von, 300000);
  assert.equal(satzBand(325000).von, 325000);
  assert.equal(satzBand(10000).von, SATZ_VON);
  assert.equal(satzBand(900000).bis, SATZ_BIS);
});

test('Erlaubte Sätze: nur Werte der Tabelle, keine Zwischenwerte', () => {
  const t = satzTabelle(R);
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const erlaubt = erlaubteSaetze(k, R);
    assert.deepEqual(erlaubt, [...new Set(t.zeilen.map((z) => z.saetze[k - 1]))].sort((a, b) => a - b));
    assert.ok(erlaubt.every((s, i) => !i || s > erlaubt[i - 1]), 'aufsteigend, ohne Doppelte');
  }
  const k1 = erlaubteSaetze(1, R);
  assert.ok(k1.includes(1030));
  assert.ok(!k1.includes(900) && !k1.includes(1000), '9 % und 10 % stehen in Klasse I nicht in der Tabelle');
  assert.equal(naechsterSatz(900, 1, R), 930, '9 % wird auf den nächsten Tabellenwert gesetzt');
  assert.equal(naechsterSatz(1030, 1, R), 1030);
});

test('normalizeFall rastet einen festen Steuersatz auf einen Tabellenwert ein', () => {
  const f = newFall();
  f.steuer.prozent = 1000;
  const n = normalizeFall(f);
  assert.ok(erlaubteSaetze(1, R).includes(n.steuer.prozent));
  assert.equal(n.steuer.prozent, 1030);
  f.steuer.modus = 'tabelle';
  assert.equal(normalizeFall(f).steuer.prozent, 1000, 'nur im Modus „fester Steuersatz“');
});

test('Neue Zettel starten mit festem Steuersatz, ohne Soli, Satz passt zur Tabelle', () => {
  const f = newFall();
  assert.equal(f.steuer.modus, 'prozent');
  assert.equal(f.steuer.soli, false);
  assert.equal(f.steuer.prozent, effektiverSatz(300000, 1, R));
  assert.equal(f.anzeige.einfach, false);
  assert.equal(f.aufgabe.satzAblesen, false);
  const r = berechne(f);
  assert.equal(r.lst, Math.round((300000 * f.steuer.prozent) / 10000));
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
  assert.match(teilText(f, r, 'lst'), /Der Steuersatz ist 10,3 %\. Rechne 10,3 % vom Steuer-Brutto\./);
  f.aufgabe.satzAblesen = true;
  const ablesen = teilText(f, r, 'lst');
  assert.match(ablesen, /Tabelle auf dem Beiblatt \(Steuerklasse 1, Zeile mit dem Brutto\)/);
  assert.doesNotMatch(ablesen, /10,3 %/, 'der Satz steht nicht im Text');
  // Die Tabelle steht im Beiblatt; im Lösungsblatt sind Zeile und Spalte markiert, im Arbeitsblatt nicht
  f.aufgabe.beiblatt = true;
  f.aufgabe.gesucht = ['lst'];
  const arbeit = renderBlatt(f, r, { modus: 'arbeit' });
  const loesung = renderBlatt(f, r, { modus: 'loesung' });
  assert.match(arbeit, /Steuersatz nach Brutto und Steuerklasse/);
  assert.doesNotMatch(arbeit.slice(arbeit.indexOf('Steuersatz nach Brutto')), /treffer/);
  assert.match(loesung.slice(loesung.indexOf('Steuersatz nach Brutto')), /class="r treffer"/);
  assert.match(loesung, /10,3 %/);
  assert.equal(teilaufgaben(f, r).length, 1);
});

test('Satz-Tabelle in der Lösung markiert die passende Zeile und Spalte', () => {
  const f = newFall({ posten: [newPosten('gehalt', { faktor: 310000 })] });
  f.person.steuerklasse = 3;
  const html = satzTabelleHtml(f, berechne(f), { modus: 'loesung' });
  const markiert = [...html.matchAll(/<tr><td>([\d.,]+) € bis unter [\d.,]+ €<\/td>(.*?)<\/tr>/g)].filter((m) => m[2].includes('treffer'));
  assert.equal(markiert.length, 1);
  assert.equal(markiert[0][1], '3.000,00', '3.100 € liegen im Band ab 3.000 €');
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
