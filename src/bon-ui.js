// Kassenzettel: Dialog „Zufallsbon“ und Editor (Form links, Seite in der Mitte, Inhalt rechts).
import { BASEN, VARIANTEN, newBon, newZeile, normalizeBon } from './bon.js';
import { bonFelder, bonGesucht, bonSachtext, bonTeile, rechneBon } from './calc/bon.js';
import { fmtCents } from './calc/money.js';
import { FORMAT, check, getAt, input, readValue, select, setAt, zelle } from './editor.js';
import { BON_AUFGABEN, BON_STUFEN, LADEN_ARTEN, defaultBonSpec, erzeugeBon, erzeugeBonGruppen } from './generators/bons.js';
import { randomSeed } from './generators/rng.js';
import { renderBonSeiten } from './bonsheet.js';
import { esc } from './slip.js';
import { $, toast } from './ui.js';
import { fitPages, ganzeSeiteZoom } from './worksheet.js';

const SATZ_OPTIONEN = [['A', 'A – 19 %'], ['B', 'B – 7 %']];

// --- Dialog ----------------------------------------------------------------------------------------------
export function createBonDialog(app) {
  const dlg = $('#dlg-bon');
  const host = $('#bon-felder');
  let spec = defaultBonSpec('mittel');
  let gruppen = 1;
  const options = (liste, wert) => Object.entries(liste).map(([k, t]) => `<option value="${esc(k)}"${k === wert ? ' selected' : ''}>${esc(t)}</option>`).join('');

  function render() {
    host.innerHTML = `
      <fieldset class="optionen"><legend>Stufe</legend>
        ${Object.entries(BON_STUFEN).map(([k, t]) => `<label><input type="radio" name="bstufe" data-k="stufe" value="${k}"${spec.stufe === k ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
      </fieldset>
      <div class="row">
        <label class="f"><span>Laden</span><select data-k="laden">${options(LADEN_ARTEN, spec.laden)}</select></label>
        <label class="f"><span>Aufgabe</span><select data-k="aufgabe">${options(BON_AUFGABEN, spec.aufgabe)}</select></label>
      </div>
      <div class="row">
        <label class="f"><span>Variante</span><select data-k="variante">${options(VARIANTEN, spec.variante)}</select></label>
        <label class="f"><span>Rechenweg</span><select data-k="basis">${options(BASEN, spec.basis)}</select></label>
      </div>
      <div class="row">
        <label class="f"><span>Startwert</span><input data-k="seed" inputmode="numeric" value="${spec.seed}"></label>
        <label class="f"><span>Gruppen (A, B, …)</span><select data-k="gruppen">${[1, 2, 3, 4].map((n) => `<option value="${n}"${n === gruppen ? ' selected' : ''}>${n === 1 ? '1 (keine Gruppen)' : `${n} Gruppen`}</option>`).join('')}</select></label>
        <button type="button" class="btn" id="bon-wuerfeln" title="Neuen Startwert würfeln">Würfeln</button>
      </div>`;
    preview();
  }
  function preview() {
    const b = erzeugeBon(spec);
    const r = rechneBon(b);
    $('#bon-vorschau').textContent = `Vorschau: ${b.laden} – ${b.zeilen.length} Zeilen, Summe ${fmtCents(r.summe)} €, ${b.aufgabe.gesucht.length} gesuchte Werte.`;
  }
  host.addEventListener('change', (e) => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const k = el.dataset.k;
    if (k === 'stufe') {
      spec = { ...defaultBonSpec(el.value, spec.seed), laden: spec.laden, aufgabe: spec.aufgabe };
      render();
    } else if (k === 'gruppen') {
      gruppen = Number(el.value);
    } else if (k === 'seed') {
      const n = Math.floor(Number(el.value));
      spec.seed = Number.isFinite(n) && n >= 0 ? n % 4294967296 : spec.seed;
      el.value = spec.seed;
      preview();
    } else {
      spec[k] = el.value;
      preview();
    }
  });
  host.addEventListener('click', (e) => {
    if (e.target.closest('#bon-wuerfeln')) {
      spec.seed = randomSeed();
      render();
    }
  });
  $('#bon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    dlg.close();
    await app.createBons(erzeugeBonGruppen(spec, gruppen));
  });
  $('#bon-leer').addEventListener('click', async () => {
    dlg.close();
    await app.createBons([newBon()]);
  });
  return {
    open() {
      spec = { ...spec, seed: randomSeed() };
      render();
      dlg.showModal();
    },
  };
}

// --- Formular ----------------------------------------------------------------------------------------------
function darstellungForm(bon) {
  return `<h2 class="links-titel">Darstellung</h2>
    ${select('Variante', 'variante', Object.entries(VARIANTEN), bon)}
    <p class="muted">Einfach: nur Laden, Artikel, Summe und MwSt. Standard: auch Anschrift, Datum, Rabatt, Pfand und Rückgeld.</p>
    ${select('Rechenweg', 'basis', Object.entries(BASEN), bon)}
    <p class="muted">Netto gegeben: Preise ohne MwSt. Brutto gegeben: Preise mit MwSt., wie auf echten Bons.</p>
    <h2 class="links-titel">Arbeitsblatt</h2>
    ${select('Blattart', 'aufgabe.blatt', [['aufgabe', 'Aufgabenblatt mit Bon'], ['zettel', 'Nur der Bon']], bon)}
    ${select('Rechenzeilen', 'aufgabe.zeilen', [0, 1, 2, 3, 4, 5].map((n) => [n, n]), bon, 'int')}
    ${check('Beiblatt mitliefern', 'aufgabe.beiblatt', bon)}`;
}

function zeileHtml(bon, r, z, i) {
  const base = `zeilen.${i}`;
  const name = esc(z.name || 'Zeile');
  const einfach = bon.variante === 'einfach';
  const opt = (liste, wert) => liste.map(([k, t]) => `<option value="${k}"${k === wert ? ' selected' : ''}>${t}</option>`).join('');
  return `<tr>
    ${zelle(`Bezeichnung von ${name}`, `${base}.name`, 'text', bon)}
    ${einfach ? '' : `<td><select aria-label="Art von ${name}" data-bind="${base}.art" data-kind="text">${opt([['artikel', 'Artikel'], ['pfand', 'Pfand']], z.art)}</select></td>`}
    ${zelle(`Menge von ${name}`, `${base}.menge`, 'int', bon)}
    ${zelle(`Einzelpreis von ${name}`, `${base}.preis`, 'money', bon)}
    <td><select aria-label="Steuersatz von ${name}" data-bind="${base}.satz" data-kind="text">${opt(SATZ_OPTIONEN, z.satz)}</select></td>
    <td class="p-betrag"><output data-betrag="z:${esc(z.id)}">${fmtCents(r.werte[`z:${z.id}`] ?? 0)}</output></td>
    <td class="p-tasten"><button type="button" class="btn-x" data-action="del-zeile" data-index="${i}" aria-label="${name} entfernen">✕</button></td>
  </tr>`;
}

function schrittBon(bon, r) {
  const einfach = bon.variante === 'einfach';
  return `<div class="raster">
    <section class="karte"><h3>Laden</h3>
      ${input('Name', 'laden', 'text', bon)}
      ${einfach ? '' : `<div class="row">${input('Straße', 'strasse', 'text', bon)}${input('Ort', 'ort', 'text', bon)}</div>`}
    </section>
    ${
      einfach
        ? ''
        : `<section class="karte"><h3>Beleg</h3>
      <div class="row">${input('Datum', 'datum', 'text', bon)}${input('Uhrzeit', 'uhrzeit', 'text', bon)}${input('Bon-Nr.', 'bonNr', 'text', bon)}</div>
    </section>
    <section class="karte"><h3>Bezahlen</h3>
      <div class="row">${input('Rabatt (%)', 'rabatt', 'bp', bon)}${input('Gegeben (€)', 'gegeben', 'money', bon)}</div>
    </section>`
    }
    <section class="karte karte-voll"><h3>Artikel</h3>
      <table class="posten-tab bon-tab"><thead><tr><th>Bezeichnung</th>${einfach ? '' : '<th>Art</th>'}<th>Menge</th><th>Einzelpreis (€)</th><th>Satz</th><th class="r">Summe (€)</th><th></th></tr></thead>
        <tbody>${bon.zeilen.map((z, i) => zeileHtml(bon, r, z, i)).join('') || `<tr><td colspan="7" class="muted">Noch keine Artikel.</td></tr>`}</tbody></table>
      <div class="row add-row"><button type="button" class="btn btn-small" data-action="add-zeile">Artikel hinzufügen</button></div>
    </section>
  </div>`;
}

function schrittAufgabe(bon, r) {
  const gesucht = new Set(bonGesucht(bon, r).map((f) => f.id));
  const gruppen = bonFelder(bon, r)
    .map((g) => `<div class="gruppe"><h4>${esc(g.gruppe)}</h4>${g.felder.map((f) => `<label class="f f-check"><input type="checkbox" data-action="gesucht" data-id="${esc(f.id)}"${gesucht.has(f.id) ? ' checked' : ''}><span>${esc(f.name)}</span></label>`).join('')}</div>`)
    .join('');
  const teile = bonTeile(bon, r)
    .map((t) => `<label class="f"><span>${esc(t.nr)} ${esc(t.name)}</span><input data-action="teiltext" data-id="${esc(t.id)}" value="${esc(bon.aufgabe.texte[t.id] ?? '')}" placeholder="${esc(t.auto)}"></label>`)
    .join('');
  return `<div class="raster">
    <section class="karte"><h3>Aufgabe</h3>
      ${input('Überschrift', 'aufgabe.titel', 'text', bon, `placeholder="${esc(bon.titel)}"`)}
      <label class="f"><span>Einleitender Text (leer = automatisch)</span><textarea data-action="sachtext" rows="4" placeholder="${esc(bonSachtext(bon))}">${esc(bon.aufgabe.sachtext ?? '')}</textarea></label>
    </section>
    <section class="karte karte-breit"><h3>Gesuchte Werte</h3>
      <p class="muted">Diese Werte bleiben auf dem Arbeitsblatt leer. Du kannst sie auch direkt im Blatt antippen.</p>
      <div class="gesucht">${gruppen}</div>
    </section>
    ${teile ? `<section class="karte karte-voll"><h3>Texte der Teilaufgaben</h3><p class="muted">Leer lassen für den automatischen Text.</p><div class="teil-texte">${teile}</div></section>` : ''}
  </div>`;
}

const SCHRITTE = { bon: { html: schrittBon, ansichten: ['zettel', 'arbeit', 'loesung'] }, aufgabe: { html: schrittAufgabe, ansichten: ['arbeit', 'loesung'] } };
const HINWEIS = { zettel: 'So sieht der Bon aus.', arbeit: 'Wert antippen: gesucht (bleibt leer) oder angegeben.', loesung: 'Grün sind die gesuchten Werte. Antippen schaltet um.' };

// --- Editor ----------------------------------------------------------------------------------------------
export function createBonEditor(app) {
  const root = $('#view-bon');
  const links = $('#bon-links');
  const form = $('#bon-eingaben');
  const pages = $('#bon-pages');
  const tabs = [...root.querySelectorAll('[data-bpane]')];
  const stepTabs = [...root.querySelectorAll('[data-bschritt]')];
  let bon = null;
  let pane = 'zettel';
  let schritt = 'bon';
  let saveTimer = null;
  let saving = Promise.resolve();

  const result = () => rechneBon(bon);
  function renderPages() {
    pages.innerHTML = renderBonSeiten(bon, { modus: pane, interactive: pane !== 'zettel' });
    fitPages(pages);
    const voll = pages.querySelectorAll('.page.is-overflow').length;
    $('#bon-hint').textContent = `${HINWEIS[pane]}${voll ? ' Rot umrandete Seiten sind zu voll.' : ''}`;
    fit();
  }
  const fit = () => {
    pages.style.zoom = String(ganzeSeiteZoom($('#bon-preview'), pages));
  };
  window.addEventListener('resize', () => bon && fit());

  function renderForm() {
    const r = result();
    links.innerHTML = darstellungForm(bon);
    form.innerHTML = SCHRITTE[schritt].html(bon, r);
  }
  function setPane(next) {
    pane = next;
    for (const b of tabs) {
      const aktiv = b.dataset.bpane === pane;
      b.setAttribute('aria-selected', String(aktiv));
      b.tabIndex = aktiv ? 0 : -1;
    }
    pages.setAttribute('aria-labelledby', `btab-${pane}`);
    if (bon) renderPages();
  }
  function setSchritt(next) {
    schritt = next;
    for (const b of stepTabs) {
      const aktiv = b.dataset.bschritt === schritt;
      b.setAttribute('aria-selected', String(aktiv));
      b.tabIndex = aktiv ? 0 : -1;
    }
    if (bon) renderForm();
    const ansichten = SCHRITTE[schritt].ansichten;
    if (!ansichten.includes(pane)) setPane(ansichten[0]);
  }
  const tastatur = (liste, wert, setzen) =>
    liste.forEach((b) => {
      b.addEventListener('click', () => setzen(wert(b)));
      b.addEventListener('keydown', (e) => {
        const i = liste.indexOf(b);
        const ziel = { ArrowRight: liste[(i + 1) % liste.length], ArrowLeft: liste[(i - 1 + liste.length) % liste.length], Home: liste[0], End: liste.at(-1) }[e.key];
        if (!ziel) return;
        e.preventDefault();
        setzen(wert(ziel));
        ziel.focus();
      });
    });
  tastatur(tabs, (b) => b.dataset.bpane, setPane);
  tastatur(stepTabs, (b) => b.dataset.bschritt, setSchritt);

  // --- Speichern --------------------------------------------------------------------------------------
  function persist() {
    bon.updatedAt = Date.now();
    const snapshot = structuredClone(bon);
    saving = saving.then(() => app.store.saveBon(snapshot)).then(() => app.onBonSaved(snapshot)).catch((err) => {
      console.error(err);
      toast('Speichern ist fehlgeschlagen.');
    });
    return saving;
  }
  async function flush() {
    if (bon && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await persist();
    }
    await saving;
  }
  const geaendert = ({ formNeu = false } = {}) => {
    if (formNeu) renderForm();
    else {
      const { werte } = result();
      for (const el of form.querySelectorAll('[data-betrag]')) el.textContent = fmtCents(werte[el.dataset.betrag] ?? 0);
    }
    renderPages();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };
  function ersetzen(neu) {
    for (const k of Object.keys(bon)) delete bon[k];
    Object.assign(bon, neu);
    $('#bon-titel').value = bon.titel;
    $('#bon-wuerfeln-neu').hidden = !bon.zufall;
    geaendert({ formNeu: true });
  }

  // --- Eingaben -----------------------------------------------------------------------------------------
  const aufFormular = (art, fn) => [form, links].forEach((h) => h.addEventListener(art, fn));
  aufFormular('input', (e) => {
    const text = e.target.closest('[data-action="sachtext"],[data-action="teiltext"]');
    if (text) {
      if (text.dataset.action === 'sachtext') bon.aufgabe.sachtext = text.value.trim() ? text.value : null;
      else if (text.value.trim()) bon.aufgabe.texte[text.dataset.id] = text.value;
      else delete bon.aufgabe.texte[text.dataset.id];
      geaendert();
      return;
    }
    const el = e.target.closest('[data-bind]');
    if (!el || el.tagName === 'SELECT') return;
    const wert = readValue(el);
    if (wert === null) return;
    setAt(bon, el.dataset.bind, wert);
    geaendert();
  });
  aufFormular('change', (e) => {
    const g = e.target.closest('[data-action="gesucht"]');
    if (g) return umschalten(g.dataset.id, g.checked);
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    const wert = readValue(el);
    if (wert === null) return;
    setAt(bon, el.dataset.bind, wert);
    if (el.tagName === 'SELECT' || el.type === 'checkbox') return geaendert({ formNeu: true });
    if (FORMAT[el.dataset.kind]) el.value = FORMAT[el.dataset.kind](getAt(bon, el.dataset.bind));
    geaendert();
  });
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add-zeile') {
      bon.zeilen.push(newZeile());
      geaendert({ formNeu: true });
    } else if (btn.dataset.action === 'del-zeile') {
      const i = Number(btn.dataset.index);
      const [weg] = bon.zeilen.splice(i, 1);
      geaendert({ formNeu: true });
      toast(`„${weg.name}“ entfernt.`, {
        action: 'Rückgängig',
        onAction: () => {
          bon.zeilen.splice(i, 0, weg);
          geaendert({ formNeu: true });
        },
      });
    }
  });
  function umschalten(id, an) {
    const liste = bon.aufgabe.gesucht;
    const drin = liste.includes(id);
    const soll = an ?? !drin;
    if (soll && !drin) liste.push(id);
    else if (!soll && drin) bon.aufgabe.gesucht = liste.filter((x) => x !== id);
    geaendert({ formNeu: true });
  }
  pages.addEventListener('click', (e) => {
    const el = e.target.closest('[data-feld]');
    if (el) umschalten(el.dataset.feld);
  });
  pages.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-feld]');
    if (el) {
      e.preventDefault();
      umschalten(el.dataset.feld);
    }
  });

  // --- Kopfzeile ------------------------------------------------------------------------------------
  $('#bon-back').addEventListener('click', () => app.go('#/'));
  $('#bon-dup').addEventListener('click', () => app.duplicateBon(bon));
  $('#bon-pdf').addEventListener('click', async () => {
    await flush();
    app.pdfDialog.open(bon, { jahr: false });
  });
  $('#bon-titel').addEventListener('input', (e) => {
    bon.titel = e.target.value;
    geaendert();
  });
  $('#bon-wuerfeln-neu').addEventListener('click', () => {
    if (!bon?.zufall) return;
    const alt = structuredClone(bon);
    const neu = erzeugeBon({ ...bon.zufall, seed: randomSeed(), strukturSeed: null, gruppe: 0 });
    ersetzen(normalizeBon({ ...neu, id: alt.id, createdAt: alt.createdAt, aufgabe: { ...neu.aufgabe, blatt: alt.aufgabe.blatt, beiblatt: alt.aufgabe.beiblatt, zeilen: alt.aufgabe.zeilen } }));
    toast('Neuer Bon mit den gleichen Einstellungen.', { action: 'Rückgängig', onAction: () => ersetzen(alt) });
  });

  return {
    async open(id) {
      await flush();
      const geladen = await app.store.getBon(id);
      if (!geladen) return false;
      bon = geladen;
      document.body.dataset.view = 'bon';
      $('#bon-titel').value = bon.titel;
      $('#bon-wuerfeln-neu').hidden = !bon.zufall;
      pane = 'zettel';
      setSchritt('bon');
      setPane('zettel');
      return true;
    },
    async close() {
      await flush();
      bon = null;
    },
    flush,
    discard(id) {
      if (bon?.id === id) {
        clearTimeout(saveTimer);
        saveTimer = null;
        bon = null;
      }
    },
    getBon: () => bon,
  };
}
