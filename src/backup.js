// Sicherung und Austausch: alle Zettel als eine JSON-Datei (Export) und das Zusammenführen beim Import.
import { normalizeMisch } from './misch.js';
import { normalizeFall } from './model.js';

export const BACKUP_FORMAT = 'lohnzettel-sicherung';
export const BACKUP_VERSION = 2; // 2: zusätzlich Mischblätter (Dateien der Version 1 lassen sich weiter einlesen)

export function buildBackup(faelle, blaetter = [], now = Date.now()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    faelle: faelle.map((f) => structuredClone(f)),
    blaetter: blaetter.map((b) => structuredClone(b)),
  };
}

export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `Lohnzettel-Sicherung-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

/** Liest Sicherungstext. Gibt { faelle, blaetter, ignoriert } zurück oder wirft einen Fehler mit verständlicher Meldung. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung (kein lesbares JSON).');
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.faelle)) throw new Error('Die Datei ist keine Lohnzettel-Sicherung.');
  if (data.version > BACKUP_VERSION) throw new Error('Die Sicherung stammt aus einer neueren Version der App. Bitte die App aktualisieren.');
  const faelle = data.faelle.map((f) => normalizeFall(f)).filter(Boolean);
  const rohBlaetter = Array.isArray(data.blaetter) ? data.blaetter : [];
  const blaetter = rohBlaetter.map((b) => normalizeMisch(b)).filter(Boolean);
  return { faelle, blaetter, ignoriert: data.faelle.length - faelle.length + rohBlaetter.length - blaetter.length };
}

/** Neuere Fassung gewinnt; gleiche oder ältere Fassungen im Speicher bleiben. */
export function mergeFaelle(vorhanden, neu) {
  const byId = new Map(vorhanden.map((f) => [f.id, f]));
  const zuSpeichern = [];
  let hinzu = 0;
  let aktualisiert = 0;
  let uebersprungen = 0;
  for (const f of neu) {
    const alt = byId.get(f.id);
    if (!alt) {
      zuSpeichern.push(f);
      hinzu++;
    } else if (f.updatedAt > alt.updatedAt) {
      zuSpeichern.push(f);
      aktualisiert++;
    } else {
      uebersprungen++;
    }
  }
  return { zuSpeichern, hinzu, aktualisiert, uebersprungen };
}

/** Wie viele Bearbeitungen seit der letzten Sicherung (für die Erinnerung). */
export function backupReminder(settings, anzahlFaelle, now = Date.now()) {
  if (!anzahlFaelle) return null;
  const tage = settings.lastBackupAt ? Math.floor((now - settings.lastBackupAt) / 86_400_000) : null;
  if (settings.changesSinceBackup >= 10 && (tage === null || tage >= 7)) {
    return tage === null ? 'Noch keine Sicherung gemacht.' : `Letzte Sicherung vor ${tage} Tagen.`;
  }
  return null;
}
