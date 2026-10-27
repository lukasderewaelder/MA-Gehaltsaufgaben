import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fmtCents } from '../src/calc/money.js';
import { jahresRechnung } from '../src/calc/year.js';
import { SCENARIOS } from '../src/scenarios.js';
import { diagramm, jahrTeilaufgaben, renderJahr, renderSeiten } from '../src/yearsheet.js';

const fall = (id = 'weihnachtsgeld') => SCENARIOS.find((s) => s.id === id).build();
const zaehle = (html, muster) => (html.match(muster) ?? []).length;

test('Arbeitsblatt: Lücken in Summen, Durchschnitt und Anteilen, Lösung zeigt sie grün', () => {
  const f = fall();
  const a = renderJahr(f, 'arbeit');
  const l = renderJahr(f, 'loesung');
  // 3 Zeilen × 9 Spalten = 27 Lücken (Summe, Ø, Anteil); Netto der Monate ist standardmäßig gegeben
  assert.equal(zaehle(a, /class="val luecke"/g), 27);
  assert.equal(zaehle(l, /class="val loesung"/g), 27);
  const j = jahresRechnung(f);
  assert.ok(l.includes(`>${fmtCents(j.summe.netto)}<`));
  assert.ok(!a.includes(`>${fmtCents(j.summe.netto)}<`), 'Summe darf im Arbeitsblatt nicht stehen');
  assert.match(a, /Jahresübersicht 2026/);
  assert.match(l, /stempel/);
  assert.match(a, /mit Sonderzahlung im November/);
});

test('Netto-Spalte als Lücke: 12 Monate plus Summenzeilen, Diagramm entfällt im Arbeitsblatt', () => {
  const f = fall();
  f.jahresblatt.luecken.netto = true;
  const a = renderJahr(f, 'arbeit');
  assert.equal(zaehle(a, /class="val luecke"/g), 27 + 12);
  assert.ok(!a.includes('class="diagramm"'));
  assert.match(renderJahr(f, 'loesung'), /class="diagramm"/);
});

test('Alle Lücken aus: nichts ist leer', () => {
  const f = fall();
  f.jahresblatt.luecken = { summen: false, durchschnitt: false, quoten: false, netto: false };
  assert.equal(zaehle(renderJahr(f, 'arbeit'), /class="val luecke"/g), 0);
  assert.equal(jahrTeilaufgaben(f, jahresRechnung(f)).length, 1, 'nur die Frage zur Sonderzahlung bleibt');
  const ohneSonder = fall('verkaeuferin');
  ohneSonder.jahresblatt.luecken = { summen: false, durchschnitt: false, quoten: false, netto: false };
  assert.equal(jahrTeilaufgaben(ohneSonder, jahresRechnung(ohneSonder)).length, 0);
});

test('Teilaufgaben mit Lösung und Vergleich', () => {
  const f = fall('klasse3');
  f.jahresblatt.vergleich = 'klassen';
  const j = jahresRechnung(f);
  const t = jahrTeilaufgaben(f, j);
  assert.ok(t.length >= 4);
  assert.ok(t.some((x) => /Steuerklassen/.test(x.text) && /Klasse/.test(x.loesung)));
  const a = renderJahr(f, 'arbeit');
  assert.match(a, /Steuerklassenvergleich/);
  assert.equal(zaehle(a, /class="vergleich"|class="jahrtab vergleich"/g), 1);
  assert.match(a, /\(aktuell\)/);
  f.jahresblatt.vergleich = 'paar';
  f.jahresblatt.partner = 200000;
  const p = renderJahr(f, 'loesung');
  for (const k of ['III / V', 'IV / IV', 'V / III']) assert.ok(p.includes(k));
  assert.match(p, /2\.000,00 €/);
  // Lösung enthält Netto der Vergleichszeilen grün, Arbeitsblatt nicht
  assert.ok(zaehle(p, /class="val loesung"/g) > zaehle(a, /class="val loesung"/g));
});

test('Diagramm: zwölf Balkenpaare, Beschriftung für Screenreader, höchster Balken am Sonderzahlungsmonat', () => {
  const j = jahresRechnung(fall());
  const svg = diagramm(j);
  assert.equal(zaehle(svg, /<text [^>]*text-anchor="middle"/g), 12);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title>Brutto, Netto und Abzüge je Monat<\/title>/);
  assert.match(svg, /Höchstes Brutto: /);
  assert.ok(!/NaN/.test(svg));
});

test('Seiten-Auswahl: Jahr oder Monatszettel; alle Szenarien ohne Fehler', () => {
  const f = fall('verkaeuferin');
  assert.match(renderSeiten(f, { modus: 'jahr-arbeit' }), /data-seite="jahr"/);
  assert.match(renderSeiten(f, { modus: 'jahr-loesung' }), /stempel/);
  assert.match(renderSeiten(f, { modus: 'arbeit' }), /data-seite="blatt"/);
  for (const s of SCENARIOS) {
    for (const modus of ['jahr-arbeit', 'jahr-loesung']) {
      for (const vergleich of ['aus', 'klassen', 'paar']) {
        const x = s.build();
        x.jahresblatt.vergleich = vergleich;
        const html = renderSeiten(x, { modus });
        assert.ok(!html.includes('NaN') && !html.includes('undefined'), `${s.id}/${modus}/${vergleich}`);
      }
    }
  }
});
