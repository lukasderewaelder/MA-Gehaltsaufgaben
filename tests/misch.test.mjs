import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, mergeFaelle, parseBackup } from '../src/backup.js';
import { berechne } from '../src/calc/payroll.js';
import {
  ALLE_TYPEN,
  MAX_AUFGABEN,
  MISCH_TYPEN,
  defaultMischSpec,
  duplicateMisch,
  erzeugeMischGruppen,
  erzeugeMischblatt,
  ersetzeAufgabe,
  fuegeAufgabeHinzu,
  normalizeMisch,
  setzeFallEin,
} from '../src/misch.js';
import { renderAufgabe, renderMisch } from '../src/mischsheet.js';
import { newFall } from '../src/model.js';
import { rueckPlan } from '../src/rueck.js';
import { renderSeiten } from '../src/yearsheet.js';
import { createMemoryStore } from '../src/store.js';
import { gesuchteFelder, teilaufgaben } from '../src/worksheet.js';

const zaehle = (html, muster) => (html.match(muster) ?? []).length;
const OPERATOR = /\b(Berechne|Ermittle|Bestimme|Lies|Trage|Erkläre|Vergleiche|Begründe|Entnimm|Ergänze)\b/;
// Ids (auch in „p:<id>“-Verweisen der gesuchten Felder) und Zeitstempel sind zufällig und gehören nicht zum Vergleich
const ohneIds = (b) =>
  JSON.stringify(b, (k, v) => {
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt') return 0;
    return typeof v === 'string' && /^[pmfz]:.{8,}/.test(v) ? v.slice(0, 2) : v;
  });

test('Gleiche Einstellungen und Startwert ergeben dasselbe Mischblatt', () => {
  const spec = { ...defaultMischSpec('mittel', 99), anzahl: 5 };
  assert.equal(ohneIds(erzeugeMischblatt(spec)), ohneIds(erzeugeMischblatt(spec)));
  assert.notEqual(ohneIds(erzeugeMischblatt(spec)), ohneIds(erzeugeMischblatt({ ...spec, seed: 100 })));
});

test('Zufällige Auswahl: verschiedene Arten, gewählte Arten der Reihe nach, Anzahl stimmt', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const b = erzeugeMischblatt({ ...defaultMischSpec('mittel', seed), anzahl: 6 });
    assert.equal(b.aufgaben.length, 6);
    assert.equal(new Set(b.aufgaben.map((a) => a.typ)).size, 6, 'ohne Wiederholung');
  }
  const alle = erzeugeMischblatt({ ...defaultMischSpec('mittel', 5), anzahl: 8 });
  assert.deepEqual([...new Set(alle.aufgaben.map((a) => a.typ))].sort(), [...ALLE_TYPEN].sort());
  const gewaehlt = erzeugeMischblatt({ ...defaultMischSpec('mittel', 5), anzahl: 5, typen: ['netto', 'quote'] });
  assert.deepEqual(gewaehlt.aufgaben.map((a) => a.typ), ['netto', 'quote', 'netto', 'quote', 'netto']);
});

test('Jede Art in jeder Stufe: Aufgabe ist lösbar, hat Teilaufgaben im Operator-Stil und gemeinsame Krankenkassen-Sätze', () => {
  for (const stufe of ['leicht', 'mittel', 'schwer']) {
    for (let seed = 1; seed <= 10; seed++) {
      const b = erzeugeMischblatt({ ...defaultMischSpec(stufe, seed * 41), anzahl: 8, typen: ALLE_TYPEN });
      assert.equal(new Set(b.aufgaben.map((a) => a.fall.person.zusatzbeitrag)).size, 1, 'ein Zusatzbeitrag für alle');
      for (const a of b.aufgaben) {
        const label = `${stufe}/${seed}/${a.typ}`;
        const r = berechne(a.fall);
        const plan = rueckPlan(a.fall, r, { kompakt: true });
        assert.ok(!plan?.fehler, `${label}: ${plan?.fehler}`);
        const teile = teilaufgaben(a.fall, r, plan);
        assert.ok(teile.length > 0, label);
        for (const t of teile) assert.match(t.text, OPERATOR, `${label}: ${t.text}`);
        if (!MISCH_TYPEN[a.typ].rueck) assert.ok(gesuchteFelder(a.fall, r, plan).length > 0, label);
        assert.ok(a.fall.aufgabe.beiblatt === false && a.fall.aufgabe.blatt === 'aufgabe');
      }
    }
  }
});

test('Ausschnitte: Arten zeigen nur die passenden Abschnitte, gesuchte Werte sind Lücken', () => {
  const b = erzeugeMischblatt({ ...defaultMischSpec('mittel', 7), anzahl: 8, typen: ALLE_TYPEN });
  const nach = Object.fromEntries(b.aufgaben.map((a) => [a.typ, renderAufgabe(a, 1, b, 'arbeit')]));
  assert.match(nach.bezuege, /data-abschnitt="bezuege"/);
  assert.doesNotMatch(nach.bezuege, /data-abschnitt="steuer"/);
  assert.match(nach.sv, /data-abschnitt="steuer"/);
  assert.doesNotMatch(nach.sv, /data-abschnitt="bezuege"/);
  assert.match(nach.netto, /data-abschnitt="bezuege"[\s\S]*data-abschnitt="steuer"/);
  assert.doesNotMatch(nach.netto, /data-seite|slip-kopf/, 'kein Kopf, kein Fuß im Ausschnitt');
  for (const typ of ['quote', 'probieren']) assert.doesNotMatch(nach[typ], /class="slip/, `${typ} ohne Zettel`);
  assert.match(nach.probieren, /class="mz versuche"/);
  assert.match(nach.steuer, /class="aufgabe-tabelle"/);
  assert.doesNotMatch(nach.sv, /aufgabe-tabelle/);
  // Lücken: sv (5), netto (3), steuer (mind. 2), bezuege (mind. 2), beitrag (5 Berechnungsgrundlagen), stundenlohn (1)
  assert.equal(zaehle(nach.sv, /class="val luecke/g), 5);
  assert.equal(zaehle(nach.netto, /class="val luecke/g), 3);
  assert.ok(zaehle(nach.steuer, /class="val luecke/g) >= 2);
  assert.ok(zaehle(nach.bezuege, /class="val luecke/g) >= 2);
  assert.equal(zaehle(nach.beitrag, /class="val luecke/g), 5);
  assert.equal(zaehle(nach.stundenlohn, /class="val luecke/g), 1);
  // Lösung: dieselben Stellen grün, Rechenweg darunter
  const loes = renderAufgabe(b.aufgaben.find((a) => a.typ === 'sv'), 1, b, 'loesung');
  assert.equal(zaehle(loes, /class="val [^"]*loesung/g), 5);
  assert.match(loes, /class="tloesung"/);
});

test('Probieren: die Lohnsteuertabelle liegt bei der Aufgabe, die Ergebniszeile steht nicht in der Mitte', () => {
  const b = erzeugeMischblatt({ ...defaultMischSpec('mittel', 12), anzahl: 1, typen: ['probieren'], steuer: 'tabelle' });
  const arbeit = renderAufgabe(b.aufgaben[0], 1, b, 'arbeit');
  assert.match(arbeit, /class="aufgabe-tabelle"/);
  const zeilen = [...arbeit.matchAll(/<tr><td>([\d.,]+) bis [\d.,]+<\/td>/g)];
  assert.equal(zeilen.length, 15, '7 Zeilen darüber und darunter plus Mitte');
  const loesung = renderAufgabe(b.aufgaben[0], 1, b, 'loesung');
  const markiert = [...loesung.matchAll(/<tr><td>([\d.,]+) bis [\d.,]+<\/td><td class="r treffer/g)];
  assert.equal(markiert.length, 1, 'genau eine Zeile ist als Treffer markiert');
  const index = zeilen.findIndex((z) => z[1] === markiert[0][1]);
  assert.equal(index, 10, 'Treffer liegt drei Zeilen unterhalb der Mitte (nicht verraten durch die Mitte)');
  assert.doesNotMatch(arbeit, /treffer/);
});

test('Blatt: Kopf, Einleitung, Aufgaben in Reihenfolge, Beiblatt allgemein ohne Tabelle', () => {
  const b = erzeugeMischblatt({ ...defaultMischSpec('mittel', 3), anzahl: 4 });
  b.intro = '';
  const html = renderMisch(b, { modus: 'arbeit' });
  assert.equal(zaehle(html, /class="aufgabe"/g), 4);
  assert.deepEqual([...html.matchAll(/Aufgabe (\d)</g)].map((m) => Number(m[1])), [1, 2, 3, 4]);
  assert.match(html, /Bearbeite alle Aufgaben/);
  assert.match(html, /Abzüge im Überblick 2026/);
  assert.match(html, /Die Lohnsteuertabellen stehen bei den Aufgaben/);
  b.beiblatt = false;
  assert.doesNotMatch(renderMisch(b, { modus: 'arbeit' }), /Abzüge im Überblick/);
  assert.match(renderMisch(b, { modus: 'loesung' }), /stempel/);
  assert.equal(renderSeiten(b, { modus: 'arbeit' }), renderMisch(b, { modus: 'arbeit' }), 'renderSeiten kennt Mischblätter');
});

test('Gruppen: gleiche Arten, Berufe und Steuerklassen, andere Zahlen', () => {
  const g = erzeugeMischGruppen({ ...defaultMischSpec('schwer', 321), anzahl: 5 }, 3);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((b) => b.zufall.gruppe), [1, 2, 3]);
  assert.match(g[0].titel, /\(Gruppe A\)/);
  assert.match(g[2].titel, /\(Gruppe C\)/);
  assert.equal(new Set(g.map((b) => b.aufgaben.map((a) => a.typ).join())).size, 1, 'gleiche Reihenfolge der Arten');
  assert.equal(new Set(g.map((b) => b.aufgaben.map((a) => a.fall.firma.name).join())).size, 1, 'gleiche Firmen');
  assert.equal(new Set(g.map((b) => b.aufgaben.map((a) => a.fall.person.steuerklasse).join())).size, 1);
  assert.equal(new Set(g.map((b) => b.aufgaben.map((a) => berechne(a.fall).gesamtBrutto).join())).size, 3, 'andere Zahlen');
  assert.doesNotMatch(erzeugeMischGruppen(defaultMischSpec('mittel', 1), 1)[0].titel, /Gruppe/);
});

test('Bearbeiten: Aufgabe neu würfeln, Art ändern, hinzufügen, Zettel einsetzen, duplizieren', () => {
  const b = erzeugeMischblatt({ ...defaultMischSpec('mittel', 11), anzahl: 3, typen: ['netto', 'sv', 'steuer'] });
  const idAlt = b.aufgaben[1].id;
  const fallAlt = ohneIds(b.aufgaben[1].fall);
  ersetzeAufgabe(b, 1);
  assert.equal(b.aufgaben[1].id, idAlt);
  assert.equal(b.aufgaben[1].typ, 'sv');
  assert.notEqual(ohneIds(b.aufgaben[1].fall), fallAlt);
  assert.equal(b.aufgaben[1].fall.person.zusatzbeitrag, b.aufgaben[0].fall.person.zusatzbeitrag);
  ersetzeAufgabe(b, 2, 'stundenlohn');
  assert.equal(b.aufgaben[2].typ, 'stundenlohn');
  assert.equal(b.aufgaben[2].fall.art, 'lohn');
  assert.ok(!rueckPlan(b.aufgaben[2].fall, berechne(b.aufgaben[2].fall), { kompakt: true }).fehler);
  fuegeAufgabeHinzu(b, 'quote');
  assert.equal(b.aufgaben.length, 4);
  while (b.aufgaben.length < MAX_AUFGABEN) fuegeAufgabeHinzu(b, 'netto');
  const norm = normalizeMisch(structuredClone({ ...b, aufgaben: [...b.aufgaben, ...b.aufgaben] }));
  assert.equal(norm.aufgaben.length, MAX_AUFGABEN, 'höchstens acht Aufgaben');

  const eigener = newFall({ titel: 'Eigener Zettel' });
  setzeFallEin(b, 0, eigener, 'bezuege');
  assert.equal(b.aufgaben[0].typ, 'bezuege');
  assert.notEqual(b.aufgaben[0].fall.id, undefined);
  assert.equal(b.aufgaben[0].fall.titel, 'Eigener Zettel');
  assert.equal(b.aufgaben[0].fall.zufall, null);
  eigener.titel = 'später geändert';
  assert.equal(b.aufgaben[0].fall.titel, 'Eigener Zettel', 'Kopie, keine Verknüpfung');

  const kopie = duplicateMisch(b);
  assert.notEqual(kopie.id, b.id);
  assert.match(kopie.titel, /Kopie/);
  assert.ok(kopie.aufgaben.every((a, i) => a.id !== b.aufgaben[i].id && a.fall.id !== b.aufgaben[i].fall.id));
});

test('Normalisieren: kaputte Daten werden gültig oder verworfen', () => {
  assert.equal(normalizeMisch(null), null);
  assert.equal(normalizeMisch({ id: 'x' }), null);
  const n = normalizeMisch({ id: 'x', zeilen: 99, aufgaben: [null, { typ: 'unbekannt', fall: newFall() }, { typ: 'netto', fall: { kaputt: true } }, { typ: 'netto', fall: newFall() }] });
  assert.equal(n.aufgaben.length, 1);
  assert.equal(n.zeilen, 5);
  assert.equal(n.beiblatt, true);
  assert.equal(n.zufall, null);
  assert.doesNotThrow(() => renderMisch(n, { modus: 'loesung' }));
});

test('Speichern und Sicherung: Mischblätter im Speicher und in der Sicherungsdatei', async () => {
  const store = createMemoryStore();
  const b = erzeugeMischblatt(defaultMischSpec('leicht', 5));
  await store.saveBlatt(b);
  assert.equal((await store.listBlaetter()).length, 1);
  assert.equal((await store.getBlatt(b.id)).titel, b.titel);
  await store.deleteBlatt(b.id);
  assert.equal(await store.getBlatt(b.id), null);

  const f = newFall();
  const text = JSON.stringify(buildBackup([f], [b]));
  const gelesen = parseBackup(text);
  assert.equal(gelesen.faelle.length, 1);
  assert.equal(gelesen.blaetter.length, 1);
  assert.equal(gelesen.blaetter[0].aufgaben.length, b.aufgaben.length);
  assert.equal(gelesen.ignoriert, 0);
  // Dateien der Version 1 (ohne Mischblätter) lassen sich weiter einlesen
  const alt = parseBackup(JSON.stringify({ format: 'lohnzettel-sicherung', version: 1, faelle: [f] }));
  assert.deepEqual(alt.blaetter, []);
  // unlesbares Mischblatt wird gezählt, nicht eingelesen
  const halb = parseBackup(JSON.stringify({ format: 'lohnzettel-sicherung', version: 2, faelle: [], blaetter: [b, { id: 'kaputt' }] }));
  assert.equal(halb.blaetter.length, 1);
  assert.equal(halb.ignoriert, 1);
  const m = mergeFaelle([b], [{ ...structuredClone(b), updatedAt: b.updatedAt + 9 }]);
  assert.equal(m.aktualisiert, 1);
});
