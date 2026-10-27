// Oberfläche für Mischblätter: Dialog „Mischblatt erzeugen“ und der Editor mit Aufgabenliste und Seitenvorschau.
import { fmtCents } from './calc/money.js';
import { berechne } from './calc/payroll.js';
import { defaultSpec, randomSeed } from './generators/faelle.js';
import {
  ALLE_TYPEN,
  MAX_AUFGABEN,
  MISCH_TYPEN,
  defaultMischSpec,
  erzeugeMischGruppen,
  erzeugeMischblatt,
  ersetzeAufgabe,
  fuegeAufgabeHinzu,
  normalizeMisch,
  setzeFallEin,
} from './misch.js';
import { INTRO_AUTO, paginiere, renderMisch } from './mischsheet.js';
import { MONATE } from './model.js';
import { esc } from './slip.js';
import { $, toast } from './ui.js';
import { PAGE_W, fitPages, sachtextAuto, teilaufgaben } from './worksheet.js';
import { rueckPlan } from './rueck.js';

const typOptionen = (wert) => ALLE_TYPEN.map((t) => `<option value="${t}"${t === wert ? ' selected' : ''}>${esc(MISCH_TYPEN[t].label)}</option>`).join('');

const STUFEN_TEXT = {
  leicht: 'Leicht – runde Zahlen, feste Prozentsätze',
  mittel: 'Mittel – echte Sätze, Lohnsteuertabelle',
  schwer: 'Schwer – Zuschläge, alle Steuerklassen',
};

// --- Dialog: Mischblatt erzeugen -------------------------------------------------------------------------
export function createMischDialog(app) {
  const dlg = $('#dlg-misch');
  const host = $('#misch-felder');
  let spec = defaultMischSpec('mittel');
  let gruppen = 1;

  const opt = (liste, wert) => Object.entries(liste).map(([k, t]) => `<option value="${esc(k)}"${k === wert ? ' selected' : ''}>${esc(t)}</option>`).join('');

  function render() {
    host.innerHTML = `
      <fieldset class="optionen"><legend>Stufe</legend>
        ${Object.entries(STUFEN_TEXT).map(([k, t]) => `<label><input type="radio" name="mstufe" data-k="stufe" value="${k}"${spec.stufe === k ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
      </fieldset>
      <fieldset class="optionen"><legend>Aufgabenarten (nichts gewählt = zufällig gemischt)</legend>
        ${ALLE_TYPEN.map((t) => `<label><input type="checkbox" data-typ="${t}"${spec.typen.includes(t) ? ' checked' : ''}> ${esc(MISCH_TYPEN[t].label)}</label>`).join('')}
      </fieldset>
      <div class="row">
        <label class="f"><span>Anzahl der Aufgaben</span><select data-k="anzahl">${[2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}"${n === spec.anzahl ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f"><span>Gruppen (A, B, …)</span><select data-k="gruppen">${[1, 2, 3, 4].map((n) => `<option value="${n}"${n === gruppen ? ' selected' : ''}>${n === 1 ? '1 (keine Gruppen)' : `${n} Gruppen`}</option>`).join('')}</select></label>
      </div>
      <div class="row">
        <label class="f"><span>Art</span><select data-k="art">${opt({ gemischt: 'Gehalt und Lohn gemischt', gehalt: 'Gehalt', lohn: 'Lohn' }, spec.art)}</select></label>
        <label class="f"><span>Lohnsteuer</span><select data-k="steuer">${opt({ prozent: 'Fester Prozentsatz', tabelle: 'Lohnsteuertabelle', formel: 'Rechnerisch nach Tarif' }, spec.steuer)}</select></label>
      </div>
      <div class="row">
        <label class="f"><span>Steuerklassen</span><select data-k="klassen">${opt({ I: 'Nur Steuerklasse I', alle: 'Alle Steuerklassen' }, spec.klassen)}</select></label>
      </div>
      <fieldset class="optionen"><legend>Einzeln einstellbar</legend>
        <label><input type="checkbox" data-k="glatt"${spec.glatt ? ' checked' : ''}> Runde Zahlen</label>
        <label><input type="checkbox" data-k="kirche"${spec.kirche ? ' checked' : ''}> Kirchensteuer</label>
        <label><input type="checkbox" data-k="kinder"${spec.kinder ? ' checked' : ''}> Kinder</label>
      </fieldset>
      <div class="row">
        <label class="f"><span>Startwert</span><input data-k="seed" inputmode="numeric" value="${spec.seed}"></label>
        <button type="button" class="btn" id="misch-wuerfeln" title="Neuen Startwert würfeln">Würfeln</button>
      </div>`;
    preview();
  }

  function preview() {
    try {
      const b = erzeugeMischblatt(spec);
      $('#misch-vorschau').textContent = `Vorschau: ${b.aufgaben.map((a) => MISCH_TYPEN[a.typ].label.replace(/^Rückwärts: /, '↩ ')).join(' · ')}`;
    } catch (err) {
      $('#misch-vorschau').textContent = `Vorschau nicht möglich: ${err.message}`;
    }
  }

  host.addEventListener('change', (e) => {
    const typ = e.target.closest('[data-typ]');
    if (typ) {
      spec.typen = ALLE_TYPEN.filter((t) => (t === typ.dataset.typ ? typ.checked : spec.typen.includes(t)));
      preview();
      return;
    }
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const k = el.dataset.k;
    if (k === 'stufe') {
      const d = defaultSpec(el.value);
      spec = { ...spec, stufe: el.value, steuer: d.steuer, glatt: d.glatt, kirche: d.kirche, kinder: d.kinder, klassen: d.klassen };
      render();
    } else if (k === 'gruppen') {
      gruppen = Number(el.value);
      preview();
    } else if (k === 'anzahl') {
      spec.anzahl = Number(el.value);
      preview();
    } else if (k === 'seed') {
      const n = Math.floor(Number(el.value));
      spec.seed = Number.isFinite(n) && n >= 0 ? n % 4294967296 : spec.seed;
      el.value = spec.seed;
      preview();
    } else {
      spec[k] = el.type === 'checkbox' ? el.checked : el.value;
      preview();
    }
  });
  host.addEventListener('click', (e) => {
    if (e.target.closest('#misch-wuerfeln')) {
      spec.seed = randomSeed();
      render();
    }
  });
  $('#misch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    dlg.close();
    await app.createMischblaetter(erzeugeMischGruppen(spec, gruppen));
  });

  return {
    open() {
      spec = { ...spec, seed: randomSeed(), typen: [...spec.typen] };
      render();
      dlg.showModal();
    },
  };
}

// --- Editor ----------------------------------------------------------------------------------------------
export function createMischEditor(app) {
  const root = $('#view-misch');
  const form = $('#mi-form');
  const pages = $('#mi-pages');
  const tabs = [...root.querySelectorAll('[data-mpane]')];
  let blatt = null;
  let pane = 'arbeit';
  let saveTimer = null;
  let saving = Promise.resolve();

  const HINWEIS = {
    arbeit: 'So sieht das Aufgabenblatt für die Klasse aus. Die Aufgaben stellst du links zusammen.',
    loesung: 'Grün hinterlegt sind die gesuchten Werte, darunter steht jeweils der Rechenweg.',
  };

  function renderPages() {
    pages.innerHTML = renderMisch(blatt, { modus: pane });
    paginiere(pages);
    fitPages(pages);
    const voll = pages.querySelectorAll('.page.is-overflow').length;
    $('#mi-hint').textContent = `${HINWEIS[pane]}${voll ? ' Achtung: Rot umrandete Seiten sind zu voll – weniger Aufgaben oder weniger Rechenzeilen wählen.' : ''}`;
    fit();
  }
  function fit() {
    const avail = $('#mi-preview').clientWidth - 24;
    pages.style.zoom = String(Math.min(1, Math.max(0.3, avail / PAGE_W)));
  }
  window.addEventListener('resize', () => blatt && fit());

  function summary(a) {
    const f = a.fall;
    const r = berechne(f);
    return `${f.person.name}, ${f.firma.name} – ${MONATE[f.monat - 1]}, Steuerklasse ${f.person.steuerklasse}, ${fmtCents(r.gesamtBrutto)} € brutto`;
  }

  function renderForm() {
    const offen = new Map([...form.querySelectorAll('details')].map((d) => [d.querySelector('summary').textContent, d.open]));
    const n = blatt.aufgaben.length;
    const karten = blatt.aufgaben
      .map((a, i) => {
        const r = berechne(a.fall);
        const plan = rueckPlan(a.fall, r, { kompakt: true });
        const auto = sachtextAuto(a.fall, teilaufgaben(a.fall, r, plan).length > 0, plan);
        return `<fieldset class="aufgabe-karte" data-index="${i}">
          <legend>Aufgabe ${i + 1}</legend>
          <label class="f"><span>Art (ändern würfelt einen neuen Fall)</span><select data-m="typ" data-index="${i}">${typOptionen(a.typ)}</select></label>
          <p class="muted">${esc(summary(a))}</p>
          ${plan?.fehler ? `<p class="meldung meldung-fehler">${esc(plan.fehler)}</p>` : ''}
          <label class="f"><span>Einleitender Text (leer = automatisch)</span><textarea data-m="sach" data-index="${i}" rows="2" placeholder="${esc(auto)}">${esc(a.fall.aufgabe.sachtext ?? '')}</textarea></label>
          <div class="aufgabe-tasten">
            <button type="button" class="btn btn-small" data-m="hoch" data-index="${i}"${i === 0 ? ' disabled' : ''} aria-label="Aufgabe ${i + 1} nach oben">↑</button>
            <button type="button" class="btn btn-small" data-m="runter" data-index="${i}"${i === n - 1 ? ' disabled' : ''} aria-label="Aufgabe ${i + 1} nach unten">↓</button>
            <button type="button" class="btn btn-small" data-m="neu" data-index="${i}">Neu würfeln</button>
            <button type="button" class="btn btn-small" data-m="einsetzen" data-index="${i}">Zettel einsetzen …</button>
            <button type="button" class="btn btn-small btn-danger" data-m="weg" data-index="${i}" aria-label="Aufgabe ${i + 1} entfernen">Entfernen</button>
          </div>
        </fieldset>`;
      })
      .join('');
    form.innerHTML = `
      <details open><summary>Blatt</summary>
        <label class="f"><span>Titel</span><input data-m="titel" value="${esc(blatt.titel)}"></label>
        <label class="f"><span>Einleitung (leer = automatisch)</span><textarea data-m="intro" rows="2" placeholder="${esc(INTRO_AUTO)}">${esc(blatt.intro)}</textarea></label>
        <div class="row">
          <label class="f"><span>Rechenzeilen je Teilaufgabe</span><select data-m="zeilen">${[0, 1, 2, 3, 4, 5].map((z) => `<option value="${z}"${z === blatt.zeilen ? ' selected' : ''}>${z}</option>`).join('')}</select></label>
        </div>
        <label class="f f-check"><input type="checkbox" data-m="beiblatt"${blatt.beiblatt ? ' checked' : ''}><span>Beiblatt „Abzüge im Überblick“ mitliefern</span></label>
      </details>
      <details open><summary>Aufgaben (${n})</summary>
        ${karten || '<p class="muted">Noch keine Aufgaben.</p>'}
        <div class="row add-row">
          <select id="mi-neu-typ" aria-label="Art der neuen Aufgabe">${typOptionen('netto')}</select>
          <button type="button" class="btn" data-m="add"${n >= MAX_AUFGABEN ? ' disabled' : ''}>Aufgabe hinzufügen</button>
        </div>
        ${n >= MAX_AUFGABEN ? `<p class="muted">Mehr als ${MAX_AUFGABEN} Aufgaben sind nicht möglich.</p>` : ''}
      </details>`;
    form.querySelectorAll('details').forEach((d) => {
      const key = d.querySelector('summary').textContent;
      if (offen.has(key)) d.open = offen.get(key);
    });
  }

  // --- Speichern --------------------------------------------------------------------------------------
  function persist() {
    blatt.updatedAt = Date.now();
    const snapshot = structuredClone(blatt);
    saving = saving.then(() => app.store.saveBlatt(snapshot)).then(() => app.onBlattSaved(snapshot)).catch((err) => {
      console.error(err);
      toast('Speichern ist fehlgeschlagen.');
    });
    return saving;
  }
  async function flush() {
    if (blatt && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await persist();
    }
    await saving;
  }
  const geaendert = ({ formNeu = false } = {}) => {
    if (formNeu) renderForm();
    renderPages();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };
  function ersetzen(neu) {
    for (const k of Object.keys(blatt)) delete blatt[k];
    Object.assign(blatt, neu);
    $('#mi-titel').value = blatt.titel;
    $('#mi-wuerfeln').hidden = !blatt.zufall;
    geaendert({ formNeu: true });
  }
  const mitRueckgaengig = (text, aktion) => {
    const alt = structuredClone(blatt);
    aktion();
    geaendert({ formNeu: true });
    toast(text, { action: 'Rückgängig', onAction: () => ersetzen(alt) });
  };

  // --- Eingaben -----------------------------------------------------------------------------------------
  form.addEventListener('input', (e) => {
    const el = e.target.closest('[data-m]');
    if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
    const m = el.dataset.m;
    if (m === 'titel') {
      blatt.titel = el.value;
      $('#mi-titel').value = el.value;
    } else if (m === 'intro') blatt.intro = el.value;
    else if (m === 'sach') blatt.aufgaben[Number(el.dataset.index)].fall.aufgabe.sachtext = el.value.trim() ? el.value : null;
    else return;
    geaendert();
  });
  form.addEventListener('change', (e) => {
    const el = e.target.closest('[data-m]');
    if (!el) return;
    const m = el.dataset.m;
    if (m === 'zeilen') blatt.zeilen = Number(el.value);
    else if (m === 'beiblatt') blatt.beiblatt = el.checked;
    else if (m === 'typ') {
      const i = Number(el.dataset.index);
      mitRueckgaengig(`Aufgabe ${i + 1} ist jetzt: ${MISCH_TYPEN[el.value].label}.`, () => ersetzeAufgabe(blatt, i, el.value));
      return;
    } else return;
    geaendert();
  });
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-m]');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    const m = btn.dataset.m;
    if (m === 'hoch' || m === 'runter') {
      const j = m === 'hoch' ? i - 1 : i + 1;
      [blatt.aufgaben[i], blatt.aufgaben[j]] = [blatt.aufgaben[j], blatt.aufgaben[i]];
      geaendert({ formNeu: true });
    } else if (m === 'neu') {
      mitRueckgaengig(`Aufgabe ${i + 1} neu gewürfelt.`, () => ersetzeAufgabe(blatt, i));
    } else if (m === 'weg') {
      if (blatt.aufgaben.length <= 1) return toast('Ein Mischblatt braucht mindestens eine Aufgabe.');
      mitRueckgaengig(`Aufgabe ${i + 1} entfernt.`, () => blatt.aufgaben.splice(i, 1));
    } else if (m === 'add') {
      mitRueckgaengig('Aufgabe hinzugefügt.', () => fuegeAufgabeHinzu(blatt, $('#mi-neu-typ').value));
    } else if (m === 'einsetzen') {
      zettelWaehlen(i);
    }
  });

  // --- Zettel aus der Bibliothek einsetzen --------------------------------------------------------------
  const pick = $('#dlg-pick');
  let pickIndex = 0;
  function zettelWaehlen(index) {
    pickIndex = index;
    const liste = $('#pick-liste');
    if (!app.faelle.length) {
      liste.innerHTML = '<li class="muted">Es gibt noch keine Zettel in der Übersicht.</li>';
    } else {
      liste.innerHTML = app.faelle
        .map((f) => `<li><button type="button" class="szenario" data-fall="${esc(f.id)}"><b>${esc(f.titel)}</b><span>${esc(f.person.name)} · ${esc(MONATE[f.monat - 1])} ${f.jahr}</span></button></li>`)
        .join('');
    }
    pick.showModal();
  }
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fall]');
    if (!b) return;
    const fall = app.faelle.find((f) => f.id === b.dataset.fall);
    if (!fall) return;
    pick.close();
    mitRueckgaengig('Zettel als Kopie eingesetzt.', () => setzeFallEin(blatt, pickIndex, fall));
  });

  // --- Kopfzeile und Ansichten --------------------------------------------------------------------------
  $('#mi-back').addEventListener('click', () => app.go('#/'));
  $('#mi-dup').addEventListener('click', () => app.duplicateBlatt(blatt));
  $('#mi-print').addEventListener('click', () => window.print());
  $('#mi-pdf').addEventListener('click', async () => {
    await flush();
    app.pdfDialog.open(blatt, { jahr: false });
  });
  $('#mi-titel').addEventListener('input', (e) => {
    blatt.titel = e.target.value;
    const feld = form.querySelector('[data-m="titel"]');
    if (feld) feld.value = e.target.value;
    geaendert();
  });
  $('#mi-wuerfeln').addEventListener('click', () => {
    if (!blatt?.zufall) return;
    const behalten = { id: blatt.id, titel: blatt.titel, intro: blatt.intro, beiblatt: blatt.beiblatt, zeilen: blatt.zeilen, createdAt: blatt.createdAt };
    const alt = structuredClone(blatt);
    const neu = erzeugeMischblatt({ ...blatt.zufall, seed: randomSeed(), strukturSeed: null, gruppe: 0 });
    ersetzen(normalizeMisch({ ...neu, ...behalten }));
    toast('Alle Aufgaben neu gewürfelt.', { action: 'Rückgängig', onAction: () => ersetzen(alt) });
  });

  function setPane(next) {
    pane = next;
    for (const b of tabs) {
      const aktiv = b.dataset.mpane === pane;
      b.setAttribute('aria-selected', String(aktiv));
      b.tabIndex = aktiv ? 0 : -1;
    }
    pages.setAttribute('aria-labelledby', `mtab-${pane}`);
    if (blatt) renderPages();
  }
  tabs.forEach((b) => {
    b.addEventListener('click', () => setPane(b.dataset.mpane));
    b.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(b);
      const ziel = { ArrowRight: tabs[(i + 1) % tabs.length], ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length], Home: tabs[0], End: tabs.at(-1) }[e.key];
      if (!ziel) return;
      e.preventDefault();
      setPane(ziel.dataset.mpane);
      ziel.focus();
    });
  });

  return {
    async open(id) {
      await flush();
      const geladen = await app.store.getBlatt(id);
      if (!geladen) return false;
      blatt = geladen;
      document.body.dataset.view = 'misch';
      $('#mi-titel').value = blatt.titel;
      $('#mi-wuerfeln').hidden = !blatt.zufall;
      renderForm();
      setPane('arbeit');
      return true;
    },
    async close() {
      await flush();
      blatt = null;
    },
    flush,
    discard(id) {
      if (blatt?.id === id) {
        clearTimeout(saveTimer);
        saveTimer = null;
        blatt = null;
      }
    },
    getBlatt: () => blatt,
  };
}
