import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import { fmtCents } from '../src/calc/money.js';
import { newFall, newPosten, normalizeFall, pruneOverrides } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';
import { gesuchteFelder, merkzettel, renderBlatt, sachtextAuto, teilaufgaben, teilText, verfuegbareFelder } from '../src/worksheet.js';

const fall = (extra = {}) => {
  const f = SCENARIOS.find((s) => s.id === 'verkaeuferin').build();
  f.aufgabe.gesucht = ['kv', 'netto'];
  return Object.assign(f, extra);
};
const span = (html, id) => html.match(new RegExp(`<span class="val[^"]*" data-feld="${id}"[^>]*>([^<]*)</span>`))?.[1];

test('Teilaufgaben: Reihenfolge nach Zettel, Buchstaben, eigener Text überschreibt', () => {
  const f = fall();
  f.aufgabe.gesucht = ['netto', 'rv', 'kv'];
  f.aufgabe.texte = { rv: 'Eigener Text' };
  const r = berechne(f);
  const t = teilaufgaben(f, r);
  assert.deepEqual(t.map((x) => x.id), ['kv', 'rv', 'netto']);
  assert.deepEqual(t.map((x) => x.nr), ['a)', 'b)', 'c)']);
  assert.equal(t[1].text, 'Eigener Text');
  assert.match(t[0].text, /8,75 % vom KV-Brutto/);
  assert.equal(t[2].wert, r.netto);
});

test('Teilaufgabentexte nennen Sätze und Steuerart', () => {
  const f = fall();
  f.steuer.modus = 'tabelle';
  const r = berechne(f);
  assert.match(teilText(f, r, 'lst'), /Steuerklasse 1 in der Lohnsteuertabelle/);
  f.steuer = { ...f.steuer, modus: 'prozent', prozent: 1500 };
  assert.match(teilText(f, berechne(f), 'lst'), /15 % vom Steuer-Brutto/);
  assert.match(teilText(f, r, `p:${f.posten[0].id}`), /Betrag für „Gehalt“/);
  assert.match(sachtextAuto(f, true), /Lena Berger arbeitet bei Sport Sommer GmbH/);
  assert.match(sachtextAuto(f, true), /Einige Werte fehlen\. Trage sie ein/);
});

test('Arbeitsblatt zeigt gesuchte Felder leer, Lösungsblatt mit Wert', () => {
  const f = fall();
  const r = berechne(f);
  const arbeit = renderBlatt(f, r, { modus: 'arbeit' });
  const loesung = renderBlatt(f, r, { modus: 'loesung' });
  for (const id of ['kv', 'netto']) {
    assert.equal(span(arbeit, id), ' '.length ? '&nbsp;' : '', `${id} muss leer sein`);
    assert.equal(span(loesung, id), fmtCents(r.werte[id]));
  }
  assert.match(arbeit, /class="val luecke[^"]*" data-feld="kv"/);
  assert.match(loesung, /class="val [^"]*loesung" data-feld="kv"/);
  // Angegebene Felder bleiben sichtbar
  assert.equal(span(arbeit, 'rv'), fmtCents(r.rv));
  // Lösung nur im Lösungsblatt
  assert.ok(!arbeit.includes('tloesung'));
  assert.match(loesung, /tloesung/);
  assert.match(loesung, /stempel/);
});

test('Arbeitsblatt verrät die Lösung nicht (Wert kommt nirgends als Text vor)', () => {
  const f = fall();
  f.aufgabe.gesucht = ['kv', 'rv', 'av', 'pv'];
  f.aufgabe.beiblatt = false;
  const r = berechne(f);
  const arbeit = renderBlatt(f, r, { modus: 'arbeit', interactive: false });
  for (const id of ['kv', 'rv', 'av', 'pv']) {
    const text = fmtCents(r[id]);
    assert.ok(!arbeit.includes(`>${text}<`), `${id} (${text}) steht im Arbeitsblatt`);
  }
  // auch im interaktiven Arbeitsblatt kein Rechenweg-Tooltip an gesuchten Feldern
  const inter = renderBlatt(f, r, { modus: 'arbeit', interactive: true });
  assert.ok(!/data-feld="kv"[^>]*title="[^"]*Beitrag/.test(inter));
});

test('Blattart „nur Zettel“ und Beiblatt', () => {
  const f = fall();
  const r = berechne(f);
  f.aufgabe.blatt = 'zettel';
  f.aufgabe.beiblatt = false;
  let html = renderBlatt(f, r, { modus: 'arbeit' });
  assert.equal((html.match(/class="page /g) ?? []).length, 1);
  assert.ok(!html.includes('class="teile'));
  f.aufgabe.beiblatt = true;
  html = renderBlatt(f, r, { modus: 'arbeit' });
  assert.equal((html.match(/class="page /g) ?? []).length, 2);
  assert.match(html, /Was wird abgezogen\? 2026/);
  f.aufgabe.blatt = 'aufgabe';
  html = renderBlatt(f, r, { modus: 'arbeit' });
  assert.match(html, /class="teile/);
  assert.match(html, /class="rz"/);
  f.aufgabe.zeilen = 0;
  assert.ok(!renderBlatt(f, r, { modus: 'arbeit' }).includes('class="rz"'));
});

test('Beiblatt mit Lohnsteuertabelle: Sätze der Person, Treffer nur in der Lösung', () => {
  const f = fall();
  f.steuer.modus = 'tabelle';
  const r = berechne(f);
  const arbeit = merkzettel(f, r, { modus: 'arbeit' });
  const loesung = merkzettel(f, r, { modus: 'loesung' });
  assert.match(arbeit, /Zusammen/);
  assert.match(arbeit, /17,5 %/);
  assert.match(arbeit, /<b>8,75 %<\/b>/);
  assert.match(arbeit, /Lohnsteuertabelle/);
  assert.match(arbeit, /Klasse VI/);
  assert.ok(!arbeit.includes('treffer'));
  assert.match(loesung, /class="r treffer/);
  // 9 Zeilen um das Brutto herum, die Zeile des Brutto ist dabei
  assert.equal((arbeit.match(/<tr><td>[\d.,]+ bis [\d.,]+<\/td>/g) ?? []).length, 9);
  assert.match(arbeit, new RegExp(`${fmtCents(r.steuerDetail.tabelle.von)} bis`));
  assert.ok(arbeit.includes(`>${fmtCents(r.lst)}<`), 'der abzulesende Wert steht in der Tabelle');
});

test('Beiblatt mit festem Steuersatz: Erklärungen, Rechenbeispiele, kleine Satz-Tabelle', () => {
  const f = fall();
  f.steuer.modus = 'prozent';
  const r = berechne(f);
  const arbeit = merkzettel(f, r, { modus: 'arbeit' });
  const loesung = merkzettel(f, r, { modus: 'loesung' });
  for (const abschnitt of ['1 · Brutto und Netto', '2 · Sozialabgaben', '3 · Steuern', '4 · So kommt das Netto heraus']) assert.ok(arbeit.includes(abschnitt), abschnitt);
  assert.match(arbeit, /Netto = Brutto − Steuern − Sozialabgaben/);
  assert.match(arbeit, /Lohnsteuer = Brutto · Steuersatz/);
  assert.match(arbeit, /2\.000 € · 15 % = <b>300,00 €<\/b>/);
  assert.match(arbeit, /2\.000 € · 9,3 % = <b>186,00 €<\/b>/, 'Beispiel mit dem echten Satz der Rentenversicherung');
  assert.match(arbeit, /Arzt und Krankenhaus/);
  assert.match(arbeit, /Obergrenze/);
  assert.match(arbeit, /Kirchensteuer:<\/b> Nur wer in der Kirche ist/);
  // kleine Tabelle: 8 Brutto-Zeilen, 6 Steuerklassen, Prozentwerte
  const tabelle = arbeit.slice(arbeit.indexOf('Steuersatz nach Brutto und Steuerklasse'));
  assert.equal((tabelle.match(/<tr><td>[\d.,]+ €<\/td>/g) ?? []).length, 8);
  assert.equal((tabelle.match(/<th class="r">Klasse /g) ?? []).length, 6);
  assert.match(tabelle, /<td class="r">\d+ %<\/td>/);
  assert.ok(!arbeit.includes('treffer'));
  assert.ok((loesung.match(/treffer/g) ?? []).length >= 7, 'Spalte der Steuerklasse und Zeile sind markiert');
  // Sehr einfach: keine Obergrenze, kein Soli
  f.anzeige.einfach = true;
  const einfach = merkzettel(f, berechne(f), { modus: 'arbeit' });
  assert.doesNotMatch(einfach, /Obergrenze|Solidarit|Soli\b/);
  assert.match(einfach, /Prozentsatz vom Brutto<\/b>\. Der Chef zahlt die Hälfte/);
});

test('Verfügbare Felder hängen von den zugeschalteten Blöcken ab', () => {
  const f = fall();
  const ids = () => verfuegbareFelder(f, berechne(f)).flatMap((g) => g.felder.map((x) => x.id));
  assert.ok(ids().includes('netto'));
  assert.ok(!ids().includes('kumLst'));
  assert.ok(!ids().includes('agAnteil'));
  f.anzeige.bloecke.verdienst = true;
  f.anzeige.bloecke.arbeitgeber = true;
  assert.ok(ids().includes('kumLst') && ids().includes('agAnteil') && ids().includes('gesamtKosten'));
  assert.ok(ids().includes(`p:${f.posten[0].id}`));
  // Gesuchte Felder, die es nicht mehr gibt, fallen heraus
  f.aufgabe.gesucht = ['agAnteil', 'netto'];
  f.anzeige.bloecke.arbeitgeber = false;
  assert.deepEqual(gesuchteFelder(f, berechne(f)), ['netto']);
});

test('Modell: Arbeitsblatt-Einstellungen werden bereinigt und beim Löschen von Posten entfernt', () => {
  const n = normalizeFall({ id: 'a', aufgabe: { blatt: 'x', zeilen: 99, gesucht: ['kv', 'kv', 5, 'netto'], texte: { kv: 'Text', leer: '  ', zahl: 3 }, sachtext: 7 } });
  assert.equal(n.aufgabe.blatt, 'aufgabe');
  assert.equal(n.aufgabe.zeilen, 5);
  assert.deepEqual(n.aufgabe.gesucht, ['kv', 'netto']);
  assert.deepEqual(n.aufgabe.texte, { kv: 'Text' });
  assert.equal(n.aufgabe.sachtext, null);
  assert.equal(n.aufgabe.beiblatt, true);
  const f = newFall();
  const extra = newPosten('nacht');
  f.posten.push(extra);
  f.aufgabe.gesucht.push(`p:${extra.id}`);
  f.aufgabe.texte[`p:${extra.id}`] = 'x';
  f.posten.pop();
  pruneOverrides(f);
  assert.ok(!f.aufgabe.gesucht.some((id) => id.includes(extra.id)));
  assert.deepEqual(f.aufgabe.texte, {});
});

test('Alle Szenarien ergeben ein vollständiges Blatt', () => {
  for (const s of SCENARIOS) {
    const f = s.build();
    const r = berechne(f);
    for (const modus of ['arbeit', 'loesung']) {
      const html = renderBlatt(f, r, { modus });
      assert.ok(html.includes('class="slip'), s.id);
      assert.ok(!html.includes('NaN') && !html.includes('undefined'), `${s.id}/${modus}`);
    }
  }
});
