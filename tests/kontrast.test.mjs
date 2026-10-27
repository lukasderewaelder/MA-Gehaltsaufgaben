// Barrierefreiheit: Textkontrast der wichtigsten Farbpaare (WCAG AA: mindestens 4,5 : 1 für normalen Text).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = (name) => readFileSync(new URL(`../assets/css/${name}`, import.meta.url), 'utf8');
const app = css('app.css');
const slip = css('slip.css');

const variable = (name) => app.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const regel = (quelle, selektor, eigenschaft) => {
  const m = quelle.match(new RegExp(`${selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*?${eigenschaft}:\\s*(#[0-9a-fA-F]{6})`));
  return m?.[1];
};

function luminanz(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const kontrast = (a, b) => {
  const [hell, dunkel] = [luminanz(a), luminanz(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
};

test('Farbwerte der App sind lesbar', () => {
  const paare = [
    ['Text auf Hintergrund', variable('ink'), variable('bg')],
    ['Text auf Karte', variable('ink'), variable('card')],
    ['Grauer Text auf Karte', variable('muted'), '#ffffff'],
    ['Grauer Text auf Hintergrund', variable('muted'), variable('bg')],
    ['Weiß auf Blau (Knöpfe)', '#ffffff', variable('blue')],
    ['Weiß auf dunklem Blau', '#ffffff', variable('blue-dark')],
    ['Blau auf Weiß (Überschrift)', variable('blue-dark'), '#ffffff'],
    ['Rot (Fehler) auf Weiß', variable('danger'), '#ffffff'],
    ['Rot (Fehler) auf Rosa', variable('danger'), '#fee2e2'],
    ['Text auf gelb markierter Zutat', variable('ink'), '#fef3c7'],
  ];
  for (const [name, vorn, hinten] of paare) {
    assert.ok(vorn && hinten, `${name}: Farbe nicht gefunden`);
    assert.ok(kontrast(vorn, hinten) >= 4.5, `${name}: ${kontrast(vorn, hinten).toFixed(2)} : 1`);
  }
});

test('Marken, verdeckte Werte und Lösungsstempel sind lesbar', () => {
  const marke = regel(slip, '.marke', 'background');
  assert.ok(marke);
  assert.ok(kontrast('#ffffff', marke) >= 4.5, `Marke: ${kontrast('#ffffff', marke).toFixed(2)} : 1`);
  const verdeckt = regel(slip, '.val.verdeckt', 'background');
  assert.ok(verdeckt && kontrast('#ffffff', verdeckt) >= 4.5, 'verdeckter Wert (weißes ?)');
  assert.ok(kontrast('#15803d', '#ffffff') >= 4.5, 'Stempel „Lösung“');
  assert.ok(kontrast('#111827', '#dcfce7') >= 4.5, 'Lösungswert auf Grün');
});

test('Bedienung: Fokus sichtbar, reduzierte Bewegung, Touchgröße', () => {
  assert.match(app, /:focus-visible\s*\{\s*outline:\s*3px/);
  assert.match(app, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /\.btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(app, /\.btn-small\s*\{[^}]*min-height:\s*40px/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<html lang="de">/);
  assert.match(html, /viewport-fit=cover/);
  // Jede Eingabe im Formular steckt in einem Label (wird in editor.js erzeugt); Dialoge haben eine Überschrift
  for (const id of ['dlg-neu', 'dlg-feld', 'dlg-backup', 'dlg-pdf', 'dlg-zufall']) assert.match(html, new RegExp(`<dialog id="${id}" aria-labelledby="[a-z-]+"`));
});
