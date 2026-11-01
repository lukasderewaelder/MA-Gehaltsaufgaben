// Einfache Sprache für leistungsschwache 8.-Klässler: kurze Sätze, keine schweren Wörter in „Sehr einfach“.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import { AUFGABEN, defaultSpec, erzeugeFall } from '../src/generators/faelle.js';
import { ALLE_TYPEN, defaultMischSpec, erzeugeMischblatt } from '../src/misch.js';
import { renderAufgabe } from '../src/mischsheet.js';
import { rueckPlan } from '../src/rueck.js';
import { erklaerungen } from '../src/slip.js';
import { jahresRechnung } from '../src/calc/year.js';
import { merkzettel, sachtextAuto, teilaufgaben } from '../src/worksheet.js';
import { jahrTeilaufgaben } from '../src/yearsheet.js';

const MAX_WOERTER = 18; // je Satz
const SCHWER_EINFACH = [/Berechnungsgrundlage/, /Beitragsbemessungsgrenze/, /Freigrenze/, /Obergrenze/, /Steuer-Brutto/, /\b[KRAP]V-Brutto/, /Solidarit/, /\bSoli\b/, /Sozialversicherungsbeitr/];

// Absätze, Überschriften, Listenpunkte und Tabellenzellen gelten als eigene Textstücke (¶)
const klartext = (html) =>
  html
    .replace(/<\/(p|h[1-6]|li|div|td|th|tr|section|header|footer|caption)>/g, ' ¶ ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Sätze trennen, aber nicht an Abkürzungen („z. B.“) oder Zahlen wie „2.000 €“
const saetze = (text) => text.split(/\s*¶\s*|(?<=[a-zäöüß)»“"?!:]\.|[?!])\s+(?=[A-ZÄÖÜ])/).map((s) => s.trim()).filter(Boolean);
const woerter = (satz) => satz.split(/\s+/).filter((w) => /[A-Za-zÄÖÜäöüß0-9]/.test(w)).length;

function pruefeKurz(text, label) {
  for (const satz of saetze(klartext(text))) assert.ok(woerter(satz) <= MAX_WOERTER, `${label}: ${woerter(satz)} Wörter in „${satz}“`);
}
function pruefeLeicht(text, label) {
  for (const muster of SCHWER_EINFACH) assert.doesNotMatch(text, muster, `${label}: schweres Wort ${muster} in „${text}“`);
}

test('Aufgaben und Einleitungen: kurze Sätze in jeder Stufe und Aufgabe', () => {
  for (const stufe of ['leicht', 'mittel', 'schwer']) {
    for (const aufgabe of Object.keys(AUFGABEN)) {
      for (const rueck of ['', 'beitrag', 'stundenlohn', 'quote', 'probieren']) {
        for (let seed = 1; seed <= 5; seed++) {
          const f = erzeugeFall({ ...defaultSpec(stufe, seed * 53), aufgabe, rueck });
          const r = berechne(f);
          const plan = rueckPlan(f, r);
          const label = `${stufe}/${aufgabe}/${rueck}/${seed}`;
          for (const t of teilaufgaben(f, r, plan)) {
            pruefeKurz(t.text, label);
            if (f.anzeige.einfach) pruefeLeicht(t.text, label);
          }
          pruefeKurz(sachtextAuto(f, true, plan), label);
          if (f.anzeige.einfach) pruefeLeicht(sachtextAuto(f, true, plan), label);
        }
      }
    }
  }
});

test('Auch mit „Sehr einfach“ in höheren Stufen und mit „Satz ablesen“', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const f = erzeugeFall({ ...defaultSpec('schwer', seed * 11), einfach: true, aufgabe: 'komplett' });
    f.aufgabe.satzAblesen = seed % 2 === 0;
    const r = berechne(f);
    for (const t of teilaufgaben(f, r)) {
      pruefeKurz(t.text, `schwer-einfach/${seed}`);
      pruefeLeicht(t.text, `schwer-einfach/${seed}`);
    }
  }
});

test('Erklärmodus-Legende: kurze Sätze, in „Sehr einfach“ ohne schwere Wörter', () => {
  for (const einfach of [false, true]) {
    const f = erzeugeFall({ ...defaultSpec('mittel', 1), einfach });
    for (const k of Object.keys(f.anzeige.bloecke)) f.anzeige.bloecke[k] = true;
    for (const e of erklaerungen(f)) {
      pruefeKurz(e.text, `Legende ${e.id}`);
      pruefeKurz(e.titel, `Legende-Titel ${e.id}`);
      if (einfach) pruefeLeicht(`${e.titel}. ${e.text}`, `Legende ${e.id}`);
    }
  }
});

test('Beiblatt „Was wird abgezogen?“: kurze Sätze, in „Sehr einfach“ ohne schwere Wörter', () => {
  for (const einfach of [false, true]) {
    for (const modus of ['prozent', 'tabelle', 'formel']) {
      const f = erzeugeFall({ ...defaultSpec('mittel', 2), einfach, steuer: modus });
      f.steuer.modus = modus;
      const text = klartext(merkzettel(f, berechne(f), { modus: 'arbeit' }));
      // Tabellenzeilen (nur Zahlen) und Formeln gehören nicht zu den Sätzen
      const fliesstext = text.replace(/Brutto im Monat.*?Je mehr Brutto, desto höher der Satz\./, '').replace(/Brutto Klasse I.*?Spalte mit der Steuerklasse\./, '');
      pruefeKurz(fliesstext, `Beiblatt ${modus}/${einfach}`);
      if (einfach) pruefeLeicht(text, `Beiblatt ${modus}`);
      assert.match(text, /Brutto ist das Geld, bevor etwas abgezogen wird/);
    }
  }
});

test('Mischblatt und Jahresübersicht: kurze Sätze', () => {
  for (const stufe of ['leicht', 'mittel']) {
    const b = erzeugeMischblatt({ ...defaultMischSpec(stufe, 4), anzahl: 8, typen: ALLE_TYPEN });
    for (const a of b.aufgaben) {
      const html = renderAufgabe(a, 1, b, 'arbeit');
      const text = klartext(html.replace(/<table[\s\S]*?<\/table>/g, ' ').replace(/<article[\s\S]*?<\/article>/g, ' '));
      pruefeKurz(text, `Misch ${stufe}/${a.typ}`);
      if (a.fall.anzeige.einfach) pruefeLeicht(text, `Misch ${stufe}/${a.typ}`);
    }
  }
  const f = erzeugeFall({ ...defaultSpec('mittel', 3), sonderzahlung: true });
  f.jahresblatt.luecken.netto = true;
  f.jahresblatt.vergleich = 'paar';
  for (const t of jahrTeilaufgaben(f, jahresRechnung(f))) {
    pruefeKurz(t.text, 'Jahr');
    pruefeKurz(t.loesung, 'Jahr-Lösung');
  }
});
