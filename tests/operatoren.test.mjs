// Aufgabentexte stehen standardmäßig in der Operator-Form („Berechne …“, „Ermittle …“, „Lies … ab“), nicht als Frage.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import { AUFGABEN, defaultSpec, erzeugeFall } from '../src/generators/faelle.js';
import { newFall, newPosten } from '../src/model.js';
import { rueckPlan } from '../src/rueck.js';
import { SCENARIOS } from '../src/scenarios.js';
import { jahrTeilaufgaben } from '../src/yearsheet.js';
import { jahresRechnung } from '../src/calc/year.js';
import { OPERATOREN, sachtextAuto, teilText, teilaufgaben, verfuegbareFelder } from '../src/worksheet.js';

const OPERATOR = /\b(Berechne|Ermittle|Bestimme|Lies|Trage|Erkläre|Vergleiche|Begründe|Entnimm|Ergänze)\b/;
const pruefe = (text, label) => {
  assert.match(text, OPERATOR, `${label}: kein Operator in „${text}“`);
  assert.ok(!text.trim().endsWith('?'), `${label}: Frageform „${text}“`);
  assert.ok(!/^(Wie|Was|Welche|Warum|Wieviel|Wann)\b/.test(text.trim()), `${label}: beginnt mit Fragewort „${text}“`);
};

test('Jedes Feld hat einen Operator-Text, auch Menge, Faktor und Prozent', () => {
  const f = newFall({
    posten: [newPosten('stundenlohn', { menge: 16000, faktor: 1500 }), newPosten('nacht', { menge: 1000, faktor: 1500 }), newPosten('vwlAn', { faktor: 4000 })],
  });
  for (const k of Object.keys(f.anzeige.bloecke)) f.anzeige.bloecke[k] = true;
  const r = berechne(f);
  const ids = verfuegbareFelder(f, r).flatMap((g) => g.felder.map((x) => x.id));
  assert.ok(ids.length > 25);
  for (const modus of ['tabelle', 'prozent', 'formel']) {
    f.steuer.modus = modus;
    for (const id of ids) pruefe(teilText(f, berechne(f), id), `${modus}/${id}`);
  }
  f.person.konfession = 'ev';
  pruefe(teilText(f, berechne(f), 'kist'), 'kist mit Konfession');
});

test('Die Verben wechseln über die Teilaufgaben, damit nicht alles mit „Berechne“ beginnt', () => {
  const f = SCENARIOS.find((s) => s.id === 'verkaeuferin').build();
  f.aufgabe.gesucht = ['kv', 'rv', 'av', 'pv', 'svAbzuege', 'netto'];
  const verben = teilaufgaben(f, berechne(f)).map((t) => t.text.split(' ')[0]);
  assert.deepEqual(verben.slice(0, 3), OPERATOREN.rechnen);
  assert.ok(new Set(verben).size >= 3, verben.join(', '));
  assert.equal(teilText(f, berechne(f), 'kv', 0).split(' ')[0], 'Berechne');
  assert.equal(teilText(f, berechne(f), 'kv', 1).split(' ')[0], 'Ermittle');
  assert.equal(teilText(f, berechne(f), 'kv', 5).split(' ')[0], 'Bestimme');
});

test('Alle Zufallsfälle: Teilaufgaben, Sachtext und Rückwärtsaufgaben in Operator-Form', () => {
  for (const stufe of ['leicht', 'mittel', 'schwer']) {
    for (const aufgabe of Object.keys(AUFGABEN)) {
      for (const rueck of ['', 'beitrag', 'stundenlohn', 'quote', 'probieren']) {
        for (let seed = 1; seed <= 6; seed++) {
          const f = erzeugeFall({ ...defaultSpec(stufe, seed * 31), aufgabe, rueck });
          const r = berechne(f);
          const label = `${stufe}/${aufgabe}/${rueck}/${seed}`;
          for (const t of teilaufgaben(f, r)) pruefe(t.text, label);
          const plan = rueckPlan(f, r);
          const sach = sachtextAuto(f, true, plan);
          assert.ok(!plan?.fehler, `${label}: ${plan?.fehler}`);
          assert.ok(!/\?/.test(sach), `${label}: Frage im Sachtext „${sach}“`);
          assert.match(sach, OPERATOR, label);
        }
      }
    }
  }
});

test('Jahresübersicht: Teilaufgaben als Operatoren', () => {
  const f = SCENARIOS.find((s) => s.id === 'weihnachtsgeld').build();
  f.jahresblatt.luecken.netto = true;
  for (const vergleich of ['aus', 'klassen', 'paar']) {
    f.jahresblatt.vergleich = vergleich;
    const teile = jahrTeilaufgaben(f, jahresRechnung(f));
    assert.ok(teile.length >= 5);
    for (const t of teile) pruefe(t.text, `jahr/${vergleich}`);
  }
});
