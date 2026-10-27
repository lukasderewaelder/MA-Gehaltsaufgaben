import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, mergeFaelle, parseBackup, backupReminder } from '../src/backup.js';
import { berechne } from '../src/calc/payroll.js';
import { duplicateFall, newFall, newPosten, normalizeFall, pruneOverrides } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';
import { createMemoryStore } from '../src/store.js';

test('Normalisieren: kaputte und unvollständige Daten werden gültig', () => {
  assert.equal(normalizeFall(null), null);
  assert.equal(normalizeFall({ titel: 'ohne id' }), null);
  const f = normalizeFall({ id: 'x', monat: 99, person: { steuerklasse: 9, kinder: -2, konfession: 'zz' }, posten: [{ typ: 'unbekannt', faktor: 'abc' }, null], steuer: { modus: 'quatsch' } });
  assert.equal(f.monat, 12);
  assert.equal(f.person.steuerklasse, 6);
  assert.equal(f.person.kinder, 0);
  assert.equal(f.person.konfession, 'keine');
  assert.equal(f.posten.length, 1);
  assert.equal(f.posten[0].typ, 'gehalt');
  assert.equal(f.posten[0].faktor, 0);
  assert.equal(f.steuer.modus, 'tabelle');
  assert.doesNotThrow(() => berechne(f));
});

test('Duplizieren: neue Ids, Überschreibungen und Posten bleiben getrennt', () => {
  const a = newFall();
  a.ueberschreibungen = { lst: 123 };
  const b = duplicateFall(a);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.posten[0].id, b.posten[0].id);
  assert.deepEqual(b.ueberschreibungen, { lst: 123 });
  assert.match(b.titel, /Kopie/);
  b.ueberschreibungen.lst = 5;
  assert.equal(a.ueberschreibungen.lst, 123);
});

test('Überschreibungen gelöschter Posten werden entfernt', () => {
  const f = newFall();
  const extra = newPosten('nacht');
  f.posten.push(extra);
  f.ueberschreibungen = { [`p:${extra.id}`]: 1, [`p:${f.posten[0].id}`]: 2, lst: 3 };
  f.posten.pop();
  pruneOverrides(f);
  assert.deepEqual(Object.keys(f.ueberschreibungen).sort(), [`p:${f.posten[0].id}`, 'lst'].sort());
});

test('Alle Szenarien sind gültig und rechnen plausibel', () => {
  for (const s of SCENARIOS) {
    const f = s.build();
    assert.deepEqual(normalizeFall(structuredClone(f)).posten.map((p) => p.typ), f.posten.map((p) => p.typ), s.id);
    const r = berechne(f);
    assert.ok(r.gesamtBrutto > 0, s.id);
    assert.equal(r.netto, r.gesamtBrutto - r.steuerAbzuege - r.svAbzuege, s.id);
    assert.ok(r.auszahlung > 0 && r.auszahlung <= r.gesamtBrutto, s.id);
  }
});

test('Szenario-Plausibilität: Minijob ohne Abzüge, Klasse III < I < V, Beitragsgrenze', () => {
  const by = (id) => berechne(SCENARIOS.find((s) => s.id === id).build());
  assert.equal(by('minijob').steuerAbzuege + by('minijob').svAbzuege, 0);
  const klasse = (k) => {
    const f = SCENARIOS.find((s) => s.id === 'klasse3').build();
    f.person.steuerklasse = k;
    f.person.kinder = 0;
    return berechne(f).lst;
  };
  assert.ok(klasse(3) < klasse(1) && klasse(1) < klasse(5));
  const gut = by('gutverdiener');
  assert.equal(gut.rvBrutto, gut.rates.bbgRv);
  assert.equal(gut.kvBrutto, gut.rates.bbgKv);
  assert.ok(gut.gesamtBrutto > gut.rvBrutto);
  // Weihnachtsgeld: Steuer deutlich höher als im Monat ohne Sonderzahlung
  const w = by('weihnachtsgeld');
  const ohne = SCENARIOS.find((s) => s.id === 'weihnachtsgeld').build();
  ohne.posten = ohne.posten.slice(0, 1);
  assert.ok(w.lst > berechne(ohne).lst * 2);
});

test('Speicher (Arbeitsspeicher-Variante): speichern, lesen, löschen, Einstellungen', async () => {
  const store = createMemoryStore();
  const f = newFall();
  await store.saveFall(f);
  assert.equal((await store.listFaelle()).length, 1);
  assert.equal((await store.getFall(f.id)).titel, f.titel);
  await store.setSetting('optik', 'original');
  assert.equal((await store.getSettings()).optik, 'original');
  await store.deleteFall(f.id);
  assert.equal(await store.getFall(f.id), undefined ?? null);
});

test('Sicherung: Export, Import, Zusammenführen und Fehlermeldungen', () => {
  const a = newFall();
  const b = newFall();
  const json = JSON.stringify(buildBackup([a, b]));
  const { faelle, ignoriert } = parseBackup(json);
  assert.equal(faelle.length, 2);
  assert.equal(ignoriert, 0);
  const neuer = { ...structuredClone(a), updatedAt: a.updatedAt + 5, titel: 'neu' };
  const m = mergeFaelle([a], [neuer, b, a]);
  assert.equal(m.hinzu, 1);
  assert.equal(m.aktualisiert, 1);
  assert.equal(m.uebersprungen, 1);
  assert.throws(() => parseBackup('kein json'), /kein lesbares JSON/);
  assert.throws(() => parseBackup('{"format":"anders","faelle":[]}'), /keine Lohnzettel-Sicherung/);
  assert.throws(() => parseBackup('{"format":"lohnzettel-sicherung","version":99,"faelle":[]}'), /neueren Version/);
  assert.equal(parseBackup(JSON.stringify({ format: 'lohnzettel-sicherung', version: 1, faelle: [a, { kaputt: true }] })).ignoriert, 1);
});

test('Sicherungs-Erinnerung', () => {
  const now = Date.now();
  assert.equal(backupReminder({ changesSinceBackup: 20, lastBackupAt: 0 }, 0, now), null);
  assert.match(backupReminder({ changesSinceBackup: 20, lastBackupAt: 0 }, 2, now), /Noch keine Sicherung/);
  assert.equal(backupReminder({ changesSinceBackup: 3, lastBackupAt: 0 }, 2, now), null);
  assert.match(backupReminder({ changesSinceBackup: 12, lastBackupAt: now - 9 * 86_400_000 }, 2, now), /vor 9 Tagen/);
  assert.equal(backupReminder({ changesSinceBackup: 12, lastBackupAt: now - 2 * 86_400_000 }, 2, now), null);
});
