// Zeichnet eine A4-Seite aus dem DOM als echte PDF-Objekte (Text, Linien, Flächen) mit jsPDF: gestochen scharf, Text bleibt markierbar.
// Lage und Größe kommen aus dem Browser-Layout; Schrift ist Helvetica oder Courier (in jedem PDF-Betrachter vorhanden).
import { PAGE_W } from './worksheet.js';

const MM = 210 / PAGE_W; // Bildschirm-Pixel -> Millimeter
const PT = (MM * 72) / 25.4; // Bildschirm-Pixel -> Punkt

/** Zeichen ausserhalb von Windows-1252 kennen die Standardschriften nicht. */
const ERSATZ = { '−': '–', '→': '->', '≈': '~', '↩': '<-', ' ': ' ', ' ': ' ', '✓': 'x' };
const pdfText = (t) => t.replace(/[−→≈↩  ✓]/g, (z) => ERSATZ[z]);

/** CSS-Farbe -> [r, g, b] (Transparenz auf Weiß gemischt) oder null, wenn unsichtbar. */
function farbe(css) {
  const m = css?.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  const [r, g, b, a = 1] = m.map(Number);
  if (a < 0.05) return null;
  return [r, g, b].map((c) => Math.round(c * a + 255 * (1 - a)));
}

const schriftArt = (s) => {
  const fett = Number(s.fontWeight) >= 600;
  const kursiv = s.fontStyle === 'italic';
  return fett ? (kursiv ? 'bolditalic' : 'bold') : kursiv ? 'italic' : 'normal';
};
const schriftName = (s) => (/courier|mono|consolas/i.test(s.fontFamily) ? 'courier' : 'helvetica');

/** Teilt einen Textknoten in die Zeilen, die der Browser gesetzt hat: [{ text, left, right, top, bottom }]. */
function textZeilen(node) {
  const zeilen = [];
  const range = document.createRange();
  let zeile = null;
  for (let i = 0; i < node.data.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const rects = range.getClientRects();
    const r = rects[rects.length - 1];
    if (!r || r.width === 0) continue; // zusammengefasste Leerzeichen
    const leer = /\s/.test(node.data[i]);
    if (!zeile || Math.abs(r.top - zeile.top) > r.height / 2) {
      if (leer) continue; // Leerzeichen am Zeilenanfang
      zeile = { text: '', left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      zeilen.push(zeile);
    }
    zeile.text += node.data[i];
    if (!leer) zeile.right = Math.max(zeile.right, r.right); // Leerzeichen am Ende zählen nicht zur Breite
  }
  for (const z of zeilen) z.text = z.text.trimEnd();
  return zeilen;
}

export function zeichneSeite(pdf, seite) {
  const o = seite.getBoundingClientRect();
  const x = (px) => (px - o.left) * MM;
  const y = (px) => (px - o.top) * MM;

  function schreibe(text, left, right, unten, hoehe, s, zoom, farbeCss) {
    const inhalt = pdfText(text);
    if (!inhalt.trim()) return;
    const groesse = parseFloat(s.fontSize) * zoom;
    pdf.setFont(schriftName(s), schriftArt(s));
    pdf.setFontSize(groesse * PT);
    pdf.setTextColor(...(farbe(farbeCss) ?? [0, 0, 0]));
    const ziel = (right - left) * MM;
    const natur = pdf.getTextWidth(inhalt);
    // Helvetica läuft etwas anders als die Bildschirmschrift: der Zeichenabstand gleicht die Breite aus, damit nichts überlappt
    const charSpace = inhalt.length > 1 ? (ziel - natur) / (inhalt.length - 1) : 0;
    const grundlinie = unten - (hoehe - groesse) / 2 - groesse * 0.21;
    pdf.text(inhalt, x(left), y(grundlinie), { charSpace });
  }

  function rahmen(el, s, r, zoom) {
    const seiten = [
      ['Top', r.left, r.top, r.right, r.top],
      ['Bottom', r.left, r.bottom, r.right, r.bottom],
      ['Left', r.left, r.top, r.left, r.bottom],
      ['Right', r.right, r.top, r.right, r.bottom],
    ];
    const radius = parseFloat(s.borderTopLeftRadius) || 0;
    const voll = seiten.every(([k]) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none');
    const hg = farbe(s.backgroundColor);
    if (radius > 0 && (hg || voll)) {
      const rad = Math.min(radius, r.width / 2, r.height / 2) * zoom * MM;
      const strich = voll ? farbe(s.borderTopColor) : null;
      if (hg) pdf.setFillColor(...hg);
      if (strich) {
        pdf.setDrawColor(...strich);
        pdf.setLineWidth(parseFloat(s.borderTopWidth) * zoom * MM);
      }
      pdf.roundedRect(x(r.left), y(r.top), r.width * MM, r.height * MM, rad, rad, hg && strich ? 'FD' : hg ? 'F' : 'S');
      return;
    }
    if (hg) {
      pdf.setFillColor(...hg);
      pdf.rect(x(r.left), y(r.top), r.width * MM, r.height * MM, 'F');
    }
    for (const [k, x1, y1, x2, y2] of seiten) {
      const breite = parseFloat(s[`border${k}Width`]);
      const c = farbe(s[`border${k}Color`]);
      if (!(breite > 0) || s[`border${k}Style`] === 'none' || !c) continue;
      pdf.setDrawColor(...c);
      pdf.setLineWidth(breite * zoom * MM);
      pdf.setLineDashPattern(s[`border${k}Style`] === 'dashed' ? [1, 1] : [], 0);
      pdf.line(x(x1), y(y1), x(x2), y(y2));
      pdf.setLineDashPattern([], 0);
    }
  }

  function svg(el, zoom) {
    for (const kind of el.children) {
      const s = getComputedStyle(kind);
      const r = kind.getBoundingClientRect();
      const name = kind.tagName.toLowerCase();
      if (name === 'rect') {
        pdf.setFillColor(...(farbe(s.fill) ?? [0, 0, 0]));
        pdf.rect(x(r.left), y(r.top), r.width * MM, r.height * MM, 'F');
      } else if (name === 'line') {
        pdf.setDrawColor(...(farbe(s.stroke) ?? [0, 0, 0]));
        pdf.setLineWidth(zoom * MM);
        pdf.line(x(r.left), y(r.top), x(r.right), y(r.bottom));
      } else if (name === 'text') {
        schreibe(kind.textContent, r.left, r.right, r.bottom, r.height, s, zoom, s.fill);
      }
    }
  }

  function knoten(el, zoom) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.top - o.top > o.height) return; // unterhalb der Seite: beim Bildschirm abgeschnitten
    const matrix = s.transform.match(/^matrix\(([-\d.]+)/);
    const z = matrix ? zoom * Number(matrix[1]) : zoom;
    if (el.tagName.toLowerCase() === 'svg') return svg(el, z);
    if (el !== seite && (s.display !== 'inline' || farbe(s.backgroundColor) || parseFloat(s.borderBottomWidth) > 0)) rahmen(el, s, r, z);
    if (el.tagName === 'LI' && el.parentElement.tagName === 'OL') {
      const nummer = [...el.parentElement.children].indexOf(el) + 1;
      const links = r.left - 20;
      schreibe(`${nummer}.`, links, links + 12, r.top + parseFloat(s.lineHeight), parseFloat(s.lineHeight), s, z, s.color);
    }
    for (const kind of el.childNodes) {
      if (kind.nodeType === 1) knoten(kind, z);
      else if (kind.nodeType === 3 && kind.data.trim()) {
        for (const l of textZeilen(kind)) {
          const text = s.textTransform === 'uppercase' ? l.text.toUpperCase() : l.text;
          schreibe(text, l.left, l.right, l.bottom, l.bottom - l.top, s, z, s.color);
        }
      }
    }
  }
  knoten(seite, 1);
}
