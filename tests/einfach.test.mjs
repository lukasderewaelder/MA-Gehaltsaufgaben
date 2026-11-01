// Detailgrad „Sehr einfach“: keine Obergrenzen, kein Steuer-Brutto, kein SV-Brutto, kein Soli – alles wird vom Gesamt-Brutto gerechnet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { berechne } from '../src/calc/payroll.js';
import { defaultSpec, erzeugeFall } from '../src/generators/faelle.js';
import { defaultMischSpec, erzeugeMischblatt } from '../src/misch.js';
import { renderAufgabe } from '../src/mischsheet.js';
import { newFall, newPosten, normalizeFall } from '../src/model.js';
import { rueckPlan } from '../src/rueck.js';
import { erklaerungen, renderSlip } from '../src/slip.js';
import { teilText, teilaufgaben, verfuegbareFelder } from '../src/worksheet.js';

const NUR_NORMAL = ['stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto', 'soli'];
const zaehle = (html, muster) => (html.match(muster) ?? []).length;

function fall({ einfach, modus = 'prozent', brutto = 920000, extra = [] } = {}) {
  const f = newFall({ posten: [newPosten('gehalt', { faktor: brutto }), ...extra] });
  f.steuer = { modus, prozent: 1500, soli: modus !== 'prozent' };
  f.anzeige.einfach = einfach;
  return f;
}

test('Rechnung: Obergrenzen werden ignoriert, Steuer-Brutto = Gesamt-Brutto', () => {
  const normal = berechne(fall({ einfach: false }));
  const einfach = berechne(fall({ einfach: true }));
  assert.equal(normal.rvBrutto, normal.rates.bbgRv, 'normal: Obergrenze greift');
  assert.equal(einfach.rvBrutto, 920000);
  assert.equal(einfach.kvBrutto, 920000);
  assert.equal(einfach.avBrutto, 920000);
  assert.equal(einfach.pvBrutto, 920000);
  assert.equal(einfach.stBrutto, einfach.gesamtBrutto);
  assert.equal(einfach.kv, Math.round((920000 * 875) / 10000));
  assert.equal(einfach.rv, Math.round((920000 * 930) / 10000));
  assert.ok(einfach.svAbzuege > normal.svAbzuege);
  assert.equal(einfach.einfach, true);
});

test('Alle Bezüge zählen voll: steuerfreie Zuschläge und Sonderzahlungen werden nicht anders behandelt', () => {
  const extra = [newPosten('nacht', { menge: 2000, faktor: 1500 }), newPosten('weihnachtsgeld', { faktor: 100000 })];
  for (const modus of ['prozent', 'tabelle', 'formel']) {
    const normal = berechne(fall({ einfach: false, brutto: 250000, extra, modus }));
    const einfach = berechne(fall({ einfach: true, brutto: 250000, extra, modus }));
    assert.ok(normal.stBrutto < normal.gesamtBrutto, `${modus}: normal lässt steuerfreie Anteile weg`);
    assert.equal(einfach.stBrutto, einfach.gesamtBrutto, modus);
    assert.equal(einfach.kvBrutto, einfach.gesamtBrutto, modus);
    assert.equal(einfach.soli, 0, `${modus}: kein Soli`);
    assert.equal(einfach.netto, einfach.gesamtBrutto - einfach.steuerAbzuege - einfach.svAbzuege);
  }
  const p = berechne(fall({ einfach: true, brutto: 300000 }));
  assert.equal(p.lst, 45000, 'fester Satz 15 % vom Brutto');
});

test('Rechenweg und Zutaten zeigen direkt auf das Gesamt-Brutto', () => {
  const r = berechne(fall({ einfach: true, brutto: 300000 }));
  for (const id of ['lst', 'kv', 'rv', 'av', 'pv']) assert.deepEqual(r.weg[id].aus, ['gesamtBrutto'], id);
  const n = berechne(fall({ einfach: false, brutto: 300000 }));
  assert.deepEqual(n.weg.kv.aus, ['kvBrutto']);
});

test('Zettel: die überflüssigen Felder und Spalten fehlen', () => {
  const normal = renderSlip(fall({ einfach: false }), berechne(fall({ einfach: false })));
  const f = fall({ einfach: true });
  const html = renderSlip(f, berechne(f));
  for (const id of NUR_NORMAL) {
    assert.ok(normal.includes(`data-feld="${id}"`), `normal hat ${id}`);
    assert.ok(!html.includes(`data-feld="${id}"`), `einfach hat kein ${id}`);
  }
  assert.doesNotMatch(html, /Steuer-Brutto|KV-Brutto|Solidaritätszuschlag|<th>St<\/th>|<th>SV<\/th>/);
  assert.match(html, /Alles wird vom Gesamt-Brutto berechnet/);
  assert.match(html, /KV-Beitrag <small>8,75 %<\/small>/);
  assert.match(html, /data-feld="lst"/);
  assert.match(html, /Abzüge für Steuern/);
  // Spaltenzahl der Bezüge-Tabelle: 7 statt 9
  assert.equal(zaehle(html.slice(html.indexOf('<thead>'), html.indexOf('</thead>')), /<th>/g), 7);
  f.anzeige.bloecke.verdienst = true;
  assert.doesNotMatch(renderSlip(f, berechne(f)), /Steuer-Brutto|SV-Brutto|Solidaritätszuschlag/);
});

test('Verfügbare Felder, Teilaufgaben und Texte ohne die entfallenen Felder', () => {
  const f = fall({ einfach: true, brutto: 300000 });
  f.aufgabe.gesucht = ['stBrutto', 'kvBrutto', 'soli', 'kv', 'rv', 'netto'];
  const r = berechne(f);
  const ids = verfuegbareFelder(f, r).flatMap((g) => g.felder.map((x) => x.id));
  for (const id of NUR_NORMAL.concat(['kumStBrutto', 'kumSvBrutto', 'kumSoli'])) assert.ok(!ids.includes(id), id);
  assert.ok(ids.includes('kv') && ids.includes('lst') && ids.includes('gesamtBrutto'));
  const texte = teilaufgaben(f, r).map((t) => t.text);
  assert.equal(texte.length, 3, 'nur kv, rv und netto bleiben');
  assert.match(texte[0], /Rechne 8,75 % vom Brutto\./);
  assert.ok(texte.every((t) => !/KV-Brutto|Steuer-Brutto|Obergrenze/.test(t)));
  assert.match(teilText(f, r, 'lst'), /Rechne 15,0 % vom Brutto\./);
  assert.match(teilText(f, r, 'steuerAbzuege'), /Lohnsteuer \+ Kirchensteuer\./);
});

test('Erklärmodus: neun Marken ohne „St und SV“, Texte ohne Obergrenze und Soli', () => {
  const f = fall({ einfach: true });
  const e = erklaerungen(f);
  assert.equal(e.length, 9);
  assert.ok(!e.some((x) => x.id === 'stsv'));
  assert.deepEqual(e.map((x) => x.nr), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(e.every((x) => !/Obergrenze|Soli/.test(x.text)));
  assert.equal(erklaerungen(fall({ einfach: false })).length, 10);
  f.anzeige.erklaermodus = true;
  assert.equal(zaehle(renderSlip(f, berechne(f), { legende: false }), /<span class="marke"/g), 9);
});

test('Rückwärts „Beitrag und Satz“: nur Gesamt-Brutto und Bezüge sind Lücken', () => {
  const f = fall({ einfach: true, brutto: 300000 });
  f.aufgabe.rueck = { typ: 'beitrag', param: 'rv' };
  const r = berechne(f);
  const plan = rueckPlan(f, r, { kompakt: true });
  assert.deepEqual(plan.gesucht, [`p:${f.posten[0].id}`, 'gesamtBrutto']);
  assert.match(plan.teile[0].text, /Das sind 9,3 % vom Brutto\. Berechne das Brutto\. Rechne: Beitrag : Prozentsatz\./);
  assert.equal(plan.teile.length, 2);
});

test('Zufallsfälle: Stufe „leicht“ ist sehr einfach, die anderen nicht; alles ohne entfallene Felder', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const leicht = erzeugeFall(defaultSpec('leicht', seed));
    assert.equal(leicht.anzeige.einfach, true);
    assert.equal(leicht.steuer.modus, 'prozent');
    assert.equal(leicht.steuer.soli, false);
    assert.ok(!leicht.posten.some((p) => ['nacht', 'sonntag', 'feiertag'].includes(p.typ)));
    assert.ok(leicht.aufgabe.gesucht.every((id) => !NUR_NORMAL.includes(id)), `leicht/${seed}: ${leicht.aufgabe.gesucht}`);
    assert.equal(erzeugeFall(defaultSpec('mittel', seed)).anzeige.einfach, false);
    assert.equal(erzeugeFall(defaultSpec('schwer', seed)).anzeige.einfach, false);
  }
  // auch mit Zuschlägen und anderen Aufgaben
  for (const aufgabe of ['komplett', 'netto', 'sv', 'steuer', 'brutto']) {
    for (let seed = 1; seed <= 10; seed++) {
      const f = erzeugeFall({ ...defaultSpec('mittel', seed * 13), einfach: true, zuschlaege: true, sonderzahlung: true, klassen: 'alle', aufgabe });
      const r = berechne(f);
      const ids = verfuegbareFelder(f, r).flatMap((g) => g.felder.map((x) => x.id));
      assert.ok(f.aufgabe.gesucht.every((id) => ids.includes(id)), `${aufgabe}/${seed}: ${f.aufgabe.gesucht}`);
      assert.ok(teilaufgaben(f, r).length > 0);
    }
  }
  assert.equal(normalizeFall(structuredClone(erzeugeFall(defaultSpec('leicht', 1)))).anzeige.einfach, true, 'bleibt beim Speichern erhalten');
});

test('Mischblatt: Stufe „leicht“ ist sehr einfach, Ausschnitte enthalten immer die Bezüge', () => {
  const b = erzeugeMischblatt({ ...defaultMischSpec('leicht', 5), anzahl: 8, typen: ['bezuege', 'sv', 'steuer', 'netto', 'beitrag', 'stundenlohn', 'quote', 'probieren'] });
  assert.ok(b.aufgaben.every((a) => a.fall.anzeige.einfach));
  const html = Object.fromEntries(b.aufgaben.map((a) => [a.typ, renderAufgabe(a, 1, b, 'arbeit')]));
  for (const typ of ['sv', 'steuer', 'netto', 'beitrag']) {
    assert.match(html[typ], /data-abschnitt="bezuege"/, typ);
    assert.match(html[typ], /data-abschnitt="steuer"/, typ);
  }
  assert.doesNotMatch(html.sv, /Steuer-Brutto|KV-Brutto/);
  assert.equal(zaehle(html.sv, /class="val luecke/g), 5);
  assert.ok(zaehle(html.beitrag, /class="val luecke/g) >= 2, 'Gesamt-Brutto und Bezüge sind Lücken');
  assert.doesNotMatch(html.quote, /class="slip/);
  const normal = erzeugeMischblatt({ ...defaultMischSpec('mittel', 5), anzahl: 4, typen: ['sv'] });
  assert.ok(normal.aufgaben.every((a) => !a.fall.anzeige.einfach));
});
