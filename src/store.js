// Lokaler Speicher (IndexedDB). Fällt auf einen Arbeitsspeicher-Speicher zurück, wenn IndexedDB
// nicht nutzbar ist (z. B. manche privaten Fenster) – dann zeigt die App eine Warnung.
import { DEFAULT_SETTINGS, normalizeFall } from './model.js';

const DB_NAME = 'lohnzettel';
const DB_VERSION = 1;
const STORES = ['faelle', 'settings'];

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen'));
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist blockiert (andere Registerkarte mit alter Version offen)'));
  });
}

function buildApi(backend, persistent) {
  return {
    persistent,
    async listFaelle() {
      const all = await backend.getAll('faelle');
      return all.map((f) => normalizeFall(f)).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async getFall(id) {
      return normalizeFall(await backend.get('faelle', id));
    },
    saveFall: (fall) => backend.put('faelle', structuredClone(fall)),
    deleteFall: (id) => backend.delete('faelle', id),
    async getSettings() {
      const rows = await backend.getAll('settings');
      return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    },
    setSetting: (key, value) => backend.put('settings', { key, value }),
  };
}

function idbBackend(db) {
  return {
    get: (store, key) => request(db.transaction(store).objectStore(store).get(key)),
    getAll: (store) => request(db.transaction(store).objectStore(store).getAll()),
    async put(store, value) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      return done(tx);
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      return done(tx);
    },
  };
}

function memoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  const keyOf = (store, value) => (store === 'settings' ? value.key : value.id);
  return {
    get: async (store, key) => data[store].get(key),
    getAll: async (store) => [...data[store].values()],
    put: async (store, value) => void data[store].set(keyOf(store, value), value),
    delete: async (store, key) => void data[store].delete(key),
  };
}

export const createMemoryStore = () => buildApi(memoryBackend(), false);

export async function openStore() {
  try {
    if (!globalThis.indexedDB) throw new Error('IndexedDB fehlt');
    const db = await openDb();
    db.onversionchange = () => db.close();
    return buildApi(idbBackend(db), true);
  } catch (err) {
    console.warn('IndexedDB nicht nutzbar, arbeite nur im Arbeitsspeicher:', err);
    return createMemoryStore();
  }
}
