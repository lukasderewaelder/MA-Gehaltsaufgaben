// Mischblatt als Seiten: Kopf, Einleitung und alle Aufgaben mit Zettel-Ausschnitt und Teilaufgaben, auf A4 verteilt; dazu das Beiblatt.
import { berechne } from './calc/payroll.js';
import { MISCH_TYPEN } from './misch.js';
import { rueckPlan } from './rueck.js';
import { esc, renderSlip } from './slip.js';
import { PAGE_H, gesuchteFelder, linien, lohnsteuerTabelle, merkzettel, sachtextAuto, teilaufgaben, versuche } from './worksheet.js';

export const INTRO_AUTO = 'Bearbeite alle Aufgaben. Berechne sorgfältig und schreibe deinen Rechenweg auf.';
const SEITENRAND = 40;
const ABSTAND = 12; // wie `gap` der Seiten in blatt.css

/** Eine Aufgabe als Block. modus: 'arbeit' | 'loesung'. */
export function renderAufgabe(aufgabe, nr, blatt, modus) {
  const fall = aufgabe.fall;
  const r = berechne(fall);
  const plan = rueckPlan(fall, r, { kompakt: true });
  const typ = MISCH_TYPEN[aufgabe.typ];
  const gesucht = new Set(gesuchteFelder(fall, r, plan));
  const teile = teilaufgaben(fall, r, plan);
  const sach = fall.aufgabe.sachtext ?? sachtextAuto(fall, teile.length > 0, plan);
  const ohneZettel = Boolean(plan?.ohneZettel) || typ.nur.length === 0;
  const slip = ohneZettel ? '' : renderSlip(fall, r, { compact: true, modus, gesucht, erklaer: false, legende: false, nur: new Set(typ.nur) });
  const tabelle = typ.tabelle && fall.steuer.modus !== 'formel' ? `<div class="aufgabe-tabelle">${lohnsteuerTabelle(fall, r, { modus, halbe: aufgabe.typ === 'probieren' ? 7 : 3 })}</div>` : '';
  const eintraege = teile
    .map((t) => {
      const unten =
        modus === 'loesung'
          ? t.anzeige || t.weg
            ? `<div class="tloesung"><b>${esc(t.anzeige ?? '')}</b> <span>${esc(t.weg ?? '')}</span></div>`
            : ''
          : plan?.versuchstabelle && t.id === 'rueck'
            ? versuche(modus, plan)
            : linien(blatt.zeilen);
      return `<div class="teil"><span class="tl">${t.nr}</span><div class="tb"><div class="tt">${esc(t.text)}</div>${unten}</div></div>`;
    })
    .join('');
  return `<section class="aufgabe" data-aufgabe="${esc(aufgabe.id)}">
    <h3 class="aufgabe-kopf"><span class="anr">Aufgabe ${nr}</span></h3>
    ${plan?.fehler ? `<p class="fehler">${esc(plan.fehler)}</p>` : `<p class="sachtext">${esc(sach)}</p>`}
    ${slip ? `<div class="ausschnitt">${slip}</div>` : ''}
    ${tabelle}
    <div class="teile">${eintraege}</div>
    ${modus === 'loesung' && plan?.versuche ? versuche(modus, plan) : ''}
  </section>`;
}

/** Der Fluss aller Blöcke (noch ohne Seitenumbruch – `paginiere` verteilt sie) und das Beiblatt. */
export function renderMisch(blatt, { modus = 'arbeit' } = {}) {
  const stempel = modus === 'loesung' ? '<span class="stempel">Lösung</span>' : '';
  const kopf = `<header class="page-kopf misch-kopf"><div><h1>${esc(blatt.titel)}</h1>${stempel}</div>
    <div class="felder"><span>Name</span><span>Klasse</span><span>Datum</span></div></header>`;
  const intro = `<p class="sachtext misch-intro">${esc(blatt.intro || INTRO_AUTO)}</p>`;
  const bloecke = blatt.aufgaben.map((a, i) => renderAufgabe(a, i + 1, blatt, modus)).join('');
  const erste = blatt.aufgaben[0]?.fall;
  const bei = blatt.beiblatt && erste ? merkzettel(erste, berechne(erste), { modus, allgemein: true, tabelle: false }) : '';
  return `<div class="misch-fluss">${kopf}${intro}${bloecke}</div>${bei}`;
}

/**
 * Verteilt den Fluss auf A4-Seiten: ein neuer Block beginnt auf einer neuen Seite, wenn er unten nicht mehr passt.
 * Muss im sichtbaren Dokument laufen (die Höhen werden gemessen), vor `fitPages`.
 */
export function paginiere(root) {
  for (const fluss of root.querySelectorAll('.misch-fluss')) {
    const kinder = [...fluss.children];
    const hoehen = kinder.map((k) => k.offsetHeight);
    const kapazitaet = PAGE_H - 2 * SEITENRAND;
    const seiten = [];
    let aktuell = null;
    let genutzt = 0;
    const neueSeite = () => {
      aktuell = document.createElement('section');
      aktuell.className = 'page page-misch';
      aktuell.dataset.seite = 'misch';
      seiten.push(aktuell);
      genutzt = 0;
    };
    neueSeite();
    kinder.forEach((k, i) => {
      const kopfteil = k.classList.contains('misch-kopf') || k.classList.contains('misch-intro');
      if (genutzt > 0 && !kopfteil && genutzt + ABSTAND + hoehen[i] > kapazitaet) neueSeite();
      aktuell.append(k);
      genutzt += (genutzt ? ABSTAND : 0) + hoehen[i];
    });
    fluss.replaceWith(...seiten);
  }
}
