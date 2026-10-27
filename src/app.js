// App-Rahmen: Speicher, Routing (Bibliothek ↔ Editor), Sicherungsdialog.
import { backupFileName, buildBackup, mergeFaelle, parseBackup } from './backup.js';
import { createEditor } from './editor.js';
import { createLibrary } from './library.js';
import { duplicateFall } from './model.js';
import { openStore } from './store.js';
import { $, fileDeliverable, toast, wireDialogs } from './ui.js';
import { createZufallDialog } from './zufall-ui.js';

const fallPath = (id) => `#/fall/${encodeURIComponent(id)}`;
const currentFallId = () => {
  const m = location.hash.match(/^#\/fall\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

export async function startApp() {
  wireDialogs();
  const store = await openStore();
  $('#storage-banner').hidden = store.persistent;
  navigator.storage?.persist?.().catch(() => {});

  const app = { store, settings: await store.getSettings(), faelle: [] };
  app.refreshFaelle = async () => {
    app.faelle = await store.listFaelle();
  };
  app.setSettings = async (patch) => {
    Object.assign(app.settings, patch);
    await Promise.all(Object.entries(patch).map(([k, v]) => store.setSetting(k, v)));
  };
  app.noteChange = () => app.setSettings({ changesSinceBackup: (app.settings.changesSinceBackup ?? 0) + 1 }).catch(() => {});
  app.onFallSaved = (snapshot) => {
    app.faelle = [snapshot, ...app.faelle.filter((f) => f.id !== snapshot.id)];
    app.noteChange();
  };

  // --- Navigation ---------------------------------------------------------------------------------
  let editor;
  let library;
  let routing = Promise.resolve();
  async function doRoute() {
    const id = currentFallId();
    if (id) {
      if (await editor.open(id)) {
        document.title = `${editor.getFall().titel} – Lohnzettel-Werkstatt`;
        return;
      }
      history.replaceState(null, '', '#/');
    }
    await editor.close();
    await library.show();
  }
  const route = () => {
    routing = routing.then(doRoute).catch((err) => console.error(err));
    return routing;
  };
  app.go = (hash) => {
    if ((location.hash || '#/') === hash) return route();
    location.hash = hash;
    return routing;
  };
  window.addEventListener('hashchange', route);

  // --- Zettel anlegen, kopieren, löschen ---------------------------------------------------------------
  app.createFall = async (fall) => {
    await store.saveFall(fall);
    await app.refreshFaelle();
    app.noteChange();
    await app.go(fallPath(fall.id));
  };
  /** Mehrere erzeugte Zettel (Gruppen A, B …) speichern und den ersten öffnen. */
  app.createFaelle = async (faelle) => {
    for (const f of faelle) await store.saveFall(f);
    await app.refreshFaelle();
    app.noteChange();
    await app.go(fallPath(faelle[0].id));
    if (faelle.length > 1) toast(`${faelle.length} Zettel angelegt (Gruppen A bis ${String.fromCharCode(64 + faelle.length)}). Du findest sie in der Übersicht.`);
  };
  app.duplicateFall = async (fall, { open = true } = {}) => {
    await editor.flush();
    const latest = (await store.getFall(fall.id)) ?? fall;
    const copy = duplicateFall(latest);
    await store.saveFall(copy);
    await app.refreshFaelle();
    app.noteChange();
    if (open) await app.go(fallPath(copy.id));
    else {
      await library.show();
      toast(`Kopie „${copy.titel}“ angelegt.`);
    }
  };
  app.deleteFall = async (fall) => {
    editor.discard(fall.id);
    const snapshot = (await store.getFall(fall.id)) ?? structuredClone(fall);
    await store.deleteFall(fall.id);
    await app.refreshFaelle();
    if (currentFallId()) await app.go('#/');
    else await library.show();
    toast(`„${fall.titel}“ gelöscht.`, {
      action: 'Rückgängig',
      ms: 10_000,
      onAction: async () => {
        await store.saveFall(snapshot);
        await app.refreshFaelle();
        if (document.body.dataset.view === 'library') await library.show();
      },
    });
  };

  // --- Sicherung ----------------------------------------------------------------------------------
  let deliverable = null;
  const dlg = $('#dlg-backup');
  const meldung = (text, fehler = false) => {
    const el = $('#backup-meldung');
    el.textContent = text;
    el.hidden = !text;
    el.className = fehler ? 'meldung meldung-fehler' : 'meldung';
  };
  app.backup = {
    async open() {
      await editor.flush();
      await app.refreshFaelle();
      meldung('');
      deliverable = null;
      $('#backup-share').hidden = true;
      $('#backup-info').textContent = `${app.faelle.length} Zettel gespeichert.`;
      dlg.showModal();
    },
  };
  $('#backup-export').addEventListener('click', async () => {
    const json = JSON.stringify(buildBackup(app.faelle), null, 1);
    deliverable = fileDeliverable(new Blob([json], { type: 'application/json' }), backupFileName());
    await app.setSettings({ lastBackupAt: Date.now(), changesSinceBackup: 0 });
    if (deliverable.canShare) {
      $('#backup-share').hidden = false;
      meldung('Sicherung erstellt. Über „Teilen“ in Dateien, OneDrive oder AirDrop ablegen.');
    } else {
      deliverable.download();
      meldung('Sicherung wurde heruntergeladen.');
    }
    library.renderReminder();
  });
  $('#backup-share').addEventListener('click', async () => {
    if (deliverable && (await deliverable.share())) meldung('Geteilt.');
  });
  $('#backup-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { faelle, ignoriert } = parseBackup(await file.text());
      const merge = mergeFaelle(app.faelle, faelle);
      for (const f of merge.zuSpeichern) await store.saveFall(f);
      await app.refreshFaelle();
      await library.show();
      $('#backup-info').textContent = `${app.faelle.length} Zettel gespeichert.`;
      meldung(
        `Eingelesen: ${merge.hinzu} neu, ${merge.aktualisiert} aktualisiert, ${merge.uebersprungen} unverändert${ignoriert ? `, ${ignoriert} unlesbar` : ''}.`,
      );
    } catch (err) {
      meldung(err.message, true);
    }
  });

  // --- Start ----------------------------------------------------------------------------------------
  editor = createEditor(app);
  library = createLibrary(app);
  const zufall = createZufallDialog(app);
  $('#lib-zufall').addEventListener('click', () => zufall.open());
  await app.refreshFaelle();
  await route();
  window.__lohnzettel = { app, getFall: () => editor.getFall(), flush: () => editor.flush() };
}
