// Dialog „PDF erstellen“: für Zettel (Arbeits-/Lösungsblatt, Jahresübersicht) und Mischblätter.
// Das PDF entsteht erst nach „PDF erstellen“; Teilen/Herunterladen/Öffnen folgen als eigene Knöpfe (Safari verlangt eine frische Nutzeraktion).
import { canSharePdf, createPdf, downloadPdf, openPdf, pdfFile, safeFilename, sharePdf } from './export-pdf.js';
import { $ } from './ui.js';

const TEILE = { beide: '', arbeit: ' – Arbeitsblatt', loesung: ' – Lösungsblatt', jahr: ' – Jahresübersicht' };

export function createPdfDialog() {
  const dlg = $('#dlg-pdf');
  let quelle = null;
  let pdf = null; // { blob, file, name }

  const status = (text, fehler = false) => {
    const el = $('#pdf-status');
    el.textContent = text;
    el.hidden = !text;
    el.className = fehler ? 'meldung meldung-fehler' : 'meldung';
  };
  const knoepfe = (an) => {
    $('#pdf-share').hidden = !an || !canSharePdf(pdf.file);
    $('#pdf-download').hidden = !an;
    $('#pdf-open').hidden = !an;
  };

  $('#pdf-go').addEventListener('click', async () => {
    const was = dlg.querySelector('input[name="pdf-was"]:checked').value;
    const modi = was === 'beide' ? ['arbeit', 'loesung'] : was === 'jahr' ? ['jahr-arbeit', 'jahr-loesung'] : [was];
    $('#pdf-go').disabled = true;
    knoepfe(false);
    status('PDF wird erstellt …');
    try {
      const out = await createPdf(quelle, modi, { onProgress: (i, n) => status(`PDF wird erstellt … Seite ${i} von ${n}`) });
      const name = `${safeFilename(quelle.titel)}${TEILE[was]}.pdf`;
      pdf = { blob: out.blob, file: pdfFile(out.blob, name), name };
      status(`Fertig: ${out.seiten} ${out.seiten === 1 ? 'Seite' : 'Seiten'}.${out.ueberlaufen ? ` Achtung: ${out.ueberlaufen} Seite(n) sind sehr voll, der Inhalt wurde stark verkleinert oder abgeschnitten.` : ''}`);
      knoepfe(true);
    } catch (err) {
      console.error(err);
      status(err.message, true);
    } finally {
      $('#pdf-go').disabled = false;
    }
  });
  $('#pdf-share').addEventListener('click', async () => {
    if (!pdf) return;
    try {
      if ((await sharePdf(pdf.file)) === 'geteilt') status('Geteilt.');
    } catch (err) {
      status(`Teilen ist fehlgeschlagen: ${err.message}`, true);
    }
  });
  $('#pdf-download').addEventListener('click', () => pdf && downloadPdf(pdf.blob, pdf.name));
  $('#pdf-open').addEventListener('click', () => pdf && openPdf(pdf.blob));

  return {
    /** `q` = Zettel oder Mischblatt; `jahr`: Jahresübersicht anbieten (nur bei Zetteln). */
    open(q, { jahr = true } = {}) {
      quelle = q;
      pdf = null;
      status('');
      knoepfe(false);
      $('#pdf-go').disabled = false;
      $('#pdf-jahr-option').hidden = !jahr;
      if (!jahr && dlg.querySelector('input[name="pdf-was"]:checked').value === 'jahr') dlg.querySelector('input[name="pdf-was"][value="beide"]').checked = true;
      dlg.showModal();
    },
  };
}
