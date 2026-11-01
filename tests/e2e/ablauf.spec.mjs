// Browser-Tests der Hauptabläufe: Zettel anlegen und ändern, Arbeits- und Lösungsblatt, PDF, Zufallsfälle,
// Rückwärtsaufgaben, Vorführmodus, Jahresübersicht, Sicherung, Tastaturbedienung.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { useApp } from './helpers.mjs';

const app = useApp();
const wert = (page, id) => page.locator(`#slip-host .val[data-feld="${id}"]`).textContent();
/** Klappt einen Bereich des Formulars auf (z. B. „Arbeitsblatt“), falls er zu ist. */
const bereich = async (page, name) => {
  const details = page.locator('#editor-form details', { has: page.locator(`summary:text-is("${name}")`) });
  if (!(await details.evaluate((d) => d.open))) await details.locator('summary').click();
};
const keineProbleme = (problems, foreign) => {
  assert.deepEqual(problems, [], `Konsolenfehler: ${problems.join(' | ')}`);
  assert.deepEqual(foreign, [], `Fremde Anfragen: ${foreign.join(' | ')}`);
};

test('Zettel aus Szenario anlegen, ändern, speichern und nach dem Neuladen wiederfinden', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  assert.ok(await page.locator('#lib-empty').isVisible());
  await app.neuerZettel(page, 'verkaeuferin');
  assert.equal(await wert(page, 'gesamtBrutto'), '2.650,00');
  const alt = await wert(page, 'auszahlung');

  await page.fill('[data-bind="posten.0.faktor"]', '3000,00');
  assert.equal(await wert(page, 'gesamtBrutto'), '3.000,00');
  assert.notEqual(await wert(page, 'auszahlung'), alt);
  // Standard ist ein fester Steuersatz: die Steuerklasse ändert die Steuer erst, wenn der Satz aus der Tabelle übernommen wird
  assert.equal(await page.inputValue('[data-bind="steuer.modus"]'), 'prozent');
  assert.match(await page.textContent('.satz-vorschlag'), /Vorschlag laut Tabelle/);
  await page.selectOption('[data-bind="person.steuerklasse"]', '3');
  await page.click('[data-action="satz-tabelle"]');
  const kl3 = await wert(page, 'lst');
  await page.selectOption('[data-bind="person.steuerklasse"]', '5');
  assert.equal(await wert(page, 'lst'), kl3, 'fester Satz: die Steuerklasse allein ändert nichts');
  await page.click('[data-action="satz-tabelle"]');
  assert.notEqual(await wert(page, 'lst'), kl3, 'neuer Satz aus der Tabelle für Steuerklasse V');
  await page.selectOption('[data-bind="steuer.modus"]', 'tabelle');
  const tabelle5 = await wert(page, 'lst');
  await page.selectOption('[data-bind="person.steuerklasse"]', '3');
  assert.notEqual(await wert(page, 'lst'), tabelle5, 'mit der Lohnsteuertabelle wirkt die Steuerklasse sofort');
  await page.selectOption('[data-bind="person.steuerklasse"]', '5');
  await page.selectOption('[data-bind="steuer.modus"]', 'prozent');

  await app.gespeichert(page);
  await page.reload(); // die Adresse zeigt weiter auf den Zettel: er wird aus dem Speicher geladen
  await page.waitForSelector('#slip-host .slip');
  assert.equal(await page.inputValue('[data-bind="person.steuerklasse"]'), '5');
  assert.equal(await page.inputValue('[data-bind="posten.0.faktor"]'), '3.000,00');
  await page.click('#ed-back');
  await page.waitForSelector('#lib-list .card');
  assert.match(await page.locator('#lib-list .card').first().textContent(), /3\.000,00/);
  keineProbleme(problems, foreign);
  await context.close();
});

test('Wert im Zettel von Hand ändern: Rechenweg, Markierung, abhängige Felder, zurücksetzen', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page, 'verkaeuferin');
  await page.click('#slip-host .val[data-feld="kv"]');
  await page.waitForSelector('#dlg-feld[open]');
  assert.match(await page.textContent('#feld-weg'), /Krankenversicherung: 8,75 % von 2\.650,00 €/);
  await page.fill('#feld-wert', '300,00');
  await page.click('#feld-form button[type="submit"]');
  assert.equal(await wert(page, 'kv'), '300,00');
  assert.ok(await page.locator('#slip-host .val[data-feld="kv"].is-override').count());
  const sv = await wert(page, 'svAbzuege');
  await page.click('#slip-host .val[data-feld="kv"]');
  await page.click('#feld-zurueck');
  assert.notEqual(await wert(page, 'svAbzuege'), sv, 'Summe rechnet mit dem Wert weiter');
  assert.equal(await page.locator('#slip-host .is-override').count(), 0);
  // ungültige Eingabe: Fehlermeldung, Dialog bleibt
  await page.click('#slip-host .val[data-feld="kv"]');
  await page.fill('#feld-wert', 'abc');
  await page.click('#feld-form button[type="submit"]');
  assert.ok(await page.locator('#feld-fehler').isVisible());
  await page.keyboard.press('Escape');
  keineProbleme(problems, foreign);
  await context.close();
});

test('Arbeits- und Lösungsblatt, gesucht umschalten, PDF erstellen und herunterladen', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page);
  await page.click('[data-pane="arbeit"]');
  await page.waitForSelector('#pages-host .page');
  const luecken = () => page.locator('#pages-host .page .val.luecke').count();
  assert.equal(await luecken(), 5, 'kv, rv, av, pv, netto sind Lücken');
  assert.equal(await page.locator('#pages-host .page').count(), 2, 'Aufgabenblatt und Beiblatt');
  assert.ok(!(await page.locator('#pages-host').innerHTML()).includes('Krankenversicherung: 8,75 %'), 'Rechenweg steht nicht im Arbeitsblatt');

  await page.click('#pages-host .val[data-feld="lst"]');
  assert.equal(await luecken(), 6);
  await page.click('#pages-host .val[data-feld="lst"]');
  assert.equal(await luecken(), 5);

  await page.click('[data-pane="loesung"]');
  assert.equal(await page.locator('#pages-host .val.loesung').count(), 5);
  assert.ok((await page.locator('#pages-host .tloesung').count()) >= 5);

  await page.click('#ed-pdf');
  await page.click('#pdf-go');
  await page.waitForFunction(() => document.querySelector('#pdf-status').textContent.startsWith('Fertig'), null, { timeout: 60_000 });
  assert.match(await page.textContent('#pdf-status'), /4 Seiten/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pdf-download')]);
  assert.match(download.suggestedFilename(), /\.pdf$/);
  const datei = join(await mkdtemp(join(tmpdir(), 'lohnzettel-')), 'blatt.pdf');
  await download.saveAs(datei);
  const kopf = (await readFile(datei)).subarray(0, 5).toString();
  assert.equal(kopf, '%PDF-');
  keineProbleme(problems, foreign);
  await context.close();
});

test('Zufallsfall mit zwei Gruppen, Neu würfeln mit Rückgängig', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await page.click('#lib-zufall');
  await page.waitForSelector('#dlg-zufall[open]');
  await page.check('input[name="stufe"][value="schwer"]');
  await page.selectOption('[data-k="gruppen"]', '2');
  assert.match(await page.textContent('#zufall-vorschau'), /Vorschau: .* brutto/);
  await page.click('#zufall-ok');
  await page.waitForSelector('#slip-host .slip');
  assert.ok(await page.locator('#ed-wuerfeln').isVisible());
  const titel = await page.inputValue('#ed-titel');
  assert.match(titel, /Gruppe A/);

  await page.click('#ed-wuerfeln');
  await page.waitForFunction((alt) => document.querySelector('#ed-titel').value !== alt, titel);
  assert.doesNotMatch(await page.inputValue('#ed-titel'), /Gruppe/);
  await page.click('#toast-action'); // Rückgängig
  await page.waitForFunction((alt) => document.querySelector('#ed-titel').value === alt, titel);

  await app.gespeichert(page);
  await page.click('#ed-back');
  await page.waitForSelector('#lib-list .card');
  const titeln = await page.locator('#lib-list .card-title').allTextContents();
  assert.equal(titeln.length, 2);
  assert.ok(titeln.some((t) => /Gruppe A/.test(t)) && titeln.some((t) => /Gruppe B/.test(t)));
  keineProbleme(problems, foreign);
  await context.close();
});

test('Rückwärtsaufgaben: ohne Zettel (Netto und Quote) und mit Lücken im Zettel (Beitrag)', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page);
  await bereich(page, 'Arbeitsblatt');
  await page.selectOption('[data-action="rueck-typ"]', 'quote');
  await page.click('[data-pane="arbeit"]');
  await page.waitForSelector('#pages-host .page');
  assert.equal(await page.locator('#pages-host .slip').count(), 0, 'kein Zettel im Arbeitsblatt');
  assert.match(await page.textContent('#pages-host .sachtext'), /Zusammen gehen .* % vom Brutto/);
  await page.selectOption('[data-action="rueck-typ"]', 'beitrag');
  await page.waitForSelector('#pages-host .slip');
  assert.ok((await page.locator('#pages-host .val.luecke').count()) >= 6, 'alle Brutto-Werte sind Lücken');
  await page.selectOption('[data-action="rueck-typ"]', 'probieren');
  await page.waitForSelector('#pages-host .versuche');
  assert.equal(await page.locator('#pages-host .versuche tbody tr').count(), 6);
  keineProbleme(problems, foreign);
  await context.close();
});

test('Vorführmodus: aufdecken, Rechenweg in drei Schritten, Zoom, Erklärmodus', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page);
  await page.click('#ed-present');
  await page.waitForSelector('#view-present', { state: 'visible' });
  await page.waitForSelector('#pr-slip .slip');
  const verdeckt = () => page.locator('#pr-slip .val.verdeckt').count();
  assert.equal(await verdeckt(), 5);
  await page.locator('#pr-slip .val.verdeckt').first().click();
  assert.equal(await verdeckt(), 4);

  await page.click('#pr-slip .val[data-feld="lst"]');
  await page.waitForSelector('#pr-panel:not([hidden])');
  assert.match(await page.textContent('#pr-panel'), /1 · Das brauchst du/);
  assert.ok((await page.locator('#pr-slip .val.quelle').count()) >= 1, 'Zutaten sind markiert');
  await page.click('[data-pr="weiter"]');
  assert.match(await page.textContent('#pr-panel'), /2 · So rechnest du/);
  await page.click('[data-pr="weiter"]');
  assert.match(await page.textContent('#pr-panel'), /3 · Ergebnis/);
  assert.ok(await page.locator('[data-pr="weiter"]').isDisabled());
  await page.click('[data-pr="zu"]');
  assert.ok(await page.locator('#pr-panel').isHidden());

  const vorher = await page.locator('#pr-slip .slip').getAttribute('style');
  await page.click('.pr-gruppe [data-abschnitt="steuer"]');
  await page.waitForFunction((alt) => document.querySelector('#pr-slip .slip').getAttribute('style') !== alt, vorher);
  assert.equal(await page.getAttribute('.pr-gruppe [data-abschnitt="steuer"]', 'aria-pressed'), 'true');

  await page.check('#pr-erklaer');
  assert.equal(await page.locator('#pr-slip .marke').count(), 10);
  assert.match(await page.textContent('#pr-panel'), /So liest du die Abrechnung/);
  await page.click('#pr-aufdecken');
  assert.equal(await verdeckt(), 0);
  await page.click('#pr-back');
  await page.waitForSelector('#slip-host .slip');
  keineProbleme(problems, foreign);
  await context.close();
});

test('Jahresübersicht: Lücken, Lösung, Vergleich', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page, 'weihnachtsgeld');
  await page.click('[data-pane="jahr-arbeit"]');
  await page.waitForSelector('#pages-host .jahrtab');
  assert.equal(await page.locator('#pages-host .val.luecke').count(), 27);
  assert.equal(await page.locator('#pages-host .jahrtab tbody tr').count(), 12);
  assert.ok(await page.locator('#pages-host svg.diagramm').count());
  await page.click('[data-pane="jahr-loesung"]');
  assert.equal(await page.locator('#pages-host .val.loesung').count(), 27);
  await bereich(page, 'Jahresübersicht');
  await page.selectOption('[data-bind="jahresblatt.vergleich"]', 'klassen');
  assert.ok(await page.locator('#pages-host .vergleich').count());
  assert.equal(await page.locator('#pages-host .page.is-overflow').count(), 0, 'Seite passt');
  keineProbleme(problems, foreign);
  await context.close();
});

test('Sicherung: erstellen und in einem anderen Browser-Profil einlesen', async () => {
  const a = await app.openApp();
  await app.neuerZettel(a.page, 'minijob');
  await app.gespeichert(a.page);
  await a.page.click('#ed-back');
  await a.page.waitForSelector('#lib-list .card');
  await a.page.click('#lib-neu');
  await a.page.click('#dlg-neu [data-szenario="azubi"]');
  await a.page.waitForSelector('#slip-host .slip');
  await app.gespeichert(a.page);
  await a.page.click('#ed-back');
  await a.page.waitForFunction(() => document.querySelectorAll('#lib-list .card').length === 2);
  await a.page.click('#lib-backup');
  await a.page.click('#backup-export');
  await a.page.waitForFunction(() => !document.querySelector('#backup-download').hidden || !document.querySelector('#backup-meldung').hidden);
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.locator('#backup-download').isVisible().then((sichtbar) => (sichtbar ? a.page.click('#backup-download') : null))]);
  const datei = join(await mkdtemp(join(tmpdir(), 'lohnzettel-')), download.suggestedFilename());
  await download.saveAs(datei);
  const sicherung = JSON.parse(await readFile(datei, 'utf8'));
  assert.equal(sicherung.format, 'lohnzettel-sicherung');
  assert.ok(sicherung.faelle.length >= 1);
  await a.context.close();

  const b = await app.openApp();
  assert.ok(await b.page.locator('#lib-empty').isVisible());
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-import', datei);
  await b.page.waitForFunction(() => document.querySelector('#backup-meldung').textContent.startsWith('Eingelesen'));
  await b.page.click('#dlg-backup [data-close]');
  assert.equal(await b.page.locator('#lib-list .card').count(), sicherung.faelle.length);
  // kaputte Datei: verständliche Meldung statt Absturz
  const kaputt = join(await mkdtemp(join(tmpdir(), 'lohnzettel-')), 'kaputt.json');
  await (await import('node:fs/promises')).writeFile(kaputt, 'das ist kein json');
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-import', kaputt);
  await b.page.waitForFunction(() => document.querySelector('#backup-meldung').textContent.includes('keine gültige Sicherung'));
  keineProbleme(b.problems, b.foreign);
  await b.context.close();
});

/** Legt über den Dialog ein Mischblatt an (Arten gewählt oder zufällig) und wartet auf den Editor. */
async function neuesMischblatt(page, { typen = [], anzahl = 3, gruppen = 1 } = {}) {
  await page.click('#lib-misch');
  await page.waitForSelector('#dlg-misch[open]');
  for (const t of typen) await page.check(`#dlg-misch [data-typ="${t}"]`);
  await page.selectOption('#dlg-misch [data-k="anzahl"]', String(anzahl));
  await page.selectOption('#dlg-misch [data-k="gruppen"]', String(gruppen));
  await page.click('#misch-ok');
  await page.waitForSelector('#view-misch #mi-pages .page');
}

test('Mischblatt: erzeugen, Aufgaben ändern, Seiten, Lösung, PDF, Übersicht', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await page.click('#lib-misch');
  await page.waitForSelector('#dlg-misch[open]');
  assert.match(await page.textContent('#misch-vorschau'), /Vorschau: /);
  await page.keyboard.press('Escape');
  await neuesMischblatt(page, { typen: ['netto', 'quote'], anzahl: 3, gruppen: 2 });
  assert.equal(await page.locator('.aufgabe-karte').count(), 3);
  assert.deepEqual(await page.locator('[data-m="typ"]').evaluateAll((s) => s.map((x) => x.value)), ['netto', 'quote', 'netto']);
  assert.match(await page.inputValue('#mi-titel'), /Gruppe A/);
  assert.equal(await page.locator('#mi-pages .aufgabe').count(), 3);
  assert.ok((await page.locator('#mi-pages .page').count()) >= 2, 'mehrere Seiten (mit Beiblatt)');
  assert.equal(await page.locator('#mi-pages .page.is-overflow').count(), 0);

  // Alle Teilaufgaben stehen in der Operator-Form
  const texte = await page.locator('#mi-pages .aufgabe .tt').allTextContents();
  assert.ok(texte.length >= 6);
  for (const t of texte) assert.match(t, /\b(Berechne|Ermittle|Bestimme|Lies|Trage)\b/, t);
  assert.ok(texte.every((t) => !t.trim().endsWith('?')));

  // Art der zweiten Aufgabe ändern: neuer Fall, Ausschnitt „Steuer und Sozialversicherung“ mit fünf Lücken
  await page.selectOption('.aufgabe-karte[data-index="1"] [data-m="typ"]', 'sv');
  await page.waitForFunction(() => document.querySelectorAll('#mi-pages .aufgabe')[1]?.querySelectorAll('.val.luecke').length === 5);
  assert.equal(await page.locator('#mi-pages .aufgabe').nth(1).locator('[data-abschnitt="steuer"]').count(), 1);

  // Reihenfolge ändern, Aufgabe hinzufügen und wieder entfernen (mit Rückgängig)
  await page.click('.aufgabe-karte[data-index="1"] [data-m="hoch"]');
  assert.equal(await page.locator('[data-m="typ"]').first().inputValue(), 'sv');
  await page.selectOption('#mi-neu-typ', 'probieren');
  await page.click('[data-m="add"]');
  assert.equal(await page.locator('.aufgabe-karte').count(), 4);
  await page.click('.aufgabe-karte[data-index="3"] [data-m="weg"]');
  assert.equal(await page.locator('.aufgabe-karte').count(), 3);
  await page.click('#toast-action');
  await page.waitForFunction(() => document.querySelectorAll('.aufgabe-karte').length === 4);
  assert.match(await page.locator('#mi-pages').innerHTML(), /class="mz versuche"/);

  // Lösungsblatt mit Tastatur wählen
  await page.focus('#mtab-arbeit');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#mtab-loesung', 'aria-selected'), 'true');
  assert.ok((await page.locator('#mi-pages .tloesung').count()) >= 4);
  assert.ok((await page.locator('#mi-pages .val.loesung').count()) >= 5);

  // PDF: nur Arbeits- und Lösungsblatt, keine Jahresübersicht
  await page.click('#mi-pdf');
  assert.ok(await page.locator('#pdf-jahr-option').isHidden());
  await page.click('#pdf-go');
  await page.waitForFunction(() => document.querySelector('#pdf-status').textContent.startsWith('Fertig'), null, { timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pdf-download')]);
  assert.match(download.suggestedFilename(), /Gruppe A.*\.pdf$/);
  const datei = join(await mkdtemp(join(tmpdir(), 'lohnzettel-')), 'misch.pdf');
  await download.saveAs(datei);
  assert.equal((await readFile(datei)).subarray(0, 5).toString(), '%PDF-');
  await page.keyboard.press('Escape');

  // Übersicht: beide Gruppen als Mischblatt-Karten
  await app.gespeichert(page);
  await page.click('#mi-back');
  await page.waitForSelector('#lib-list .card-misch');
  const karten = await page.locator('#lib-list .card-misch .card-title').allTextContents();
  assert.equal(karten.length, 2);
  assert.ok(karten.some((t) => /Gruppe A/.test(t)) && karten.some((t) => /Gruppe B/.test(t)));
  keineProbleme(problems, foreign);
  await context.close();
});

test('Mischblatt: Zettel einsetzen, neu würfeln, Duplizieren, Sicherung mit Mischblättern', async () => {
  const a = await app.openApp();
  await app.neuerZettel(a.page, 'handwerker');
  await app.gespeichert(a.page);
  await a.page.click('#ed-back');
  await a.page.waitForSelector('#lib-list .card');
  await neuesMischblatt(a.page, { typen: ['bezuege'], anzahl: 2 });
  await a.page.click('.aufgabe-karte[data-index="0"] [data-m="einsetzen"]');
  await a.page.waitForSelector('#dlg-pick[open]');
  await a.page.click('#pick-liste [data-fall]');
  await a.page.waitForFunction(() => document.querySelector('#mi-pages .aufgabe .sachtext')?.textContent.includes('Jonas Wagner'));
  assert.match(await a.page.locator('.aufgabe-karte').first().textContent(), /Jonas Wagner/);

  const vorher = await a.page.locator('.aufgabe-karte').nth(1).locator('.muted').first().textContent();
  await a.page.click('.aufgabe-karte[data-index="1"] [data-m="neu"]');
  await a.page.waitForFunction((alt) => document.querySelectorAll('.aufgabe-karte')[1].querySelector('.muted').textContent !== alt, vorher);

  await a.page.click('#mi-wuerfeln');
  await a.page.waitForFunction(() => !document.querySelector('.aufgabe-karte').textContent.includes('Jonas Wagner'));
  await a.page.click('#toast-action'); // Rückgängig: der eingesetzte Zettel ist wieder da
  await a.page.waitForFunction(() => document.querySelector('.aufgabe-karte').textContent.includes('Jonas Wagner'));

  await app.gespeichert(a.page);
  await a.page.click('#mi-dup');
  await a.page.waitForFunction(() => document.querySelector('#mi-titel').value.includes('(Kopie)'));
  await app.gespeichert(a.page);
  await a.page.click('#mi-back');
  await a.page.waitForFunction(() => document.querySelectorAll('#lib-list .card-misch').length === 2);

  await a.page.click('#lib-backup');
  await a.page.click('#backup-export');
  await a.page.waitForSelector('#backup-download:not([hidden])');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#backup-download')]);
  const datei = join(await mkdtemp(join(tmpdir(), 'lohnzettel-')), download.suggestedFilename());
  await download.saveAs(datei);
  const sicherung = JSON.parse(await readFile(datei, 'utf8'));
  assert.equal(sicherung.blaetter.length, 2);
  assert.equal(sicherung.faelle.length, 1);
  await a.context.close();

  const b = await app.openApp();
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-import', datei);
  await b.page.waitForFunction(() => document.querySelector('#backup-meldung').textContent.startsWith('Eingelesen: 3 neu'));
  await b.page.click('#dlg-backup [data-close]');
  assert.equal(await b.page.locator('#lib-list .card-misch').count(), 2);
  await b.page.locator('#lib-list .card-misch .card-open').first().click();
  await b.page.waitForSelector('#mi-pages .page');
  assert.ok((await b.page.locator('#mi-pages .aufgabe').count()) >= 1);
  keineProbleme(b.problems, b.foreign);
  keineProbleme(a.problems, a.foreign);
  await b.context.close();
});

test('Sehr einfach: Felder entfallen, Beiblatt erklärt mit kleiner Satz-Tabelle, Zufall „leicht“ ist sehr einfach', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page, 'verkaeuferin');
  const felder = () => page.locator('#slip-host [data-feld]').evaluateAll((e) => e.map((x) => x.dataset.feld));
  let ids = await felder();
  for (const id of ['stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto']) assert.ok(ids.includes(id), `normal: ${id}`);
  assert.ok(await page.locator('#slip-host thead th:text-is("St")').count());

  await bereich(page, 'Aussehen und weitere Blöcke');
  await page.check('[data-bind="anzeige.einfach"]');
  ids = await felder();
  for (const id of ['stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto', 'soli']) assert.ok(!ids.includes(id), `einfach: ${id}`);
  assert.equal(await page.locator('#slip-host thead th:text-is("St")').count(), 0);
  assert.match(await page.textContent('#slip-host'), /Alles wird vom Gesamt-Brutto berechnet/);
  const kv = await wert(page, 'kv');
  assert.equal(kv, '231,88', '8,75 % von 2.650 €');
  await page.uncheck('[data-bind="anzeige.einfach"]');
  await page.check('[data-bind="anzeige.einfach"]');

  // Arbeitsblatt: einfache Texte, Beiblatt mit Erklärungen und kleiner Tabelle, nichts läuft über
  await page.click('[data-pane="arbeit"]');
  await page.waitForSelector('#pages-host [data-seite="beiblatt"]');
  const bei = page.locator('#pages-host [data-seite="beiblatt"]');
  const text = await bei.textContent();
  for (const abschnitt of ['1 · Brutto und Netto', '2 · Sozialabgaben', '3 · Steuern', '4 · So kommt das Netto heraus', 'Steuersatz nach Brutto und Steuerklasse']) assert.ok(text.includes(abschnitt), abschnitt);
  assert.doesNotMatch(text, /Obergrenze|Solidarit/);
  assert.equal(await bei.locator('.mz.lst tbody tr').count(), 8);
  assert.equal(await page.locator('#pages-host .page.is-overflow').count(), 0);
  const aufgaben = await page.locator('#pages-host .aufgabe, #pages-host .teil .tt').allTextContents();
  assert.ok(aufgaben.length >= 5 && aufgaben.every((t) => !t.includes('KV-Brutto')));

  // Steuersatz in der Tabelle ablesen: der Satz steht nicht mehr im Text
  await bereich(page, 'Lohnsteuer');
  await page.click('#pages-host .val[data-feld="lst"]'); // Lohnsteuer als gesucht markieren
  const imText = await page.locator('#pages-host .teil .tt', { hasText: 'Lohnsteuer' }).first().textContent();
  assert.match(imText, /Der Steuersatz ist \d+ %\. Rechne \d+ % vom Brutto\./);
  await page.check('[data-bind="aufgabe.satzAblesen"]');
  const ablesen = await page.locator('#pages-host .teil .tt', { hasText: 'Steuersatz' }).first().textContent();
  assert.match(ablesen, /Tabelle auf dem Beiblatt/);
  assert.doesNotMatch(ablesen, /ist \d+ %/, 'der Satz steht nicht im Text');
  await page.click('[data-pane="zettel"]');

  // Zufallsfall: Stufe „leicht“ schaltet „Sehr einfach“ automatisch ein, „mittel“ wieder aus
  await page.click('#ed-back');
  await page.click('#lib-zufall');
  await page.waitForSelector('#dlg-zufall[open]');
  await page.check('input[name="stufe"][value="leicht"]');
  assert.ok(await page.locator('#dlg-zufall [data-k="einfach"]').isChecked());
  assert.equal(await page.inputValue('#dlg-zufall [data-k="steuer"]'), 'prozent');
  await page.check('input[name="stufe"][value="mittel"]');
  assert.ok(!(await page.locator('#dlg-zufall [data-k="einfach"]').isChecked()));
  await page.check('input[name="stufe"][value="leicht"]');
  await page.click('#zufall-ok');
  await page.waitForSelector('#slip-host .slip');
  ids = await felder();
  assert.ok(!ids.includes('kvBrutto') && ids.includes('kv'));
  keineProbleme(problems, foreign);
  await context.close();
});

test('Registerkarten sind mit der Tastatur bedienbar, Dialoge haben Namen', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await app.neuerZettel(page);
  await page.focus('#tab-zettel');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#tab-arbeit', 'aria-selected'), 'true');
  assert.equal(await page.getAttribute('#tab-zettel', 'tabindex'), '-1');
  await page.keyboard.press('End');
  assert.equal(await page.getAttribute('#tab-jahr-loesung', 'aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.getAttribute('#tab-zettel', 'aria-selected'), 'true');
  assert.equal(await page.getAttribute('#slip-host', 'aria-labelledby'), 'tab-zettel');
  // Alle Eingabefelder im Formular haben einen Namen
  const ohneName = await page.evaluate(() =>
    [...document.querySelectorAll('#editor-form input, #editor-form select, #editor-form textarea')]
      .filter((el) => !el.closest('label') && !el.getAttribute('aria-label'))
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  assert.deepEqual(ohneName, []);
  keineProbleme(problems, foreign);
  await context.close();
});

test('Schmaler Bildschirm (iPad hochkant): nichts läuft seitlich aus der Seite', async () => {
  const context = await app.newContext({ viewport: { width: 768, height: 1024 } });
  const { page, problems, foreign } = await app.openApp({ context });
  await app.neuerZettel(page);
  const breite = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok((await breite()) <= 1, 'Editor ohne waagerechtes Scrollen');
  await page.click('#ed-present');
  await page.waitForSelector('#pr-slip .slip');
  assert.ok((await breite()) <= 1, 'Vorführmodus ohne waagerechtes Scrollen');
  keineProbleme(problems, foreign);
  await context.close();
});
