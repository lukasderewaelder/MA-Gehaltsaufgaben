// Fall-Editor: Formular links, Live-Vorschau des Zettels rechts, Überschreiben einzelner Felder per Klick.
import { berechne } from './calc/payroll.js';
import { fmtBp, fmtCents, parseScaled } from './calc/money.js';
import { YEARS } from './calc/rates.js';
import { BLOECKE, KONFESSIONEN, MONATE, POSTEN_TYPEN, STEUERMODI, newPosten, normalizeFall, pruneOverrides } from './model.js';
import { canSharePdf, createPdf, downloadPdf, openPdf, pdfFile, safeFilename, sharePdf } from './export-pdf.js';
import { esc, feldName, renderSlip } from './slip.js';
import { $, toast } from './ui.js';
import { PAGE_W, fitPages, gesuchteFelder, renderBlatt, sachtextAuto, teilText, teilaufgaben, verfuegbareFelder } from './worksheet.js';

const SLIP_WIDTH = PAGE_W; // A4 bei 96 dpi

const PANE_HINWEIS = {
  zettel: 'Auf einen Wert im Zettel tippen, um ihn von Hand zu ändern und den Rechenweg zu sehen.',
  arbeit: 'Auf einen Wert tippen: gesucht (bleibt leer) oder angegeben. Leere Linien sind die gesuchten Werte.',
  loesung: 'Grün hinterlegt sind die gesuchten Werte. Auf einen Wert tippen schaltet „gesucht“ um.',
};

const getAt = (obj, path) => path.split('.').reduce((a, k) => a?.[k], obj);
function setAt(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((a, k) => a[k], obj)[last] = value;
}

const FORMAT = {
  text: (v) => v ?? '',
  int: (v) => String(v ?? ''),
  money: (v) => fmtCents(v ?? 0),
  hund: (v) => fmtCents(v ?? 0),
  bp: (v) => fmtBp(v ?? 0),
};

const input = (label, path, kind, fall, extra = '') =>
  `<label class="f"><span>${label}</span><input data-bind="${path}" data-kind="${kind}" value="${esc(FORMAT[kind](getAt(fall, path)))}"${
    kind === 'text' ? '' : kind === 'int' ? ' inputmode="numeric"' : ' inputmode="decimal"'
  } ${extra}></label>`;

const select = (label, path, options, fall, kind = 'text') =>
  `<label class="f"><span>${label}</span><select data-bind="${path}" data-kind="${kind}">${options
    .map(([v, t]) => `<option value="${esc(v)}"${String(getAt(fall, path)) === String(v) ? ' selected' : ''}>${esc(t)}</option>`)
    .join('')}</select></label>`;

const check = (label, path, fall) =>
  `<label class="f f-check"><input type="checkbox" data-bind="${path}" data-kind="bool"${getAt(fall, path) ? ' checked' : ''}><span>${label}</span></label>`;

function postenForm(fall, p, i) {
  const art = POSTEN_TYPEN[p.typ]?.art ?? 'pauschal';
  const base = `posten.${i}`;
  const typen = Object.entries(POSTEN_TYPEN).map(([k, d]) => [k, d.label]);
  return `<fieldset class="posten" data-index="${i}">
    <legend>${esc(p.bezeichnung || 'Posten')} <button type="button" class="btn-x" data-action="del-posten" data-index="${i}" aria-label="Posten ${esc(p.bezeichnung)} entfernen">✕</button></legend>
    <label class="f"><span>Art</span><select data-action="typ" data-index="${i}">${typen
      .map(([k, t]) => `<option value="${k}"${k === p.typ ? ' selected' : ''}>${esc(t)}</option>`)
      .join('')}</select></label>
    <div class="row">${input('Lohnart', `${base}.lohnart`, 'text', fall)}${input('Bezeichnung', `${base}.bezeichnung`, 'text', fall)}</div>
    <div class="row">
      ${art === 'pauschal' ? input('Betrag (€)', `${base}.faktor`, 'money', fall) : `${input(`Menge (${esc(p.einheit)})`, `${base}.menge`, 'hund', fall)}${input(art === 'zuschlag' ? 'Stundenlohn (€)' : 'je Einheit (€)', `${base}.faktor`, 'money', fall)}`}
      ${art === 'zuschlag' ? input('Prozent (%)', `${base}.prozent`, 'bp', fall) : ''}
    </div>
    <div class="row">
      ${select('Steuer', `${base}.st`, [['L', 'L – laufend'], ['S', 'S – sonstiger Bezug'], ['F', 'F – steuerfrei']], fall)}
      ${select('Sozialvers.', `${base}.sv`, [['L', 'L – laufend'], ['S', 'S – einmalig'], ['F', 'F – frei']], fall)}
    </div>
  </fieldset>`;
}

function aufgabeForm(fall, r) {
  const a = fall.aufgabe;
  const gesucht = new Set(gesuchteFelder(fall, r));
  const sach = a.sachtext ?? sachtextAuto(fall, gesucht.size > 0);
  const gruppen = verfuegbareFelder(fall, r)
    .map(
      (g) => `<div class="gruppe"><h4>${esc(g.gruppe)}</h4>${g.felder
        .map((f) => `<label class="f f-check"><input type="checkbox" data-action="gesucht" data-id="${esc(f.id)}"${gesucht.has(f.id) ? ' checked' : ''}><span>${esc(f.name)}</span></label>`)
        .join('')}</div>`,
    )
    .join('');
  const teile = teilaufgaben(fall, r)
    .map(
      (t) => `<label class="f"><span>${esc(t.nr)} ${esc(feldName(t.id, fall))}</span><input data-action="teiltext" data-id="${esc(t.id)}" value="${esc(a.texte[t.id] ?? '')}" placeholder="${esc(teilText(fall, r, t.id))}"></label>`,
    )
    .join('');
  return `<details><summary>Arbeitsblatt</summary>
    ${select('Blattart', 'aufgabe.blatt', [['aufgabe', 'Aufgabenblatt mit Zettel'], ['zettel', 'Nur der Zettel']], fall)}
    <div class="row">${input('Überschrift', 'aufgabe.titel', 'text', fall, `placeholder="${esc(fall.titel)}"`)}${select('Rechenzeilen', 'aufgabe.zeilen', [0, 1, 2, 3, 4, 5].map((n) => [n, n]), fall, 'int')}</div>
    ${check('Beiblatt „Abzüge im Überblick“ mitliefern', 'aufgabe.beiblatt', fall)}
    <label class="f"><span>Einleitender Text</span><textarea id="sachtext" data-action="sachtext" rows="4">${esc(sach)}</textarea></label>
    <button type="button" class="btn btn-small" data-action="sach-auto">Text automatisch erzeugen</button>
    <h3 class="zw">Gesuchte Werte</h3>
    <p class="muted">Diese Werte bleiben auf dem Arbeitsblatt leer. Man kann sie auch direkt im Arbeits- oder Lösungsblatt antippen.</p>
    ${gruppen}
    ${teile ? `<h3 class="zw">Texte der Teilaufgaben</h3><p class="muted">Leer lassen für den automatischen Text.</p>${teile}` : ''}
  </details>`;
}

function formHtml(fall, r) {
  const monate = MONATE.map((m, i) => [i + 1, m]);
  const jahre = YEARS.map((y) => [y, y]);
  return `
  <details open><summary>Zettel</summary>
    ${input('Titel (nur in der Übersicht)', 'titel', 'text', fall)}
    <div class="row">${select('Art', 'art', [['gehalt', 'Gehalt'], ['lohn', 'Lohn']], fall)}${select('Monat', 'monat', monate, fall, 'int')}${select('Jahr', 'jahr', jahre, fall, 'int')}</div>
  </details>
  <details open><summary>Firma und Person</summary>
    ${input('Firma', 'firma.name', 'text', fall)}
    <div class="row">${input('Straße', 'firma.strasse', 'text', fall)}${input('Ort', 'firma.ort', 'text', fall)}</div>
    ${input('Name', 'person.name', 'text', fall)}
    <div class="row">${input('Straße', 'person.strasse', 'text', fall)}${input('Ort', 'person.ort', 'text', fall)}</div>
    <div class="row">${input('Personal-Nr.', 'person.personalnr', 'text', fall)}${input('Geburtsjahr', 'person.geburtsjahr', 'int', fall)}</div>
    <div class="row">${select('Steuerklasse', 'person.steuerklasse', [1, 2, 3, 4, 5, 6].map((k) => [k, k]), fall, 'int')}${input('Kinder', 'person.kinder', 'int', fall)}</div>
    <div class="row">${select('Konfession', 'person.konfession', Object.entries(KONFESSIONEN), fall)}${select('Kirchensteuer', 'person.kirchensteuersatz', [[9, '9 %'], [8, '8 % (BY, BW)']], fall, 'int')}</div>
    <div class="row">${input('Krankenkasse', 'person.krankenkasse', 'text', fall)}${input('Zusatzbeitrag (%)', 'person.zusatzbeitrag', 'bp', fall)}</div>
    ${check('Minijob (keine Abzüge für den Arbeitnehmer)', 'person.minijob', fall)}
  </details>
  <details open><summary>Bezüge und Abzüge</summary>
    <div id="posten-liste">${fall.posten.map((p, i) => postenForm(fall, p, i)).join('') || '<p class="muted">Noch keine Posten.</p>'}</div>
    <div class="row add-row">
      <select id="posten-neu" aria-label="Neuer Posten">${Object.entries(POSTEN_TYPEN).map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('')}</select>
      <button type="button" class="btn" data-action="add-posten">Posten hinzufügen</button>
    </div>
  </details>
  <details open><summary>Lohnsteuer</summary>
    ${select('So wird die Lohnsteuer bestimmt', 'steuer.modus', Object.entries(STEUERMODI), fall)}
    ${fall.steuer.modus === 'prozent' ? input('Lohnsteuer (% vom Steuer-Brutto)', 'steuer.prozent', 'bp', fall) : ''}
    ${check('Solidaritätszuschlag berechnen', 'steuer.soli', fall)}
    <p class="muted">Die Tabelle und die Rechnung nach Tarif sind vereinfacht und weichen von der amtlichen Lohnsteuer um wenige Euro ab.</p>
  </details>
  ${aufgabeForm(fall, r)}
  <details><summary>Aussehen und weitere Blöcke</summary>
    ${select('Optik', 'anzeige.optik', [['modern', 'Klar und modern'], ['original', 'Originalgetreu (Matrixdruck-Stil)']], fall)}
    ${Object.entries(BLOECKE).map(([k, t]) => check(t, `anzeige.bloecke.${k}`, fall)).join('')}
    ${fall.anzeige.bloecke.fehltage ? `<div class="row">${input('Urlaubstage', 'fehltage.urlaub', 'int', fall)}${input('Krankheitstage', 'fehltage.krank', 'int', fall)}</div>${input('Hinweis', 'hinweis', 'text', fall)}` : ''}
    ${fall.anzeige.bloecke.bank ? input('Bank', 'bank.name', 'text', fall) + input('IBAN', 'bank.iban', 'text', fall) : ''}
  </details>`;
}

export function createEditor(app) {
  const root = $('#view-editor');
  const formHost = $('#editor-form');
  const slipHost = $('#slip-host');
  const dlg = $('#dlg-feld');
  let fall = null;
  let saveTimer = null;
  let saving = Promise.resolve();
  let feldId = null;

  const pagesHost = $('#pages-host');
  let pane = 'zettel';

  const result = () => berechne(fall);

  /** Zeichnet die aktuelle Ansicht: der Zettel allein oder die Seiten des Arbeits-/Lösungsblatts. */
  function renderSlipNow() {
    const r = result();
    if (pane === 'zettel') {
      slipHost.innerHTML = renderSlip(fall, r, { interactive: true });
    } else {
      pagesHost.innerHTML = renderBlatt(fall, r, { modus: pane, interactive: true });
      fitPages(pagesHost);
      const ueber = pagesHost.querySelectorAll('.page.is-overflow').length;
      $('#pane-hint').textContent = `${PANE_HINWEIS[pane]}${ueber ? ' Achtung: Rot umrandete Seiten sind zu voll – weniger Teilaufgaben oder weniger Zeilen wählen.' : ''}`;
    }
    fitSlip();
  }

  function fitSlip() {
    const avail = $('#editor-preview').clientWidth - 24;
    const scale = Math.min(1, Math.max(0.3, avail / SLIP_WIDTH));
    slipHost.style.zoom = String(scale);
    pagesHost.style.zoom = String(scale);
  }

  function setPane(next) {
    pane = next;
    root.dataset.pane = pane;
    document.querySelectorAll('.pane-bar [data-pane]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === pane)));
    $('#pane-hint').textContent = PANE_HINWEIS[pane];
    if (fall) renderSlipNow();
  }
  root.dataset.pane = pane;
  document.querySelectorAll('.pane-bar [data-pane]').forEach((b) => b.addEventListener('click', () => setPane(b.dataset.pane)));

  function renderForm() {
    const open = new Map([...formHost.querySelectorAll('details')].map((d) => [d.querySelector('summary').textContent, d.open]));
    formHost.innerHTML = formHtml(fall, result());
    formHost.querySelectorAll('details').forEach((d) => {
      const key = d.querySelector('summary').textContent;
      if (open.has(key)) d.open = open.get(key);
    });
  }

  function persist() {
    pruneOverrides(fall);
    fall.updatedAt = Date.now();
    const snapshot = structuredClone(fall);
    saving = saving.then(() => app.store.saveFall(snapshot)).then(() => app.onFallSaved(snapshot)).catch((err) => {
      console.error(err);
      toast('Speichern ist fehlgeschlagen.');
    });
    return saving;
  }
  async function flush() {
    if (fall && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await persist();
    }
    await saving;
  }
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };
  const changed = ({ form = false } = {}) => {
    if (form) renderForm();
    renderSlipNow();
    scheduleSave();
  };

  // --- Formular -----------------------------------------------------------------------------------
  function readValue(el) {
    const kind = el.dataset.kind;
    if (kind === 'bool') return el.checked;
    if (kind === 'text') return el.value;
    if (kind === 'int') return Number.isFinite(Number(el.value)) && el.value.trim() !== '' ? Math.round(Number(el.value)) : null;
    return parseScaled(el.value, 100);
  }

  formHost.addEventListener('input', (e) => {
    const text = e.target.closest('[data-action="sachtext"],[data-action="teiltext"]');
    if (text) {
      if (text.dataset.action === 'sachtext') fall.aufgabe.sachtext = text.value.trim() ? text.value : null;
      else if (text.value.trim()) fall.aufgabe.texte[text.dataset.id] = text.value;
      else delete fall.aufgabe.texte[text.dataset.id];
      changed();
      return;
    }
    const el = e.target.closest('[data-bind]');
    if (!el || el.tagName === 'SELECT') return;
    const value = readValue(el);
    if (value === null) return;
    setAt(fall, el.dataset.bind, value);
    changed();
  });

  formHost.addEventListener('change', (e) => {
    const el = e.target.closest('[data-bind],[data-action="typ"],[data-action="gesucht"]');
    if (!el) return;
    if (el.dataset.action === 'gesucht') {
      toggleGesucht(el.dataset.id, el.checked);
      return;
    }
    if (el.dataset.action === 'typ') {
      const i = Number(el.dataset.index);
      const alt = fall.posten[i];
      fall.posten[i] = newPosten(el.value, { id: alt.id });
      delete fall.ueberschreibungen[`p:${alt.id}`];
      changed({ form: true });
      return;
    }
    const value = readValue(el);
    if (value === null) return;
    setAt(fall, el.dataset.bind, value);
    if (el.dataset.bind === 'person.minijob' || el.dataset.bind.startsWith('anzeige.') || el.dataset.bind === 'steuer.modus') {
      normalizeInPlace();
      changed({ form: true });
      return;
    }
    // Eingabe schön formatieren (z. B. "12.5" -> "12,50")
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && FORMAT[el.dataset.kind]) el.value = FORMAT[el.dataset.kind](getAt(fall, el.dataset.bind));
    changed();
  });

  /** Feld als gesucht (leer auf dem Arbeitsblatt) markieren oder wieder angeben; `an` = true/false, sonst umschalten. */
  function toggleGesucht(id, an) {
    const liste = fall.aufgabe.gesucht;
    const drin = liste.includes(id);
    const soll = an ?? !drin;
    if (soll && !drin) liste.push(id);
    else if (!soll && drin) fall.aufgabe.gesucht = liste.filter((x) => x !== id);
    changed({ form: true });
  }

  function normalizeInPlace() {
    const clean = normalizeFall(fall);
    for (const key of Object.keys(fall)) delete fall[key];
    Object.assign(fall, clean);
  }

  formHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'SELECT') return;
    if (btn.dataset.action === 'sach-auto') {
      fall.aufgabe.sachtext = null;
      changed({ form: true });
    } else if (btn.dataset.action === 'add-posten') {
      const typ = $('#posten-neu').value;
      fall.posten.push(newPosten(typ));
      changed({ form: true });
    } else if (btn.dataset.action === 'del-posten') {
      const [gone] = fall.posten.splice(Number(btn.dataset.index), 1);
      delete fall.ueberschreibungen[`p:${gone.id}`];
      changed({ form: true });
      toast(`„${gone.bezeichnung}“ entfernt.`, {
        action: 'Rückgängig',
        onAction: () => {
          fall.posten.splice(Number(btn.dataset.index), 0, gone);
          changed({ form: true });
        },
      });
    }
  });

  // --- Felder überschreiben --------------------------------------------------------------------------
  function openFeld(id) {
    const r = result();
    const w = r.weg[id];
    if (!w) return;
    feldId = id;
    $('#feld-name').textContent = feldName(id, fall);
    $('#feld-auto').textContent = `${fmtCents(w.berechnet)} €`;
    $('#feld-weg').textContent = w.text;
    $('#feld-wert').value = fmtCents(fall.ueberschreibungen[id] ?? w.berechnet);
    $('#feld-zurueck').hidden = !w.ueberschrieben;
    $('#feld-fehler').hidden = true;
    dlg.showModal();
    $('#feld-wert').select();
  }

  slipHost.addEventListener('click', (e) => {
    const el = e.target.closest('[data-feld]');
    if (el) openFeld(el.dataset.feld);
  });
  slipHost.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-feld]');
    if (el) {
      e.preventDefault();
      openFeld(el.dataset.feld);
    }
  });

  // Im Arbeits- und Lösungsblatt schaltet ein Tipp auf einen Wert „gesucht“ um
  pagesHost.addEventListener('click', (e) => {
    const el = e.target.closest('[data-feld]');
    if (el) toggleGesucht(el.dataset.feld);
  });
  pagesHost.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-feld]');
    if (el) {
      e.preventDefault();
      toggleGesucht(el.dataset.feld);
    }
  });

  // --- PDF -------------------------------------------------------------------------------------------
  const pdfDlg = $('#dlg-pdf');
  let pdf = null; // { blob, file, name }
  const pdfStatus = (text, fehler = false) => {
    const el = $('#pdf-status');
    el.textContent = text;
    el.hidden = !text;
    el.className = fehler ? 'meldung meldung-fehler' : 'meldung';
  };
  const pdfButtons = (an) => {
    $('#pdf-share').hidden = !an || !canSharePdf(pdf.file);
    $('#pdf-download').hidden = !an;
    $('#pdf-open').hidden = !an;
  };
  $('#ed-pdf').addEventListener('click', async () => {
    await flush();
    pdf = null;
    pdfStatus('');
    pdfButtons(false);
    $('#pdf-go').disabled = false;
    pdfDlg.showModal();
  });
  $('#pdf-go').addEventListener('click', async () => {
    const was = pdfDlg.querySelector('input[name="pdf-was"]:checked').value;
    const modi = was === 'beide' ? ['arbeit', 'loesung'] : [was];
    const teil = { beide: '', arbeit: ' – Arbeitsblatt', loesung: ' – Lösungsblatt' }[was];
    $('#pdf-go').disabled = true;
    pdfButtons(false);
    pdfStatus('PDF wird erstellt …');
    try {
      const out = await createPdf(fall, modi, { onProgress: (i, n) => pdfStatus(`PDF wird erstellt … Seite ${i} von ${n}`) });
      const name = `${safeFilename(fall.titel)}${teil}.pdf`;
      pdf = { blob: out.blob, file: pdfFile(out.blob, name), name };
      pdfStatus(`Fertig: ${out.seiten} ${out.seiten === 1 ? 'Seite' : 'Seiten'}.${out.ueberlaufen ? ` Achtung: ${out.ueberlaufen} Seite(n) sind sehr voll, der Zettel wurde stark verkleinert.` : ''}`);
      pdfButtons(true);
    } catch (err) {
      console.error(err);
      pdfStatus(err.message, true);
    } finally {
      $('#pdf-go').disabled = false;
    }
  });
  $('#pdf-share').addEventListener('click', async () => {
    if (!pdf) return;
    try {
      if ((await sharePdf(pdf.file)) === 'geteilt') pdfStatus('Geteilt.');
    } catch (err) {
      pdfStatus(`Teilen ist fehlgeschlagen: ${err.message}`, true);
    }
  });
  $('#pdf-download').addEventListener('click', () => pdf && downloadPdf(pdf.blob, pdf.name));
  $('#pdf-open').addEventListener('click', () => pdf && openPdf(pdf.blob));

  $('#feld-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const cents = parseScaled($('#feld-wert').value, 100);
    if (cents === null) {
      $('#feld-fehler').hidden = false;
      return;
    }
    fall.ueberschreibungen[feldId] = cents;
    dlg.close();
    changed();
  });
  $('#feld-zurueck').addEventListener('click', () => {
    delete fall.ueberschreibungen[feldId];
    dlg.close();
    changed();
  });

  // --- Kopfzeile ------------------------------------------------------------------------------------
  $('#ed-back').addEventListener('click', () => app.go('#/'));
  $('#ed-dup').addEventListener('click', () => app.duplicateFall(fall));
  $('#ed-print').addEventListener('click', () => window.print());
  $('#ed-titel').addEventListener('input', (e) => {
    fall.titel = e.target.value;
    scheduleSave();
  });
  $('#ed-reset').addEventListener('click', () => {
    if (!Object.keys(fall.ueberschreibungen).length) return toast('Es sind keine Felder von Hand geändert.');
    const alt = fall.ueberschreibungen;
    fall.ueberschreibungen = {};
    changed();
    toast('Alle von Hand geänderten Felder sind wieder automatisch.', {
      action: 'Rückgängig',
      onAction: () => {
        fall.ueberschreibungen = alt;
        changed();
      },
    });
  });
  window.addEventListener('resize', () => fall && fitSlip());

  return {
    async open(id) {
      await flush();
      const loaded = await app.store.getFall(id);
      if (!loaded) return false;
      fall = loaded;
      document.body.dataset.view = 'editor';
      $('#ed-titel').value = fall.titel;
      renderForm();
      setPane('zettel');
      return true;
    },
    async close() {
      await flush();
      fall = null;
    },
    flush,
    setPane,
    discard(id) {
      if (fall?.id === id) {
        clearTimeout(saveTimer);
        saveTimer = null;
        fall = null;
      }
    },
    getFall: () => fall,
    root,
  };
}
