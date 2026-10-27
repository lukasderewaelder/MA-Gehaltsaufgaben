// Rückwärtsaufgaben: aus Teilergebnissen zurück zu Brutto, Stundenlohn, Stunden oder Zuschlagssatz.
import { POSTEN_TYPEN, MONATE } from './model.js';
import { bruttoAusBeitrag, bruttoAusNetto, bruttoFuerNetto, hauptposten, quoteBp } from './calc/inverse.js';
import { fmtBp, fmtCents } from './calc/money.js';

const eur = (c) => `${fmtCents(c)} €`;

export const RUECK_TYPEN = {
  beitrag: { label: 'Beitrag und Satz → Brutto', hilfe: 'Der Beitrag steht auf dem Zettel, das Brutto fehlt (Prozentwert und Prozentsatz gegeben, Grundwert gesucht).' },
  stundenlohn: { label: 'Betrag und Stunden → Stundenlohn (oder Stunden, Zuschlagssatz)', hilfe: 'Der Betrag steht auf dem Zettel, ein Faktor der Rechnung fehlt.' },
  quote: { label: 'Netto und Abzugsquote → Brutto', hilfe: 'Ohne Zettel: aus dem Netto und dem Prozentsatz der Abzüge das Brutto bestimmen.' },
  probieren: { label: 'Wunsch-Netto → nötiges Brutto (Probieren)', hilfe: 'Ohne Zettel: durch Ausprobieren das Brutto finden, bei dem ein Wunsch-Netto herauskommt.' },
};

export const BEITRAEGE = { rv: 'Rentenversicherung', kv: 'Krankenversicherung', av: 'Arbeitslosenversicherung', pv: 'Pflegeversicherung' };
export const STUNDEN_ARTEN = { stundenlohn: 'Stundenlohn gesucht', stunden: 'Stunden gesucht', zuschlag: 'Zuschlagssatz gesucht' };

const bruttoIds = (r) => [
  ...r.bruttoPosten.map((p) => `p:${p.id}`),
  'gesamtBrutto', 'stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto',
];

/**
 * Plan einer Rückwärtsaufgabe oder null (keine gewählt / nicht möglich).
 * Ergebnis: { typ, gesucht (Lücken auf dem Zettel) | null, teile (feste Teilaufgaben) | null, sachtext, ohneZettel, versuche, fehler }
 */
export function rueckPlan(fall, r, { kompakt = false } = {}) {
  const rueck = fall.aufgabe.rueck;
  if (!rueck) return null;
  const p = fall.person;
  const monat = `${MONATE[fall.monat - 1]} ${fall.jahr}`;
  const unmoeglich = (fehler) => ({ typ: rueck.typ, fehler, gesucht: [], teile: [], sachtext: null, ohneZettel: false });

  if (rueck.typ === 'beitrag') {
    const art = BEITRAEGE[rueck.param] ? rueck.param : 'rv';
    const beitrag = r.werte[art];
    const bp = r.saetze[art];
    const basis = r.werte[`${art}Brutto`];
    if (!beitrag || !bp) return unmoeglich('Es gibt keinen Beitrag zum Zurückrechnen (Brutto ist 0 oder Minijob).');
    const rechnen = bruttoAusBeitrag(beitrag, bp);
    const name = BEITRAEGE[art];
    const kurz = art.toUpperCase();
    return {
      typ: 'beitrag',
      // kompakt (Mischblatt): nur der Ausschnitt „Steuer und Sozialversicherung“ ist zu sehen, dort fehlen die Berechnungsgrundlagen
      gesucht: kompakt ? ['stBrutto', 'kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto'] : bruttoIds(r),
      sachtext: `${p.name} arbeitet bei ${fall.firma.name}. Auf der Abrechnung für ${monat} fehlen ${kompakt ? 'die Berechnungsgrundlagen' : 'alle Brutto-Werte'}. Der Beitrag zur ${name} ist aber bekannt. Ermittle die fehlenden Werte.`,
      teile: [
        {
          id: 'rueck',
          text: `Der ${kurz}-Beitrag beträgt ${eur(beitrag)}. Das sind ${fmtBp(bp)} % vom ${kurz}-Brutto. Berechne das ${kurz}-Brutto (Beitrag : Prozentsatz).`,
          anzeige: eur(basis),
          weg: `${eur(beitrag)} : ${fmtBp(bp)} % = ${eur(rechnen)}${rechnen !== basis ? ` (gerundet, auf dem Zettel: ${eur(basis)})` : ''}`,
        },
        ...(kompakt
          ? []
          : [
              {
                id: 'rueck2',
                text: 'Trage alle fehlenden Brutto-Werte auf dem Zettel ein.',
                anzeige: eur(r.gesamtBrutto),
                weg: `Gesamt-Brutto: ${eur(r.gesamtBrutto)}, Steuer-Brutto: ${eur(r.stBrutto)}`,
              },
            ]),
      ],
      ohneZettel: false,
    };
  }

  if (rueck.typ === 'stundenlohn') {
    const art = STUNDEN_ARTEN[rueck.param] ? rueck.param : 'stundenlohn';
    const posten = r.bruttoPosten.find((x) => (art === 'zuschlag' ? POSTEN_TYPEN[x.typ].art === 'zuschlag' : POSTEN_TYPEN[x.typ].art !== 'pauschal'));
    if (!posten) return unmoeglich(art === 'zuschlag' ? 'Es gibt keinen Zuschlag-Posten (Menge · Stundenlohn · Prozent).' : 'Es gibt keinen Posten mit Menge und Faktor (z. B. Stundenlohn).');
    const id = art === 'stunden' ? `m:${posten.id}` : art === 'zuschlag' ? `z:${posten.id}` : `f:${posten.id}`;
    return {
      typ: 'stundenlohn',
      gesucht: [id],
      teile: null,
      sachtext: `${p.name} arbeitet bei ${fall.firma.name}. Auf der Abrechnung für ${monat} fehlt ein Wert in der Zeile „${posten.bezeichnung}“. Der Betrag steht auf dem Zettel. Ermittle den fehlenden Wert.`,
      ohneZettel: false,
    };
  }

  if (rueck.typ === 'quote') {
    const abzuege = r.steuerAbzuege + r.svAbzuege;
    if (r.gesamtBrutto <= 0 || r.netto <= 0) return unmoeglich('Brutto oder Netto ist 0.');
    const q = quoteBp(abzuege, r.gesamtBrutto);
    const bleibt = 10000 - q;
    const brutto = bruttoAusNetto(r.netto, q);
    return {
      typ: 'quote',
      gesucht: [],
      sachtext: `${p.name} bekommt im ${monat} ${eur(r.netto)} netto. Insgesamt werden ${fmtBp(q)} % vom Brutto für Steuern und Sozialversicherung abgezogen. Ermittle das Brutto.`,
      teile: [
        { id: 'rueck', text: 'Berechne den Anteil in Prozent, der vom Brutto übrig bleibt.', anzeige: `${fmtBp(bleibt)} %`, weg: `100 % − ${fmtBp(q)} % = ${fmtBp(bleibt)} %` },
        {
          id: 'rueck2',
          text: 'Berechne das Brutto (Netto : Prozentsatz).',
          anzeige: eur(brutto),
          weg: `${eur(r.netto)} : ${fmtBp(bleibt)} % = ${eur(brutto)} (auf dem Zettel: ${eur(r.gesamtBrutto)}, die Abweichung kommt vom gerundeten Prozentsatz)`,
        },
      ],
      ohneZettel: true,
    };
  }

  if (rueck.typ === 'probieren') {
    if (!hauptposten(fall)) return unmoeglich('Es gibt keinen Posten, dessen Betrag man verändern könnte.');
    const ziel = Math.round(r.netto / 1000) * 1000; // volle 10 €
    const such = bruttoFuerNetto(fall, ziel);
    if (!such) return unmoeglich('Das Wunsch-Netto lässt sich nicht erreichen.');
    const nah = [...such.versuche].sort((a, b) => Math.abs(a.brutto - such.brutto) - Math.abs(b.brutto - such.brutto)).slice(0, 5).sort((a, b) => a.brutto - b.brutto);
    return {
      typ: 'probieren',
      gesucht: [],
      sachtext: `${p.name} (Steuerklasse ${p.steuerklasse}) möchte im ${monat} ${eur(ziel)} netto bekommen. Ermittle das nötige Brutto. Probiere verschiedene Brutto-Beträge aus und berechne jeweils das Netto (Beitragssätze und Lohnsteuertabelle stehen auf dem Beiblatt und bei der Aufgabe).`,
      teile: [
        { id: 'rueck', text: 'Trage deine Versuche in die Tabelle ein (Brutto und das dazugehörige Netto).', anzeige: '', weg: '' },
        { id: 'rueck2', text: 'Ermittle das Brutto, das mindestens nötig ist (auf 10 € genau).', anzeige: eur(such.brutto), weg: `Bei ${eur(such.brutto)} brutto bleiben ${eur(such.netto)} netto.` },
      ],
      ohneZettel: true,
      versuchstabelle: true,
      versuche: nah,
      ziel,
    };
  }
  return null;
}
