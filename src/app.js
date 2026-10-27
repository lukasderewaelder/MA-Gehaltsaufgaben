// App-Rahmen: Speicher, Routing (Bibliothek ↔ Editor), Sicherungsdialog.
import { backupFileName, buildBackup, mergeFaelle, parseBackup } from './backup.js';
import { createEditor } from './editor.js';
import { createLibrary } from './library.js';
import { createMischDialog, createMischEditor } from './misch-ui.js';
import { duplicateMisch } from './misch.js';
import { duplicateFall } from './model.js';
import { createPdfDialog } from './pdf-ui.js';
import { createPresent } from './present.js';
import { openStore } from './store.js';
import { $, fileDeliverable, toast, wireDialogs } from './ui.js';
import { createZufallDialog } from './zufall-ui.js';

const fallPath = (id) => `#/fall/${encodeURIComponent(id)}`;
const currentFallId = () => {
  const m = location.hash.match(/^#\/fall\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};
const mischPath = (id) => `#/misch/${encodeURIComponent(id)}`;
const currentMischId = () => {
  const m = location.hash.match(/^#\/misch\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};
const currentPresentId = () => {
  const m = location.hash.match(/^#\/vorfuehren\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

export async function startApp() {
  wireDialogs();
  const store = await openStore();
  $('#storage-banner').hidden = store.persistent;
  navigator.storage?.persist?.().catch(() => {});

  const app = { store, settings: await store.getSettings(), faelle: [], blaetter: [] };
  /** Lädt Zettel und Mischblätter neu aus dem Speicher. */
  app.refreshFaelle = async () => {
    [app.faelle, app.blaetter] = await Promise.all([store.listFaelle(), store.listBlaetter()]);
  };
  app.anzahlGespeichert = () => app.faelle.length + app.blaetter.length;
  app.setSettings = async (patch) => {
    Object.assign(app.settings, patch);
    await Promise.all(Object.entries(patch).map(([k, v]) => store.setSetting(k, v)));
  };
  app.noteChange = () => app.setSettings({ changesSinceBackup: (app.settings.changesSinceBackup ?? 0) + 1 }).catch(() => {});
  app.onFallSaved = (snapshot) => {
    app.faelle = [snapshot, ...app.faelle.filter((f) => f.id !== snapshot.id)];
    app.noteChange();
  };
  app.onBlattSaved = (snapshot) => {
    app.blaetter = [snapshot, ...app.blaetter.filter((b) => b.id !== snapshot.id)];
    app.noteChange();
  };

  // --- Navigation ---------------------------------------------------------------------------------
  let editor;
  let library;
  let present;
  let misch;
  let routing = Promise.resolve();
  async function doRoute() {
    const presentId = currentPresentId();
    const mischId = currentMischId();
    const fallId = currentFallId();
    if (!presentId) await present.close();
    if (!mischId) await misch.close();
    if (!fallId) await editor.close();
    if (presentId && (await present.open(presentId))) {
      document.title = 'Vorführen – Lohnzettel-Werkstatt';
      return;
    }
    if (mischId && (await misch.open(mischId))) {
      document.title = `${misch.getBlatt().titel} – Lohnzettel-Werkstatt`;
      return;
    }
    if (fallId && (await editor.open(fallId))) {
      document.title = `${editor.getFall().titel} – Lohnzettel-Werkstatt`;
      return;
    }
    if (presentId || mischId || fallId) history.replaceState(null, '', '#/'); // unbekannte Adresse -> Übersicht
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

  // --- Mischblätter anlegen, kopieren, löschen ---------------------------------------------------------
  /** Erzeugte Mischblätter (Gruppen A, B …) speichern und das erste öffnen. */
  app.createMischblaetter = async (blaetter) => {
    for (const b of blaetter) await store.saveBlatt(b);
    await app.refreshFaelle();
    app.noteChange();
    await app.go(mischPath(blaetter[0].id));
    if (blaetter.length > 1) toast(`${blaetter.length} Mischblätter angelegt (Gruppen A bis ${String.fromCharCode(64 + blaetter.length)}). Du findest sie in der Übersicht.`);
  };
  app.duplicateBlatt = async (blatt, { open = true } = {}) => {
    await misch.flush();
    const kopie = duplicateMisch((await store.getBlatt(blatt.id)) ?? blatt);
    await store.saveBlatt(kopie);
    await app.refreshFaelle();
    app.noteChange();
    if (open) await app.go(mischPath(kopie.id));
    else {
      await library.show();
      toast(`Kopie „${kopie.titel}“ angelegt.`);
    }
  };
  app.deleteBlatt = async (blatt) => {
    misch.discard(blatt.id);
    const snapshot = (await store.getBlatt(blatt.id)) ?? structuredClone(blatt);
    await store.deleteBlatt(blatt.id);
    await app.refreshFaelle();
    if (currentMischId()) await app.go('#/');
    else await library.show();
    toast(`„${blatt.titel}“ gelöscht.`, {
      action: 'Rückgängig',
      ms: 10_000,
      onAction: async () => {
        await store.saveBlatt(snapshot);
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
      await Promise.all([editor.flush(), misch.flush()]);
      await app.refreshFaelle();
      meldung('');
      deliverable = null;
      $('#backup-share').hidden = true;
      $('#backup-download').hidden = true;
      $('#backup-info').textContent = `${app.faelle.length} Zettel und ${app.blaetter.length} Mischblätter gespeichert.`;
      dlg.showModal();
    },
  };
  $('#backup-export').addEventListener('click', async () => {
    await Promise.all([editor.flush(), misch.flush()]);
    await app.refreshFaelle();
    const json = JSON.stringify(buildBackup(app.faelle, app.blaetter), null, 1);
    deliverable = fileDeliverable(new Blob([json], { type: 'application/json' }), backupFileName());
    await app.setSettings({ lastBackupAt: Date.now(), changesSinceBackup: 0 });
    if (deliverable.canShare) {
      $('#backup-share').hidden = false;
      $('#backup-download').hidden = false;
      meldung('Sicherung erstellt. Über „Teilen“ in Dateien, OneDrive oder AirDrop ablegen oder „Herunterladen“.');
    } else {
      deliverable.download();
      meldung('Sicherung wurde heruntergeladen.');
    }
    library.renderReminder();
  });
  $('#backup-download').addEventListener('click', () => deliverable?.download());
  $('#backup-share').addEventListener('click', async () => {
    if (deliverable && (await deliverable.share())) meldung('Geteilt.');
  });
  $('#backup-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { faelle, blaetter, ignoriert } = parseBackup(await file.text());
      const mf = mergeFaelle(app.faelle, faelle);
      const mb = mergeFaelle(app.blaetter, blaetter);
      for (const f of mf.zuSpeichern) await store.saveFall(f);
      for (const b of mb.zuSpeichern) await store.saveBlatt(b);
      await app.refreshFaelle();
      await library.show();
      $('#backup-info').textContent = `${app.faelle.length} Zettel und ${app.blaetter.length} Mischblätter gespeichert.`;
      meldung(
        `Eingelesen: ${mf.hinzu + mb.hinzu} neu, ${mf.aktualisiert + mb.aktualisiert} aktualisiert, ${mf.uebersprungen + mb.uebersprungen} unverändert${ignoriert ? `, ${ignoriert} unlesbar` : ''}.`,
      );
    } catch (err) {
      meldung(err.message, true);
    }
  });

  // --- Start ----------------------------------------------------------------------------------------
  app.pdfDialog = createPdfDialog();
  editor = createEditor(app);
  library = createLibrary(app);
  present = createPresent(app);
  misch = createMischEditor(app);
  const zufall = createZufallDialog(app);
  const mischDialog = createMischDialog(app);
  $('#lib-zufall').addEventListener('click', () => zufall.open());
  $('#lib-misch').addEventListener('click', () => mischDialog.open());
  await app.refreshFaelle();
  await route();
  // Beim Wechsel der App (iPad) oder Schließen sofort speichern, nicht erst nach der kurzen Verzögerung
  const alleSpeichern = () => Promise.all([editor.flush(), misch.flush()]).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') alleSpeichern();
  });
  window.addEventListener('pagehide', alleSpeichern);
  window.__lohnzettel = { app, getFall: () => editor.getFall(), getBlatt: () => misch.getBlatt(), flush: alleSpeichern };
}
