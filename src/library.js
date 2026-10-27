// Bibliothek: Übersicht aller Zettel, Neu-Dialog mit Szenarien, Hinweis zur Sicherung.
import { berechne } from './calc/payroll.js';
import { fmtCents } from './calc/money.js';
import { backupReminder } from './backup.js';
import { MONATE, newFall } from './model.js';
import { SCENARIOS, scenarioById } from './scenarios.js';
import { esc } from './slip.js';
import { $, toast } from './ui.js';

export function createLibrary(app) {
  const list = $('#lib-list');

  function card(fall) {
    const r = berechne(fall);
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `
      <button type="button" class="card-open" data-id="${esc(fall.id)}">
        <span class="card-title">${esc(fall.titel)}</span>
        <span class="card-sub">${esc(fall.person.name)} · ${esc(MONATE[fall.monat - 1])} ${fall.jahr} · Steuerklasse ${fall.person.steuerklasse}</span>
        <span class="card-sum"><span>Brutto <b>${fmtCents(r.gesamtBrutto)} €</b></span><span>Auszahlung <b>${fmtCents(r.auszahlung)} €</b></span></span>
      </button>
      <div class="card-actions">
        <button type="button" class="btn btn-small" data-act="dup" data-id="${esc(fall.id)}">Duplizieren</button>
        <button type="button" class="btn btn-small btn-danger" data-act="del" data-id="${esc(fall.id)}">Löschen</button>
      </div>`;
    return li;
  }

  function renderReminder() {
    const text = backupReminder(app.settings, app.faelle.length);
    $('#backup-reminder').hidden = !text;
    $('#backup-reminder-text').textContent = text ?? '';
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const fall = app.faelle.find((f) => f.id === btn.dataset.id);
    if (!fall) return;
    if (btn.dataset.act === 'dup') await app.duplicateFall(fall, { open: false });
    else if (btn.dataset.act === 'del') await app.deleteFall(fall);
    else app.go(`#/fall/${encodeURIComponent(fall.id)}`);
  });

  // --- Neu ------------------------------------------------------------------------------------------
  $('#neu-liste').replaceChildren(
    ...SCENARIOS.map((s) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="szenario" data-szenario="${esc(s.id)}"><b>${esc(s.titel)}</b><span>${esc(s.beschreibung)}</span></button>`;
      return li;
    }),
  );
  $('#lib-neu').addEventListener('click', () => $('#dlg-neu').showModal());
  $('#dlg-neu').addEventListener('click', async (e) => {
    const leer = e.target.closest('[data-leer]');
    const sz = e.target.closest('[data-szenario]');
    if (!leer && !sz) return;
    $('#dlg-neu').close();
    const fall = sz ? scenarioById(sz.dataset.szenario).build() : newFall();
    await app.createFall(fall);
  });
  $('#lib-backup').addEventListener('click', () => app.backup.open());
  $('#backup-reminder-open').addEventListener('click', () => app.backup.open());

  return {
    async show() {
      await app.refreshFaelle();
      document.body.dataset.view = 'library';
      document.title = 'Lohnzettel-Werkstatt';
      $('#lib-empty').hidden = app.faelle.length > 0;
      list.replaceChildren(...app.faelle.map(card));
      renderReminder();
    },
    renderReminder,
  };
}
