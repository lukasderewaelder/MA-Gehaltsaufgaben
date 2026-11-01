// Kassenzettel: Rechnung, Rabatt, Pfand, Rückgeld, beide Rechenwege, Modell, Zufall, Blätter, Sicherung.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, parseBackup } from '../src/backup.js';
import { duplicateBon, newBon, newZeile, normalizeBon } from '../src/bon.js';
import { bonBeiblatt, renderBonSeiten } from '../src/bonsheet.js';
import { bonFelder, bonGesucht, bonTeile, rechneBon } from '../src/calc/bon.js';
import { LADEN_ARTEN, defaultBonSpec, erzeugeBon, erzeugeBonGruppen } from '../src/generators/bons.js';

const bon = (werte = {}) =>
  newBon({
    variante: 'standard',
    basis: 'brutto',
    zeilen: [newZeile({ name: 'Milch', menge: 2, preis: 107, satz: 'B' }), newZeile({ name: 'Seife', preis: 238, satz: 'A' })],
    ...werte,
  });

test('Brutto gegeben: Netto = Brutto : 1,19 bzw. 1,07, MwSt. = Differenz', () => {
  const r = rechneBon(bon());
  assert.equal(r.summe, 214 + 238);
  const a = r.saetze.find((s) => s.buchstabe === 'A');
  const b = r.saetze.find((s) => s.buchstabe === 'B');
  assert.deepEqual([a.netto, a.mwst, a.brutto], [200, 38, 238]);
  assert.deepEqual([b.netto, b.mwst, b.brutto], [200, 14, 214]);
  assert.equal(r.nettoSumme + r.mwstSumme, r.summe);
  assert.match(r.weg['netto:A'], /2,38 € : 1,19 = 2,00 €/);
});

test('Netto gegeben: MwSt. = Prozent vom Netto, Summe = Netto + MwSt.', () => {
  const r = rechneBon(bon({ basis: 'netto', zeilen: [newZeile({ name: 'Seife', preis: 1000, satz: 'A' }), newZeile({ name: 'Brot', preis: 300, satz: 'B' })] }));
  assert.deepEqual(r.saetze.map((s) => [s.buchstabe, s.netto, s.mwst, s.brutto]), [['A', 1000, 190, 1190], ['B', 300, 21, 321]]);
  assert.equal(r.summe, 1511);
  assert.match(r.weg['mwst:A'], /19 % von 10,00 € = 1,90 €/);
});

test('Rabatt nur auf Artikel, je Satz; Pfand ohne Rabatt; Rückgeld', () => {
  const r = rechneBon(
    bon({
      zeilen: [newZeile({ name: 'Cola', menge: 2, preis: 500, satz: 'A' }), newZeile({ art: 'pfand', name: 'Pfand', menge: 2, preis: 25, satz: 'A' }), newZeile({ name: 'Brot', preis: 200, satz: 'B' })],
      rabatt: 1000,
      gegeben: 2000,
    }),
  );
  assert.equal(r.rabatt, 120);
  assert.equal(r.summe, 1000 - 100 + 50 + 200 - 20);
  assert.equal(r.rueckgeld, 2000 - 1130);
  assert.ok(r.mitRueckgeld);
});

test('Variante Einfach kennt kein Pfand, keinen Rabatt und kein Rückgeld', () => {
  const r = rechneBon(
    bon({ variante: 'einfach', zeilen: [newZeile({ name: 'Cola', preis: 100, satz: 'A' }), newZeile({ art: 'pfand', name: 'Pfand', preis: 25, satz: 'A' })], rabatt: 1000, gegeben: 500 }),
  );
  assert.equal(r.summe, 100);
  assert.equal(r.rabatt, 0);
  assert.ok(!r.mitRueckgeld);
  const ids = bonFelder(bon({ variante: 'einfach' }), rechneBon(bon({ variante: 'einfach' }))).flatMap((g) => g.felder.map((f) => f.id));
  assert.ok(!ids.some((i) => i.startsWith('z:')), 'keine Zeilen als Lücke: der Einzelpreis fehlt');
});

test('Nicht vorhandener Satz erscheint nicht in der Tabelle', () => {
  const r = rechneBon(bon({ zeilen: [newZeile({ name: 'Seife', preis: 119, satz: 'A' })] }));
  assert.deepEqual(r.saetze.map((s) => s.buchstabe), ['A']);
  assert.equal(r.werte['mwst:B'], undefined);
});

test('Teilaufgaben in Operator-Form, Gesuchtes in Rechenreihenfolge, Unbekanntes fällt weg', () => {
  const b = bon({ aufgabe: { gesucht: ['mwst:B', 'summe', 'gibtsnicht', 'netto:A'] } });
  const r = rechneBon(b);
  assert.deepEqual(bonGesucht(b, r).map((f) => f.id), ['summe', 'netto:A', 'mwst:B']);
  const teile = bonTeile(b, r);
  assert.deepEqual(teile.map((t) => t.nr), ['a)', 'b)', 'c)']);
  for (const t of teile) assert.match(t.text, /^(Berechne|Ermittle|Bestimme) /);
  assert.match(teile[1].text, /Brutto : 1,19/);
});

test('Modell: Normalisieren begrenzt Werte, Duplizieren vergibt neue Kennungen', () => {
  assert.equal(normalizeBon(null), null);
  const n = normalizeBon({ id: 'x', zeilen: [{ menge: -3, preis: 'a', satz: 'C' }], variante: 'neu', basis: 'kaputt', rabatt: 99999 });
  assert.deepEqual([n.zeilen[0].menge, n.zeilen[0].preis, n.zeilen[0].satz, n.variante, n.basis, n.rabatt], [1, 0, 'B', 'einfach', 'netto', 10000]);
  const b = bon();
  b.aufgabe.gesucht = [`z:${b.zeilen[0].id}`];
  const d = duplicateBon(b);
  assert.notEqual(d.id, b.id);
  assert.notEqual(d.zeilen[0].id, b.zeilen[0].id);
  assert.deepEqual(d.aufgabe.gesucht, [`z:${d.zeilen[0].id}`]);
});

test('Zufall: gleicher Startwert = gleicher Bon, alle Ladenarten und Stufen rechnen', () => {
  const ohne = ({ id, zeilen, createdAt, updatedAt, ...x }) => ({ ...x, preise: zeilen.map((z) => [z.name, z.preis, z.menge, z.satz]), aufgabe: { ...x.aufgabe, gesucht: x.aufgabe.gesucht.filter((g) => !g.startsWith('z:')) } });
  assert.deepEqual(ohne(erzeugeBon(defaultBonSpec('mittel', 5))), ohne(erzeugeBon(defaultBonSpec('mittel', 5))));
  for (const laden of Object.keys(LADEN_ARTEN)) {
    for (const stufe of ['leicht', 'mittel', 'schwer']) {
      for (let seed = 1; seed <= 15; seed++) {
        const b = erzeugeBon({ ...defaultBonSpec(stufe, seed * 13), laden });
        const r = rechneBon(b);
        assert.ok(r.summe > 0 && b.laden, `${laden}/${stufe}/${seed}`);
        assert.ok(bonGesucht(b, r).length >= 2);
        if (b.variante === 'standard') assert.ok(r.mitRueckgeld);
        if (stufe === 'leicht') assert.ok(b.zeilen.every((z) => z.preis % 50 === 0), 'runde Preise');
      }
    }
  }
});

test('Gruppen: gleicher Aufbau, andere Zahlen', () => {
  const [a, b] = erzeugeBonGruppen(defaultBonSpec('schwer', 42), 2);
  assert.deepEqual(a.zeilen.map((z) => z.name), b.zeilen.map((z) => z.name));
  assert.notDeepEqual(a.zeilen.map((z) => z.preis), b.zeilen.map((z) => z.preis));
  assert.match(a.titel, /Gruppe A/);
  assert.match(b.titel, /Gruppe B/);
});

test('Blätter: Lücken im Arbeitsblatt, Lösung mit Rechenweg, Einfach ohne Datum, nie TSE', () => {
  const b = bon({ aufgabe: { gesucht: ['summe'] }, gegeben: 1000 });
  const arbeit = renderBonSeiten(b, { modus: 'arbeit' });
  const loesung = renderBonSeiten(b, { modus: 'loesung' });
  assert.match(arbeit, /val luecke/);
  assert.doesNotMatch(arbeit, /Lösung/);
  assert.match(loesung, /class="val loesung"/);
  assert.match(loesung, /class="tloesung"/);
  assert.match(renderBonSeiten(b, { modus: 'zettel' }), /12\.03\.2026/);
  assert.doesNotMatch(renderBonSeiten(bon({ variante: 'einfach' }), { modus: 'zettel' }), /12\.03\.2026|gegeben/);
  assert.doesNotMatch(arbeit + loesung, /TSE|Seriennummer|Signatur/);
  assert.match(bonBeiblatt(b), /Netto = Brutto : 1,19/);
  assert.match(bonBeiblatt(b), /84,03 €/);
  b.aufgabe.beiblatt = false;
  assert.doesNotMatch(renderBonSeiten(b, { modus: 'arbeit' }), /So liest du/);
});

test('Sicherung enthält Kassenzettel, ältere Dateien bleiben lesbar', () => {
  const b = bon();
  const text = JSON.stringify(buildBackup([], [], [b]));
  assert.deepEqual(parseBackup(text).bons.map((x) => x.id), [b.id]);
  const alt = JSON.stringify({ format: 'lohnzettel-sicherung', version: 2, faelle: [], blaetter: [] });
  assert.deepEqual(parseBackup(alt).bons, []);
});
