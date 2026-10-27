// Dialog „Zufallsfall erzeugen“: Stufe wählen, Schalter einzeln anpassen, Startwert und Anzahl der Gruppen.
import { berechne } from './calc/payroll.js';
import { fmtCents } from './calc/money.js';
import { AUFGABEN, defaultSpec, erzeugeFall, erzeugeGruppen, randomSeed } from './generators/faelle.js';
import { RUECK_TYPEN } from './rueck.js';
import { esc } from './slip.js';
import { $ } from './ui.js';

const SCHALTER = [
  ['glatt', 'Runde Zahlen'],
  ['zuschlaege', 'Zuschläge (Nacht, Sonntag, Überstunden …)'],
  ['sonderzahlung', 'Sonderzahlung (Weihnachts-/Urlaubsgeld)'],
  ['kirche', 'Kirchensteuer'],
  ['kinder', 'Kinder'],
  ['ueberBbg', 'Verdienst über der Beitragsgrenze'],
  ['minijob', 'Minijob'],
];

const STUFEN_TEXT = {
  leicht: 'Leicht – runde Zahlen, feste Prozentsätze',
  mittel: 'Mittel – echte Sätze, Lohnsteuertabelle',
  schwer: 'Schwer – Zuschläge, Sonderzahlung, alle Steuerklassen',
};

export function createZufallDialog(app) {
  const dlg = $('#dlg-zufall');
  const host = $('#zufall-felder');
  let spec = defaultSpec('mittel');
  let gruppen = 1;

  const options = (liste, wert) => Object.entries(liste).map(([k, t]) => `<option value="${esc(k)}"${k === wert ? ' selected' : ''}>${esc(t)}</option>`).join('');

  function render() {
    host.innerHTML = `
      <fieldset class="optionen"><legend>Stufe</legend>
        ${Object.entries(STUFEN_TEXT).map(([k, t]) => `<label><input type="radio" name="stufe" data-k="stufe" value="${k}"${spec.stufe === k ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
      </fieldset>
      <div class="row">
        <label class="f"><span>Aufgabe</span><select data-k="aufgabe">${options(AUFGABEN, spec.aufgabe)}</select></label>
        <label class="f"><span>Richtung</span><select data-k="rueck"><option value="">Vorwärts: Brutto → Netto</option>${Object.entries(RUECK_TYPEN).map(([k, t]) => `<option value="${k}"${spec.rueck === k ? ' selected' : ''}>Rückwärts: ${esc(t.label)}</option>`).join('')}</select></label>
      </div>
      <div class="row">
        <label class="f"><span>Art</span><select data-k="art">${options({ gemischt: 'Gehalt und Lohn gemischt', gehalt: 'Gehalt (Monatsgehalt)', lohn: 'Lohn (Stundenlohn)' }, spec.art)}</select></label>
        <label class="f"><span>Lohnsteuer</span><select data-k="steuer">${options({ prozent: 'Fester Prozentsatz', tabelle: 'Lohnsteuertabelle', formel: 'Rechnerisch nach Tarif' }, spec.steuer)}</select></label>
      </div>
      <label class="f"><span>Steuerklassen</span><select data-k="klassen">${options({ I: 'Nur Steuerklasse I', alle: 'Alle Steuerklassen' }, spec.klassen)}</select></label>
      <fieldset class="optionen"><legend>Einzeln einstellbar</legend>
        ${SCHALTER.map(([k, t]) => `<label><input type="checkbox" data-k="${k}"${spec[k] ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
      </fieldset>
      <div class="row">
        <label class="f"><span>Startwert</span><input data-k="seed" inputmode="numeric" value="${spec.seed}"></label>
        <label class="f"><span>Gruppen (A, B, …)</span><select data-k="gruppen">${[1, 2, 3, 4].map((n) => `<option value="${n}"${n === gruppen ? ' selected' : ''}>${n === 1 ? '1 (keine Gruppen)' : `${n} Gruppen`}</option>`).join('')}</select></label>
        <button type="button" class="btn" id="zufall-wuerfeln" title="Neuen Startwert würfeln">Würfeln</button>
      </div>`;
    preview();
  }

  function preview() {
    try {
      const f = erzeugeFall(spec);
      const r = berechne(f);
      $('#zufall-vorschau').textContent = `Vorschau: ${f.titel} – ${fmtCents(r.gesamtBrutto)} € brutto, Steuerklasse ${f.person.steuerklasse}, ${f.aufgabe.gesucht.length} gesuchte Werte${spec.rueck ? ` (rückwärts)` : ''}.`;
    } catch (err) {
      $('#zufall-vorschau').textContent = `Vorschau nicht möglich: ${err.message}`;
    }
  }

  host.addEventListener('change', (e) => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const k = el.dataset.k;
    if (k === 'stufe') {
      spec = { ...defaultSpec(el.value, spec.seed), art: spec.art, rueck: spec.rueck };
      render();
    } else if (k === 'gruppen') {
      gruppen = Number(el.value);
      preview();
    } else if (k === 'seed') {
      const n = Math.floor(Number(el.value));
      spec.seed = Number.isFinite(n) && n >= 0 ? n % 4294967296 : spec.seed;
      el.value = spec.seed;
      preview();
    } else {
      spec[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'minijob' && el.checked) spec.ueberBbg = false;
      if (k === 'ueberBbg' && el.checked) spec.minijob = false;
      render();
    }
  });
  host.addEventListener('click', (e) => {
    if (e.target.closest('#zufall-wuerfeln')) {
      spec.seed = randomSeed();
      render();
    }
  });
  $('#zufall-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    dlg.close();
    await app.createFaelle(erzeugeGruppen(spec, gruppen));
  });

  return {
    open() {
      spec = { ...defaultSpec(spec.stufe, randomSeed()), art: spec.art, rueck: spec.rueck };
      render();
      dlg.showModal();
    },
  };
}
