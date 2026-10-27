// Vorführmodus: der Zettel groß für Beamer oder iPad. Gesuchte Werte sind verdeckt und werden per Tippen aufgedeckt;
// ein Tipp auf einen sichtbaren Wert zeigt den Rechenweg Schritt für Schritt (Zutaten, Rechnung, Ergebnis).
// Mit den Knöpfen oben lässt sich auf einen Abschnitt zoomen; der Erklärmodus blendet Marken und Legende ein.
import { berechne } from './calc/payroll.js';
import { erklaerungen, esc, feldName, fmtWert, renderSlip } from './slip.js';
import { gesuchteFelder } from './worksheet.js';
import { $, toast } from './ui.js';

export function createPresent(app) {
  const root = $('#view-present');
  const stage = $('#pr-stage');
  const host = $('#pr-slip');
  const panel = $('#pr-panel');
  const AUSWAHL = ['alles', 'kopf', 'bezuege', 'steuer', 'unten'];
  let fall = null;
  let r = null;
  let verdeckt = new Set();
  let abschnitt = 'alles';
  let auswahl = null; // gewähltes Feld
  let schritt = 1; // 1 Zutaten, 2 Rechnung, 3 Ergebnis
  let erklaer = false;

  const gesuchtSet = () => new Set(gesuchteFelder(fall, r));
  const alleErgebnisse = () => new Set(Object.keys(r.weg).filter((id) => !r.weg[id].nurAnzeige));

  function startVerdeckt() {
    const modus = $('#pr-modus').value;
    verdeckt = modus === 'gesucht' ? gesuchtSet() : modus === 'alle' ? alleErgebnisse() : new Set();
  }

  function quellenSet() {
    if (!auswahl || schritt < 1) return new Set();
    return new Set(r.weg[auswahl]?.aus ?? []);
  }

  function render() {
    r = berechne(fall);
    host.innerHTML = renderSlip(fall, r, { modus: 'vorfuehren', verdeckt, quellen: quellenSet(), aktiv: auswahl, erklaer, legende: false });
    renderPanel();
    zoom(false);
  }

  // --- Zoom auf Abschnitte -------------------------------------------------------------------------
  function zoom(animiert = true) {
    const slip = host.querySelector('.slip');
    if (!slip) return;
    const el = abschnitt === 'alles' ? slip : slip.querySelector(`[data-abschnitt="${abschnitt}"]`) ?? slip;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const pad = 16;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h, 2.4);
    const links = el === slip ? 0 : el.offsetLeft;
    const oben = el === slip ? 0 : el.offsetTop;
    slip.style.transition = animiert ? 'transform .35s ease' : 'none';
    slip.style.transformOrigin = '0 0';
    slip.style.position = 'absolute';
    slip.style.left = '0';
    slip.style.top = '0';
    slip.style.transform = `translate(${(W - w * s) / 2 - links * s}px, ${abschnitt === 'alles' ? Math.max(pad, (H - h * s) / 2) : (H - h * s) / 2 - oben * s}px) scale(${s})`;
  }
  new ResizeObserver(() => fall && zoom(false)).observe(stage);

  function setAbschnitt(a) {
    abschnitt = AUSWAHL.includes(a) ? a : 'alles';
    root.querySelectorAll('[data-abschnitt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.abschnitt === abschnitt)));
    zoom(true);
  }
  root.querySelectorAll('.pr-gruppe [data-abschnitt]').forEach((b) => b.addEventListener('click', () => setAbschnitt(b.dataset.abschnitt)));

  // --- Rechenweg und Legende ----------------------------------------------------------------------
  function renderPanel() {
    if (auswahl && r.weg[auswahl]) {
      const w = r.weg[auswahl];
      const name = feldName(auswahl, fall);
      const zutaten = (w.aus ?? []).map((id) => `<li><span>${esc(feldName(id, fall))}</span><b>${esc(fmtWert(id, r.werte[id], fall))}</b></li>`).join('');
      const teile = [];
      teile.push(
        `<section><h3>1 · Das brauchst du</h3>${zutaten ? `<ul class="zutaten">${zutaten}</ul>` : '<p>Dieser Wert wird direkt eingetragen.</p>'}</section>`,
      );
      if (schritt >= 2) teile.push(`<section><h3>2 · So rechnest du</h3><p class="formel">${esc(w.text)}</p></section>`);
      if (schritt >= 3) teile.push(`<section><h3>3 · Ergebnis</h3><p class="ergebnis">${esc(fmtWert(auswahl, r.werte[auswahl], fall))}</p></section>`);
      panel.innerHTML = `<header><h2>${esc(name)}</h2><button type="button" class="btn btn-small" data-pr="zu" aria-label="Rechenweg schließen">✕</button></header>
        ${teile.join('')}
        <footer><button type="button" class="btn" data-pr="zurueck"${schritt <= 1 ? ' disabled' : ''}>◀ Zurück</button>
        <button type="button" class="btn btn-primary" data-pr="weiter"${schritt >= 3 ? ' disabled' : ''}>Weiter ▶</button></footer>`;
      panel.hidden = false;
    } else if (erklaer) {
      panel.innerHTML = `<header><h2>So liest du die Abrechnung</h2></header><ol class="legende-liste">${erklaerungen(fall)
        .map((e) => `<li><span class="marke" aria-hidden="true">${e.nr}</span><span><b>${esc(e.titel)}</b><br>${esc(e.text)}</span></li>`)
        .join('')}</ol>`;
      panel.hidden = false;
    } else {
      panel.hidden = true;
      panel.innerHTML = '';
    }
  }

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pr]');
    if (!btn) return;
    if (btn.dataset.pr === 'zu') auswahl = null;
    else if (btn.dataset.pr === 'weiter') schritt = Math.min(3, schritt + 1);
    else if (btn.dataset.pr === 'zurueck') schritt = Math.max(1, schritt - 1);
    render();
  });

  // --- Tippen auf Werte ---------------------------------------------------------------------------
  function tippe(id) {
    if (verdeckt.has(id)) {
      verdeckt.delete(id);
      auswahl = null;
    } else if (auswahl === id) {
      auswahl = null;
    } else {
      auswahl = id;
      schritt = 1;
    }
    render();
  }
  host.addEventListener('click', (e) => {
    const el = e.target.closest('[data-feld]');
    if (el) tippe(el.dataset.feld);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-feld]');
    if (el) {
      e.preventDefault();
      tippe(el.dataset.feld);
    }
  });
  root.addEventListener('keydown', (e) => {
    if (!auswahl || e.target.closest('select,input')) return;
    if (e.key === 'ArrowRight') schritt = Math.min(3, schritt + 1);
    else if (e.key === 'ArrowLeft') schritt = Math.max(1, schritt - 1);
    else if (e.key === 'Escape') auswahl = null;
    else return;
    render();
  });

  // --- Knöpfe oben ----------------------------------------------------------------------------------
  $('#pr-back').addEventListener('click', () => app.go(`#/fall/${encodeURIComponent(fall.id)}`));
  $('#pr-modus').addEventListener('change', () => {
    startVerdeckt();
    auswahl = null;
    render();
  });
  $('#pr-verdecken').addEventListener('click', () => {
    startVerdeckt();
    auswahl = null;
    render();
  });
  $('#pr-aufdecken').addEventListener('click', () => {
    verdeckt = new Set();
    render();
  });
  $('#pr-erklaer').addEventListener('change', (e) => {
    erklaer = e.target.checked;
    render();
  });
  $('#pr-voll').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      toast('Vollbild ist in diesem Browser nicht möglich.');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    $('#pr-voll').textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild';
    if (fall) requestAnimationFrame(() => zoom(false));
  });

  return {
    async open(id) {
      const geladen = await app.store.getFall(id);
      if (!geladen) return false;
      fall = geladen;
      r = berechne(fall);
      erklaer = fall.anzeige.erklaermodus;
      $('#pr-erklaer').checked = erklaer;
      $('#pr-titel').textContent = fall.titel;
      $('#pr-modus').value = gesuchtSet().size ? 'gesucht' : 'nichts';
      auswahl = null;
      abschnitt = 'alles';
      document.body.dataset.view = 'present';
      root.querySelectorAll('.pr-gruppe [data-abschnitt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.abschnitt === 'alles')));
      startVerdeckt();
      render();
      return true;
    },
    async close() {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      fall = null;
    },
    /** Für Tests: aktueller Zustand. */
    state: () => ({ verdeckt: [...verdeckt], auswahl, schritt, abschnitt, erklaer }),
  };
}
