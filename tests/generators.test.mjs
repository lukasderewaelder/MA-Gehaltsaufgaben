import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import {
  bruttoAusBeitrag,
  bruttoAusNetto,
  bruttoFuerNetto,
  ergebnisBeiBrutto,
  faktorAusBetrag,
  mengeAusBetrag,
  prozentAusBetrag,
  quoteBp,
} from '../src/calc/inverse.js';
import { AUFGABEN, STUFEN, defaultSpec, erzeugeFall, erzeugeGruppen } from '../src/generators/faelle.js';
import { newFall, newPosten, normalizeFall } from '../src/model.js';
import { rueckPlan } from '../src/rueck.js';
import { teilaufgaben, verfuegbareFelder, renderBlatt } from '../src/worksheet.js';

const ohneIds = (f) => JSON.stringify({ ...f, id: 0, createdAt: 0, updatedAt: 0, posten: f.posten.map((p) => ({ ...p, id: 0 })), aufgabe: { ...f.aufgabe, gesucht: f.aufgabe.gesucht.map((g) => g.replace(/^([pmfz]):.*/, '$1:')) } });

test('Gleiche Einstellungen und Startwert ergeben denselben Fall', () => {
  for (const stufe of ['leicht', 'mittel', 'schwer']) {
    const spec = defaultSpec(stufe, 4711);
    assert.equal(ohneIds(erzeugeFall(spec)), ohneIds(erzeugeFall(spec)));
    assert.notEqual(ohneIds(erzeugeFall(spec)), ohneIds(erzeugeFall({ ...spec, seed: 4712 })));
  }
});

test('Stufe leicht: runde Zahlen, feste Sätze, keine Zusätze', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const f = erzeugeFall(defaultSpec('leicht', seed));
    const r = berechne(f);
    assert.equal(f.steuer.modus, 'prozent');
    assert.equal(f.person.zusatzbeitrag, 140);
    assert.equal(f.person.kinder, 0);
    assert.equal(f.person.konfession, 'keine');
    assert.equal(f.person.steuerklasse, 1);
    assert.equal(f.posten.length, 1);
    if (f.art === 'gehalt') assert.equal(f.posten[0].faktor % 10000, 0, `Gehalt rund (${f.posten[0].faktor})`);
    else {
      assert.equal(f.posten[0].faktor % 100, 0, 'Stundenlohn in ganzen Euro');
      assert.equal(f.posten[0].menge, 16000);
    }
    assert.equal(r.saetze.kv, 800); // 8 %
  }
});

test('Stufe schwer: Zuschläge, Sonderzahlung, alle Steuerklassen kommen vor', () => {
  const klassen = new Set();
  let zuschlag = 0;
  let sonder = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const f = erzeugeFall(defaultSpec('schwer', seed));
    klassen.add(f.person.steuerklasse);
    if (f.posten.some((p) => ['nacht', 'sonntag', 'feiertag', 'ueberstunden'].includes(p.typ))) zuschlag++;
    if (f.posten.some((p) => ['weihnachtsgeld', 'urlaubsgeld'].includes(p.typ))) {
      sonder++;
      assert.ok([6, 11].includes(f.monat));
    }
  }
  assert.equal(klassen.size, 6);
  assert.equal(zuschlag, 200);
  assert.equal(sonder, 200);
});

test('Viele Fälle: gültig, plausibel, alle gesuchten Felder gibt es, Teilaufgaben vorhanden', () => {
  const schalter = [{}, { glatt: true }, { ueberBbg: true }, { minijob: true }, { zuschlaege: true, sonderzahlung: true, kirche: true, kinder: true, klassen: 'alle' }, { art: 'lohn' }, { art: 'gehalt' }];
  for (const stufe of ['leicht', 'mittel', 'schwer']) {
    for (const extra of schalter) {
      for (const aufgabe of Object.keys(AUFGABEN)) {
        for (let seed = 1; seed <= 12; seed++) {
          const f = erzeugeFall({ ...defaultSpec(stufe, seed * 97), ...extra, aufgabe });
          const label = `${stufe}/${JSON.stringify(extra)}/${aufgabe}/${seed}`;
          assert.ok(normalizeFall(structuredClone(f)), label);
          const r = berechne(f);
          assert.ok(r.gesamtBrutto > 0 && r.auszahlung > 0, label);
          assert.ok(r.auszahlung <= r.gesamtBrutto, label);
          assert.ok(Object.values(r.werte).every(Number.isFinite), label);
          if (extra.minijob) {
            assert.ok(r.gesamtBrutto <= r.rates.minijob, `${label} Minijob-Grenze`);
            assert.equal(r.steuerAbzuege + r.svAbzuege, 0);
          }
          if (extra.ueberBbg) assert.ok(r.gesamtBrutto > r.rates.bbgRv, label);
          if (f.person.steuerklasse === 2) assert.ok(f.person.kinder >= 1, label);
          const da = new Set(verfuegbareFelder(f, r).flatMap((g) => g.felder.map((x) => x.id)));
          assert.ok(f.aufgabe.gesucht.length > 0, label);
          for (const id of f.aufgabe.gesucht) assert.ok(da.has(id), `${label}: ${id}`);
          assert.ok(teilaufgaben(f, r).length > 0, label);
          const html = renderBlatt(f, r, { modus: 'loesung' });
          assert.ok(!html.includes('NaN') && !html.includes('undefined'), label);
        }
      }
    }
  }
});

test('Gruppen: eigene Startwerte, Buchstaben im Titel, verschiedene Zahlen', () => {
  const gruppen = erzeugeGruppen(defaultSpec('mittel', 100), 3);
  assert.deepEqual(gruppen.map((f) => f.zufall.seed), [100, 101, 102]);
  assert.deepEqual(gruppen.map((f) => f.zufall.gruppe), [1, 2, 3]);
  assert.match(gruppen[0].titel, /\(Gruppe A\)/);
  assert.match(gruppen[2].aufgabe.titel, /Gruppe C/);
  assert.equal(new Set(gruppen.map((f) => berechne(f).auszahlung)).size, 3);
  // gleicher Aufbau, andere Zahlen: Firma, Art, Posten-Typen und Steuerklasse stimmen überein, die Namen nicht
  for (const stufe of ['mittel', 'schwer']) {
    const g = erzeugeGruppen(defaultSpec(stufe, 321), 3);
    assert.equal(new Set(g.map((f) => f.firma.name)).size, 1);
    assert.equal(new Set(g.map((f) => f.posten.map((p) => p.typ).join())).size, 1);
    assert.equal(new Set(g.map((f) => f.person.steuerklasse)).size, 1);
    assert.equal(new Set(g.map((f) => f.person.name)).size, 3);
  }
  assert.doesNotMatch(erzeugeGruppen(defaultSpec('mittel', 5), 1)[0].titel, /Gruppe/);
});

test('Stufen-Voreinstellungen sind vollständig', () => {
  for (const s of Object.values(STUFEN)) {
    for (const k of ['glatt', 'steuer', 'zuschlaege', 'sonderzahlung', 'kirche', 'kinder', 'klassen', 'ueberBbg', 'minijob', 'aufgabe']) assert.ok(k in s);
  }
});

// --- Rückwärts ------------------------------------------------------------------------------------------
test('Rückwärts rechnen: Formeln', () => {
  assert.equal(bruttoAusBeitrag(27900, 930), 300000);
  assert.equal(faktorAusBetrag(296000, 16000), 1850);
  assert.equal(mengeAusBetrag(296000, 1850), 16000);
  assert.equal(prozentAusBetrag(27750, 1200, 1850), 12500);
  assert.equal(bruttoAusNetto(210000, 3000), 300000);
  assert.equal(quoteBp(32, 100), 3200);
  assert.equal(quoteBp(1080.84 * 100, 3282.5 * 100), 3290);
});

test('Rückwärts: Beitrag und Satz -> Brutto stimmt mit dem Zettel überein', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const param of ['rv', 'kv', 'av']) {
      const f = erzeugeFall({ ...defaultSpec('mittel', seed), art: 'gehalt' });
      f.aufgabe.rueck = { typ: 'beitrag', param };
      const r = berechne(f);
      const plan = rueckPlan(f, r);
      assert.ok(!plan.fehler);
      const rechnen = bruttoAusBeitrag(r[param], r.saetze[param]);
      assert.ok(Math.abs(rechnen - r[`${param}Brutto`]) <= 20, `${param}: ${rechnen} statt ${r[`${param}Brutto`]}`);
      assert.ok(plan.gesucht.includes('gesamtBrutto') && plan.gesucht.includes(`${param}Brutto`));
      // Das Arbeitsblatt zeigt die Brutto-Werte nicht
      const html = renderBlatt(f, r, { modus: 'arbeit' });
      assert.ok(!html.includes(`>${(r.gesamtBrutto / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })}<`), 'Gesamt-Brutto verdeckt');
    }
  }
});

test('Rückwärts: Stundenlohn, Stunden und Zuschlagssatz', () => {
  const f = newFall({
    posten: [newPosten('stundenlohn', { menge: 16000, faktor: 1850 }), newPosten('ueberstunden', { menge: 1200, faktor: 1850 })],
  });
  const r = berechne(f);
  const [lohn, ueb] = f.posten;
  assert.equal(faktorAusBetrag(r.werte[`p:${lohn.id}`], lohn.menge), lohn.faktor);
  assert.equal(mengeAusBetrag(r.werte[`p:${lohn.id}`], lohn.faktor), lohn.menge);
  assert.equal(prozentAusBetrag(r.werte[`p:${ueb.id}`], ueb.menge, ueb.faktor), ueb.prozent);
  for (const [param, id] of [['stundenlohn', `f:${lohn.id}`], ['stunden', `m:${lohn.id}`], ['zuschlag', `z:${ueb.id}`]]) {
    f.aufgabe.rueck = { typ: 'stundenlohn', param };
    const plan = rueckPlan(f, r);
    assert.deepEqual(plan.gesucht, [id]);
    const html = renderBlatt(f, r, { modus: 'arbeit' });
    assert.match(html, new RegExp(`class="val luecke[^"]*" data-feld="${id}"`));
    const loes = renderBlatt(f, r, { modus: 'loesung' });
    assert.match(loes, /tloesung/);
  }
  // ohne passenden Posten: Hinweis statt Absturz
  const gehalt = newFall();
  gehalt.aufgabe.rueck = { typ: 'stundenlohn', param: 'stundenlohn' };
  assert.match(rueckPlan(gehalt, berechne(gehalt)).fehler, /Menge und Faktor/);
  assert.doesNotThrow(() => renderBlatt(gehalt, berechne(gehalt), { modus: 'arbeit' }));
});

test('Rückwärts: Netto und Abzugsquote, Wunsch-Netto durch Probieren (Blatt ohne Zettel)', () => {
  const f = erzeugeFall({ ...defaultSpec('mittel', 7), art: 'gehalt' });
  const r = berechne(f);
  f.aufgabe.rueck = { typ: 'quote', param: '' };
  const quote = rueckPlan(f, r);
  assert.equal(quote.ohneZettel, true);
  assert.equal(quote.teile.length, 2);
  const arbeit = renderBlatt(f, r, { modus: 'arbeit' });
  assert.ok(!arbeit.includes('class="slip'), 'kein Zettel im Arbeitsblatt');
  assert.match(arbeit, /Netto : Prozentsatz|Netto/);
  const brutto = bruttoAusNetto(r.netto, quoteBp(r.steuerAbzuege + r.svAbzuege, r.gesamtBrutto));
  assert.ok(Math.abs(brutto - r.gesamtBrutto) / r.gesamtBrutto < 0.005, 'Näherung besser als 0,5 %');

  f.aufgabe.rueck = { typ: 'probieren', param: '' };
  const plan = rueckPlan(f, r);
  assert.ok(!plan.fehler && plan.versuchstabelle);
  assert.match(renderBlatt(f, r, { modus: 'arbeit' }), /class="mz versuche"/);
  const loes = renderBlatt(f, r, { modus: 'loesung' });
  assert.match(loes, /reicht/);
  assert.ok(!loes.includes('class="slip'));
});

test('Wunsch-Netto: kleinstes Brutto, das reicht', () => {
  const f = erzeugeFall({ ...defaultSpec('mittel', 21), art: 'gehalt' });
  const ziel = Math.round(berechne(f).netto / 1000) * 1000;
  const such = bruttoFuerNetto(f, ziel);
  assert.ok(such.netto >= ziel);
  assert.ok(ergebnisBeiBrutto(f, such.brutto - 1000).auszahlung < ziel, 'ein Schritt weniger reicht nicht');
  assert.ok(Math.abs(such.brutto - berechne(f).gesamtBrutto) < 6000, 'liegt nah am ursprünglichen Brutto');
  assert.equal(such.versuche.some((v) => v.brutto === such.brutto), true);
  // Stundenlohn-Fälle: Hauptposten ist der Stundenlohn
  const l = erzeugeFall({ ...defaultSpec('mittel', 22), art: 'lohn' });
  const z = bruttoFuerNetto(l, 150000);
  assert.ok(z.netto >= 150000);
});

test('Rückwärts-Einstellung im Modell wird geprüft', () => {
  const f = newFall();
  f.aufgabe.rueck = { typ: 'quatsch', param: 'x' };
  assert.equal(normalizeFall(structuredClone(f)).aufgabe.rueck, null);
  f.aufgabe.rueck = { typ: 'beitrag', param: 'zz' };
  assert.deepEqual(normalizeFall(structuredClone(f)).aufgabe.rueck, { typ: 'beitrag', param: 'rv' });
});
