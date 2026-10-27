import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import { SPALTEN, jahresRechnung, klassenvergleich, paarvergleich } from '../src/calc/year.js';
import { newFall, newPosten, normalizeFall } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';

const szenario = (id) => SCENARIOS.find((s) => s.id === id).build();

test('Jahr ohne Sonderzahlung: zwölf gleiche Monate', () => {
  const f = szenario('verkaeuferin');
  const j = jahresRechnung(f);
  assert.equal(j.zeilen.length, 12);
  const einMonat = berechne(f);
  assert.equal(j.zeilen[0].werte.brutto, einMonat.gesamtBrutto);
  assert.equal(j.summe.brutto, 12 * einMonat.gesamtBrutto);
  assert.equal(j.summe.netto, 12 * einMonat.netto);
  assert.equal(j.durchschnitt.netto, einMonat.netto);
  assert.equal(new Set(j.zeilen.map((z) => z.werte.lst)).size, 1);
});

test('Jede Zeile geht auf: Brutto = Steuern + Sozialversicherung + Netto, ebenso die Summe', () => {
  for (const s of SCENARIOS) {
    const j = jahresRechnung(s.build());
    for (const z of [...j.zeilen.map((x) => x.werte), j.summe]) {
      const abzuege = z.lst + z.soli + z.kist + z.kv + z.rv + z.av + z.pv;
      assert.equal(z.brutto - abzuege, z.netto, s.id);
    }
    for (const [k] of SPALTEN) assert.equal(j.zeilen.reduce((sum, z) => sum + z.werte[k], 0), j.summe[k], `${s.id}/${k}`);
    // Anteile am Brutto ergeben zusammen 100 % (Rundung auf 0,1 %)
    const anteile = SPALTEN.filter(([k]) => k !== 'brutto').reduce((sum, [k]) => sum + j.quoten[k], 0);
    assert.ok(Math.abs(anteile - 10000) <= 50, `${s.id}: ${anteile}`);
    assert.equal(j.quoten.brutto, 10000);
  }
});

test('Weihnachtsgeld gibt es nur im November und treibt die Steuer in dem Monat hoch', () => {
  const f = szenario('weihnachtsgeld');
  assert.equal(f.monat, 11);
  const j = jahresRechnung(f);
  const normal = j.zeilen[0].werte;
  const nov = j.zeilen[10].werte;
  assert.equal(nov.brutto, 2 * normal.brutto);
  assert.ok(nov.lst > 2 * normal.lst, 'Steuer auf Sonderzahlung wirkt stark');
  assert.equal(j.zeilen.filter((z) => z.werte.brutto === normal.brutto).length, 11);
  assert.equal(j.summe.brutto, 13 * normal.brutto);
});

test('Beitragsgrenze im Jahr: hohes Gehalt zahlt konstant das Maximum', () => {
  const j = jahresRechnung(szenario('gutverdiener'));
  assert.equal(new Set(j.zeilen.map((z) => z.werte.rv)).size, 1);
  const r = berechne(szenario('gutverdiener'));
  assert.equal(j.zeilen[5].werte.rv, r.rv);
});

test('Von Hand geänderte Felder gelten nur im Monat des Zettels', () => {
  const f = szenario('verkaeuferin');
  f.ueberschreibungen = { lst: 1 };
  const j = jahresRechnung(f);
  assert.equal(j.zeilen[f.monat - 1].werte.lst, 1);
  assert.ok(j.zeilen[(f.monat % 12)].werte.lst > 1);
});

test('Steuerklassenvergleich: III günstiger als I, V teurer', () => {
  const f = szenario('klasse3');
  f.person.kinder = 0;
  const v = klassenvergleich(f);
  assert.equal(v.length, 6);
  const by = Object.fromEntries(v.map((x) => [x.klasse, x]));
  assert.ok(by[3].steuer < by[1].steuer && by[1].steuer < by[5].steuer && by[5].steuer <= by[6].steuer + 1);
  assert.ok(by[3].netto > by[1].netto && by[1].netto > by[5].netto);
  for (const x of v) assert.equal(x.netto, x.summe.netto);
});

test('Paarvergleich: drei Kombinationen, gleiche Bruttoeinkommen, III/V und V/III spiegeln sich', () => {
  const f = szenario('klasse3');
  const v = paarvergleich(f, 180000);
  assert.deepEqual(v.map((x) => x.label), ['III / V', 'IV / IV', 'V / III']);
  assert.ok(v.every((x) => x.netto > 0 && x.steuer > 0));
  // IV/IV ist symmetrisch: vertauschte Gehälter ergeben dieselben Summen
  const a = szenario('klasse3');
  a.posten = [newPosten('gehalt', { faktor: 180000 })];
  const spiegel = paarvergleich(a, 420000);
  assert.equal(spiegel[1].steuer, v[1].steuer);
  assert.equal(spiegel[1].netto, v[1].netto);
  // Der Besserverdienende in III und der andere in V zahlt insgesamt weniger Lohnsteuer als in IV/IV nur dann, wenn …
  assert.notEqual(v[0].steuer, v[1].steuer);
});

test('Jahresblatt im Modell: Voreinstellungen und Prüfung', () => {
  const f = newFall();
  assert.deepEqual(f.jahresblatt.luecken, { summen: true, durchschnitt: true, quoten: true, netto: false });
  assert.equal(f.jahresblatt.vergleich, 'aus');
  const n = normalizeFall({ id: 'x', jahresblatt: { vergleich: 'x', partner: -5, luecken: { netto: 'ja', summen: false } } });
  assert.equal(n.jahresblatt.vergleich, 'aus');
  assert.equal(n.jahresblatt.partner, 0);
  assert.equal(n.jahresblatt.luecken.netto, false);
  assert.equal(n.jahresblatt.luecken.summen, false);
});
