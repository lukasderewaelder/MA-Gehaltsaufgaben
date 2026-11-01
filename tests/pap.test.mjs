// Lohnsteuer nach dem amtlichen Programmablaufplan 2026: Werte der Prüftabelle „Allgemeine maschinelle Jahreslohnsteuer 2026“
// (BMF, Anlage 1 vom 12.11.2025; Merker ALV, KRV, PKV = 0, KVZ = 2,90; PVZ = 0 in Klasse II, sonst 1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jahresLohnsteuerPap, monatsLohnsteuerPap, vorsorgepauschale } from '../src/calc/pap2026.js';
import { ratesFor } from '../src/calc/rates.js';

const R = ratesFor(2026);

// Jahresbrutto → Jahreslohnsteuer der Klassen I bis VI (Euro)
const PRUEF = {
  5000: [0, 0, 0, 0, 372, 558],
  12500: [0, 0, 0, 0, 1197, 1397],
  17500: [51, 0, 0, 51, 1778, 1956],
  22500: [782, 32, 0, 782, 3073, 3604],
  30000: [2248, 1230, 0, 2248, 5588, 6120],
  35000: [3300, 2233, 294, 3300, 7216, 7682],
  40000: [4407, 3293, 1000, 4407, 8720, 9218],
  50000: [6788, 5580, 2810, 6788, 12010, 12542],
  60000: [9389, 8091, 4822, 9389, 15364, 15895],
  70000: [12220, 10835, 6952, 12220, 18729, 19260],
  80000: [15694, 14188, 9496, 15694, 22538, 23070],
  100000: [23248, 21634, 15012, 23248, 30157, 30689],
  110000: [27393, 25779, 18252, 27393, 34302, 34834],
};

test('Prüftabelle des BMF: Jahreslohnsteuer aller sechs Steuerklassen stimmt auf den Euro', () => {
  for (const [brutto, soll] of Object.entries(PRUEF)) {
    soll.forEach((erwartet, i) => {
      assert.equal(jahresLohnsteuerPap(Number(brutto), i + 1, R), erwartet, `Brutto ${brutto}, Klasse ${i + 1}`);
    });
  }
});

test('Monatslohnsteuer: Anteil der Jahreslohnsteuer, abgerundet auf Cent', () => {
  // 3.000 € im Monat = 36.000 € im Jahr
  const jahr = jahresLohnsteuerPap(36000, 1, R);
  assert.equal(monatsLohnsteuerPap(300000, 1, R), Math.floor((jahr * 100) / 12));
  assert.equal(monatsLohnsteuerPap(0, 1, R), 0);
  assert.ok(monatsLohnsteuerPap(300000, 3, R) < monatsLohnsteuerPap(300000, 1, R));
});

test('Vorsorgepauschale: Rente 9,3 %, Kranken- und Pflegeversicherung nach fiktiven Sätzen, volle Euro', () => {
  const vsp = vorsorgepauschale(36000, 1, R);
  assert.ok(Number.isInteger(vsp));
  // 36.000 · (9,3 % Rente + 8,45 % Krankenversicherung + 2,4 % Pflegeversicherung) = 36.000 · 20,15 % = 7.254 €
  assert.equal(vsp, 7254);
  assert.ok(vorsorgepauschale(200000, 1, R) < 200000 * 0.2015, 'oberhalb der Beitragsbemessungsgrenzen gedeckelt');
});
