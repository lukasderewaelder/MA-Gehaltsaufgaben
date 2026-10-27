import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fmtCents } from '../src/calc/money.js';
import { berechne } from '../src/calc/payroll.js';
import { SCENARIOS } from '../src/scenarios.js';
import { erklaerungen, feldName, fmtWert, renderSlip } from '../src/slip.js';

const fall = () => SCENARIOS.find((s) => s.id === 'handwerker').build();
const zaehle = (html, muster) => (html.match(muster) ?? []).length;

test('Erklärmodus: zehn Marken im Grundzettel, mit allen Blöcken mehr, fortlaufend nummeriert', () => {
  const f = fall();
  const basis = erklaerungen(f);
  assert.equal(basis.length, 10);
  assert.deepEqual(basis.map((e) => e.nr), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(basis.at(-1).id, 'auszahlung');
  for (const k of Object.keys(f.anzeige.bloecke)) f.anzeige.bloecke[k] = true;
  const voll = erklaerungen(f);
  assert.equal(voll.length, 14);
  assert.equal(new Set(voll.map((e) => e.nr)).size, 14);
  assert.equal(voll.at(-1).nr, 14);
});

test('Erklärmodus im Zettel: Marken und Legende nur, wenn eingeschaltet', () => {
  const f = fall();
  const r = berechne(f);
  const aus = renderSlip(f, r);
  assert.equal(zaehle(aus, /class="marke"/g), 0);
  assert.ok(!aus.includes('class="legende"'));
  f.anzeige.erklaermodus = true;
  const an = renderSlip(f, berechne(f));
  assert.equal(zaehle(an, /<span class="marke" aria-hidden="true">/g), 20); // 10 Marken im Zettel + 10 in der Legende
  assert.match(an, /class="legende"/);
  assert.match(an, /Das Geld, das tatsächlich auf dem Konto ankommt/);
  // ohne Legende (Vorführmodus zeigt sie am Rand)
  assert.equal(zaehle(renderSlip(f, berechne(f), { legende: false }), /<span class="marke"/g), 10);
});

test('Vorführmodus: verdeckte Werte zeigen keine Zahl, Zutaten und gewähltes Feld sind markiert', () => {
  const f = fall();
  const r = berechne(f);
  const html = renderSlip(f, r, { modus: 'vorfuehren', verdeckt: new Set(['kv', 'netto']), quellen: new Set(['kvBrutto']), aktiv: 'rv' });
  assert.match(html, /class="val verdeckt " data-feld="kv"/);
  assert.match(html, /class="val verdeckt " data-feld="netto"/);
  assert.match(html, /class="val  quelle" data-feld="kvBrutto"/);
  assert.match(html, /class="val  aktiv" data-feld="rv"/);
  for (const id of ['kv', 'netto']) {
    const wert = html.match(new RegExp(`data-feld="${id}"[^>]*>([^<]*)<`))[1];
    assert.ok(!/\d/.test(wert), `${id} verdeckt: "${wert}"`);
  }
  assert.ok(!html.includes(`aria-label="Verdeckter Wert, antippen zum Aufdecken">${fmtCents(r.netto)}`));
  // Abschnitte zum Zoomen
  for (const a of ['kopf', 'bezuege', 'steuer', 'unten']) assert.match(html, new RegExp(`data-abschnitt="${a}"`));
});

test('Rechenweg: Zutaten der wichtigsten Felder', () => {
  const f = fall();
  const r = berechne(f);
  assert.deepEqual(r.weg.netto.aus, ['gesamtBrutto', 'steuerAbzuege', 'svAbzuege']);
  assert.deepEqual(r.weg.kv.aus, ['kvBrutto']);
  assert.deepEqual(r.weg.lst.aus, ['stBrutto']);
  assert.deepEqual(r.weg.svAbzuege.aus, ['kv', 'rv', 'av', 'pv']);
  assert.deepEqual(r.weg.auszahlung.aus, ['netto', 'nettoAbzuege']);
  const lohn = f.posten[0];
  assert.deepEqual(r.weg[`p:${lohn.id}`].aus, [`m:${lohn.id}`, `f:${lohn.id}`]);
  // Zutaten gibt es als Felder
  for (const [id, w] of Object.entries(r.weg)) for (const q of w.aus ?? []) assert.ok(r.weg[q], `${id} -> ${q}`);
  // Steuerfreie Bezüge zählen nicht zum Steuer-Brutto
  const frei = f.posten.find((p) => p.typ === 'fahrtkosten');
  assert.ok(!r.weg.stBrutto.aus.includes(`p:${frei.id}`));
  assert.ok(r.weg.gesamtBrutto.aus.includes(`p:${frei.id}`));
});

test('Feldnamen und Werte für Menge, Faktor und Prozent', () => {
  const f = fall();
  const r = berechne(f);
  const ueb = f.posten.find((p) => p.typ === 'ueberstunden');
  assert.equal(feldName(`z:${ueb.id}`, f), 'Prozentsatz: Überstunden');
  assert.equal(feldName(`m:${ueb.id}`, f), 'Menge: Überstunden');
  assert.equal(feldName('netto', f), 'Netto-Verdienst');
  assert.equal(fmtWert(`z:${ueb.id}`, 12500, f), '125 %');
  assert.equal(fmtWert(`m:${ueb.id}`, 1200, f), '12,00 Std');
  assert.equal(fmtWert('netto', 123456, f), '1.234,56 €');
  assert.ok(r.weg[`m:${ueb.id}`].nurAnzeige);
});

test('Posten-Zeilen: Menge, Faktor und Prozentsatz sind als Felder im Zettel', () => {
  const f = fall();
  const html = renderSlip(f, berechne(f));
  for (const p of f.posten.filter((x) => x.typ !== 'fahrtkosten')) {
    assert.match(html, new RegExp(`data-feld="m:${p.id}"`));
    assert.match(html, new RegExp(`data-feld="f:${p.id}"`));
  }
  assert.ok(!html.includes(`data-feld="m:${f.posten.find((p) => p.typ === 'fahrtkosten').id}"`), 'Pauschalbeträge haben keine Menge');
});
