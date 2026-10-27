import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectAssets, currentAndExpected } from '../tools/precache.mjs';

test('sw.js listet alle App-Dateien (sonst: node tools/precache.mjs)', () => {
  const { sw, expected } = currentAndExpected();
  assert.equal(sw, expected);
});

test('Wichtige Dateien sind im Precache', () => {
  const files = collectAssets();
  for (const f of ['index.html', 'manifest.webmanifest', 'src/main.js', 'src/calc/payroll.js', 'assets/css/slip.css']) {
    assert.ok(files.includes(f), `${f} fehlt`);
  }
  assert.ok(!files.some((f) => f.startsWith('tests/') || f.startsWith('docs/')));
});
