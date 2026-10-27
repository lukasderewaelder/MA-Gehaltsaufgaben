// PDF-Export: jede A4-Seite -> Canvas (html2canvas) -> JPEG -> PDF-Seite (jsPDF).
// Die Seiten werden außerhalb des Bildschirms aufgebaut und dort in den Zettel eingepasst; die sichtbare Vorschau bleibt unberührt.
import { berechne } from './calc/payroll.js';
import { PAGE_H, PAGE_W, fitPages, renderBlatt } from './worksheet.js';

const LIBS = {
  html2canvas: 'vendor/html2canvas/html2canvas.min.js',
  jspdf: 'vendor/jspdf/jspdf.umd.min.js',
};
const loading = new Map();

export class PdfExportError extends Error {}

function loadScript(src) {
  const url = new URL(src, new URL('../', import.meta.url)).href;
  if (!loading.has(url)) {
    loading.set(
      url,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => {
          loading.delete(url);
          reject(new PdfExportError(`Bibliothek konnte nicht geladen werden: ${src}`));
        };
        document.head.append(s);
      }),
    );
  }
  return loading.get(url);
}

async function ensureLibs() {
  if (!window.html2canvas) await loadScript(LIBS.html2canvas);
  if (!window.jspdf?.jsPDF) await loadScript(LIBS.jspdf);
}

/** Stark verkleinerte Kopie auf Helligkeitsunterschiede prüfen (iOS liefert bei zu großen Canvas leere Bilder). */
function looksBlank(canvas) {
  const probe = document.createElement('canvas');
  probe.width = 96;
  probe.height = 136;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  return max - min < 40;
}

async function renderCanvas(pageEl, scales) {
  let lastError;
  for (const scale of scales) {
    try {
      const canvas = await window.html2canvas(pageEl, {
        scale,
        width: PAGE_W,
        height: PAGE_H,
        windowWidth: PAGE_W,
        windowHeight: PAGE_H,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (doc) => {
          const clone = doc.getElementById(pageEl.id);
          if (!clone) return;
          // Klon aus dem Versteck lösen: links oben, nichts anderes im Bild.
          Array.from(doc.body.children).forEach((child) => {
            if (child !== clone) child.style.display = 'none';
          });
          doc.body.append(clone);
          doc.body.style.margin = '0';
          doc.documentElement.style.background = '#fff';
          clone.style.position = 'absolute';
          clone.style.left = '0px';
          clone.style.top = '0px';
          clone.style.margin = '0';
          clone.style.boxShadow = 'none';
          clone.classList.remove('is-overflow'); // Warnmarken gehören nicht aufs Papier
        },
      });
      if (!canvas.width || !canvas.height) throw new PdfExportError('Leeres Bild (Größe 0)');
      if (looksBlank(canvas)) throw new PdfExportError('Leeres Bild (nur eine Farbe)');
      return canvas;
    } catch (err) {
      lastError = err;
    }
  }
  throw new PdfExportError(`Das Blatt konnte nicht in ein Bild umgewandelt werden (${lastError?.message ?? 'unbekannter Fehler'}).`);
}

/** Baut die gewünschten Blätter ('arbeit', 'loesung') unsichtbar auf und gibt { stage, pages } zurück. */
function buildStage(fall, modi) {
  const r = berechne(fall);
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;pointer-events:none`;
  stage.innerHTML = modi.map((modus) => renderBlatt(fall, r, { modus })).join('');
  document.body.append(stage);
  const pages = [...stage.querySelectorAll('.page')];
  pages.forEach((p, i) => {
    p.id = `export-seite-${i + 1}`;
    p.style.margin = '0';
    p.style.boxShadow = 'none';
  });
  fitPages(stage);
  return { stage, pages };
}

/**
 * Erzeugt das PDF (A4 hoch). `modi`: ['arbeit'], ['loesung'] oder beide.
 * Skalierungen werden der Reihe nach versucht, damit schwächere Geräte statt eines leeren PDFs eine gröbere Fassung bekommen.
 * Gibt { blob, seiten, ms, ueberlaufen } zurück; `ueberlaufen` = Seiten, auf denen der Zettel zu stark verkleinert werden musste.
 */
export async function createPdf(fall, modi, { quality = 0.92, scales = [2, 1.5, 1], onProgress } = {}) {
  const started = performance.now();
  await ensureLibs();
  if (document.fonts?.ready) await document.fonts.ready;
  const { stage, pages } = buildStage(fall, modi);
  try {
    const ueberlaufen = pages.filter((p) => p.classList.contains('is-overflow')).length;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i + 1, pages.length);
      const canvas = await renderCanvas(pages[i], scales);
      try {
        if (i > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      } finally {
        canvas.width = 0; // Speicher auf dem iPad sofort freigeben
        canvas.height = 0;
      }
    }
    return { blob: pdf.output('blob'), seiten: pages.length, ms: Math.round(performance.now() - started), ueberlaufen };
  } finally {
    stage.remove();
  }
}

export function safeFilename(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Lohnzettel';
}

export function pdfFile(blob, filename) {
  return new File([blob], filename, { type: 'application/pdf' });
}

export function canSharePdf(file) {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Muss direkt aus einem Tipp/Klick aufgerufen werden (Safari verlangt eine frische Nutzeraktion). */
export async function sharePdf(file) {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'geteilt';
  } catch (err) {
    if (err?.name === 'AbortError') return 'abgebrochen';
    throw err;
  }
}

export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openPdf(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}
