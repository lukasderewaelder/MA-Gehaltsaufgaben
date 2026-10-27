// Abrechnung eines Monats: Posten -> Brutto -> Steuer und Sozialversicherung -> Netto -> Auszahlung.
// Jedes Feld kann überschrieben werden (fall.ueberschreibungen); abhängige Felder rechnen mit dem überschriebenen Wert weiter.
// Zu jedem Feld liefert `weg` den Rechenweg als Text (für Lösungsblatt und Vorführmodus).
import { POSTEN_TYPEN } from '../model.js';
import { bpOf, fmtBp, fmtCents, mul } from './money.js';
import { ratesFor } from './rates.js';
import { sozialversicherung } from './sv.js';
import { soliJahr, steuerabzuege } from './tax.js';

const eur = (c) => `${fmtCents(c)} €`;
const menge = (m) => fmtCents(m);

/** Betrag eines Postens in Cent und sein Rechenweg. */
export function postenBetrag(p) {
  const art = POSTEN_TYPEN[p.typ]?.art ?? 'pauschal';
  if (art === 'pauschal') return { betrag: p.faktor, text: `${eur(p.faktor)}` };
  const grund = mul(p.faktor, p.menge, 100);
  if (art === 'menge') return { betrag: grund, text: `${menge(p.menge)} ${p.einheit} · ${eur(p.faktor)} = ${eur(grund)}` };
  const betrag = mul(grund, p.prozent ?? 0, 10000);
  return {
    betrag,
    text: `${menge(p.menge)} ${p.einheit} · ${eur(p.faktor)} · ${fmtBp(p.prozent ?? 0)} % = ${eur(betrag)}`,
  };
}

export function berechne(fall) {
  const rates = ratesFor(fall.jahr);
  const ov = fall.ueberschreibungen ?? {};
  const weg = {};
  const werte = {};
  const feld = (id, berechnet, text) => {
    const geaendert = ov[id] !== undefined;
    weg[id] = { text, berechnet, ueberschrieben: geaendert };
    werte[id] = geaendert ? ov[id] : berechnet;
    return werte[id];
  };

  const minijob = fall.person.minijob;
  const posten = fall.posten.map((p) => {
    const rechnung = postenBetrag(p);
    const betrag = feld(`p:${p.id}`, rechnung.betrag, rechnung.text);
    return { ...p, betrag };
  });
  // Menge, Faktor und Prozentsatz stehen auf dem Zettel; sie lassen sich als Lücke wählen (Rückwärtsaufgaben), aber nicht überschreiben
  for (const p of posten) {
    const art = POSTEN_TYPEN[p.typ]?.art;
    if (art !== 'menge' && art !== 'zuschlag') continue;
    const zeig = (id, wert, text) => {
      weg[id] = { text, berechnet: wert, ueberschrieben: false, nurAnzeige: true };
      werte[id] = wert;
    };
    const prozentTeil = art === 'zuschlag' ? ` : ${fmtBp(p.prozent ?? 0)} %` : '';
    zeig(`m:${p.id}`, p.menge, `${eur(p.betrag)} : ${eur(p.faktor)}${prozentTeil} = ${menge(p.menge)} ${p.einheit}`);
    zeig(`f:${p.id}`, p.faktor, `${eur(p.betrag)} : ${menge(p.menge)} ${p.einheit}${prozentTeil} = ${eur(p.faktor)}`);
    if (art === 'zuschlag') zeig(`z:${p.id}`, p.prozent ?? 0, `${eur(p.betrag)} : (${menge(p.menge)} ${p.einheit} · ${eur(p.faktor)}) = ${fmtBp(p.prozent ?? 0)} %`);
  }
  const brutto = posten.filter((p) => p.bereich === 'brutto');
  const nettoPosten = posten.filter((p) => p.bereich === 'netto');
  const summe = (list, pred) => list.filter(pred).reduce((s, p) => s + p.betrag, 0);

  const gesamtBrutto = feld('gesamtBrutto', summe(brutto, () => true), 'Summe aller Bezüge');
  const stL = summe(brutto, (p) => p.st === 'L');
  const stS = summe(brutto, (p) => p.st === 'S');
  const svL = summe(brutto, (p) => p.sv === 'L');
  const svS = summe(brutto, (p) => p.sv === 'S');
  const stBrutto = feld('stBrutto', stL + stS, 'Bezüge, die versteuert werden müssen (ohne steuerfreie Anteile)');
  const stLaufend = Math.max(0, stBrutto - stS);

  // --- Sozialversicherung -----------------------------------------------------------------------
  const pauschalMinijob = minijob && gesamtBrutto <= rates.minijob;
  const sv = sozialversicherung({
    svLaufend: pauschalMinijob ? 0 : svL,
    svEinmalig: pauschalMinijob ? 0 : svS,
    monat: fall.monat,
    person: fall.person,
    rates,
  });
  const basisText = (id, wert, ohneGrenze) =>
    wert < ohneGrenze ? 'Bezüge, von denen Beiträge gezahlt werden' : 'Bezüge bis zur Beitragsbemessungsgrenze';
  const kvBrutto = feld('kvBrutto', sv.brutto.kv, basisText('kvBrutto', sv.brutto.kv, svL + svS + 1));
  const rvBrutto = feld('rvBrutto', sv.brutto.rv, basisText('rvBrutto', sv.brutto.rv, svL + svS + 1));
  const avBrutto = feld('avBrutto', sv.brutto.av, basisText('avBrutto', sv.brutto.av, svL + svS + 1));
  const pvBrutto = feld('pvBrutto', sv.brutto.pv, basisText('pvBrutto', sv.brutto.pv, svL + svS + 1));
  const beitrag = (id, basis, bp, name, nenner = 10000) =>
    feld(id, mul(basis, bp, nenner), `${name}: ${fmtBp(bp)} % von ${eur(basis)} = ${eur(mul(basis, bp, nenner))}`);
  const kv = beitrag('kv', kvBrutto, sv.saetze.kv, 'Krankenversicherung');
  const rv = beitrag('rv', rvBrutto, sv.saetze.rv, 'Rentenversicherung');
  const av = beitrag('av', avBrutto, sv.saetze.av, 'Arbeitslosenversicherung');
  const pv = beitrag('pv', pvBrutto, sv.saetze.pv, 'Pflegeversicherung');
  const svSumme = kv + rv + av + pv;
  const svAbzuege = feld('svAbzuege', svSumme, 'KV + RV + AV + PV');

  // --- Steuer -------------------------------------------------------------------------------------
  const st = steuerabzuege({
    stLaufend: pauschalMinijob ? 0 : stLaufend,
    stSonstig: pauschalMinijob ? 0 : stS,
    vorsorgeMonat: kv + rv + pv, // Arbeitslosenversicherung zählt nicht zur Vorsorgepauschale
    person: fall.person,
    steuer: fall.steuer,
    rates,
  });
  const lstText =
    st.modus === 'prozent'
      ? `${fmtBp(fall.steuer.prozent)} % von ${eur(st.prozentBasis ?? stBrutto)}`
      : st.modus === 'tabelle'
        ? `Tabelle, Steuerklasse ${fall.person.steuerklasse}, Zeile ${eur(st.tabelle?.von ?? 0)} bis ${eur(st.tabelle?.bis ?? 0)}${st.sonderLst ? ` plus Steuer auf den sonstigen Bezug (${eur(st.sonderLst)})` : ''}`
        : `Jahressteuer nach Tarif für ${st.zvE ?? 0} € zu versteuerndes Einkommen, geteilt durch 12`;
  const lst = feld('lst', st.lst, pauschalMinijob ? 'Minijob: pauschal vom Arbeitgeber' : lstText);
  // Wurde die Lohnsteuer von Hand geändert, rechnen Soli und Kirchensteuer mit diesem Wert weiter
  const lstVonHand = ov.lst !== undefined && !pauschalMinijob;
  const soliAuto = lstVonHand ? (fall.steuer.soli === false ? 0 : mul(soliJahr(Math.round((lst * 12) / 100), fall.person.steuerklasse, rates), 1, 12)) : st.soli;
  const kistAuto = lstVonHand ? (fall.person.konfession === 'keine' ? 0 : bpOf(lst, st.kistBp)) : st.kist;
  const soli = feld('soli', soliAuto, soliAuto === 0 ? 'Unterhalb der Freigrenze fällt kein Solidaritätszuschlag an' : `${fmtBp(rates.soliSatz)} % der Lohnsteuer (bzw. Milderungszone)`);
  const kist = feld('kist', kistAuto, kistAuto === 0 ? 'Keine Kirchensteuer (keine Konfession)' : `${fmtBp(st.kistBp)} % der Lohnsteuer`);
  const steuerAbzuege = feld('steuerAbzuege', lst + soli + kist, 'Lohnsteuer + Solidaritätszuschlag + Kirchensteuer');

  // --- Ergebnis -----------------------------------------------------------------------------------
  const netto = feld('netto', gesamtBrutto - steuerAbzuege - svAbzuege, `${eur(gesamtBrutto)} − ${eur(steuerAbzuege)} − ${eur(svAbzuege)}`);
  const nettoAbzuege = feld('nettoAbzuege', nettoPosten.reduce((s, p) => s + p.betrag, 0), 'Summe der Abzüge vom Netto');
  const auszahlung = feld('auszahlung', netto - nettoAbzuege, `${eur(netto)} − ${eur(nettoAbzuege)}`);

  // --- Arbeitgeber --------------------------------------------------------------------------------
  const agAnteil = feld('agAnteil', pauschalMinijob ? 0 : sv.agSumme, 'Arbeitgeberanteil der Sozialversicherung');
  const gesamtKosten = feld('gesamtKosten', gesamtBrutto + agAnteil, `${eur(gesamtBrutto)} + ${eur(agAnteil)}`);

  // --- Jahressummen (Annahme: in allen Monaten bis jetzt gleiches laufendes Brutto) ------------------
  const m = fall.monat;
  const kum = (id, laufendTeil, sonderTeil, text) => feld(id, laufendTeil * m + sonderTeil, text);
  const sonderLst = st.sonderLst ?? 0;
  const kumuliert = {
    brutto: kum('kumBrutto', gesamtBrutto - stS, stS, `${m} Monate`),
    stBrutto: kum('kumStBrutto', stLaufend, stS, `${m} Monate`),
    lst: kum('kumLst', lst - sonderLst, sonderLst, `${m} Monate`),
    soli: kum('kumSoli', soli, 0, `${m} Monate`),
    kist: kum('kumKist', kist, 0, `${m} Monate`),
    svBrutto: kum('kumSvBrutto', kvBrutto, 0, `${m} Monate`),
    kv: kum('kumKv', kv, 0, `${m} Monate`),
    rv: kum('kumRv', rv, 0, `${m} Monate`),
    av: kum('kumAv', av, 0, `${m} Monate`),
    pv: kum('kumPv', pv, 0, `${m} Monate`),
  };

  // Woraus sich ein Feld ergibt (für den Vorführmodus: „das brauchst du“)
  const pid = (list) => list.map((p) => `p:${p.id}`);
  const aus = {
    gesamtBrutto: pid(brutto),
    stBrutto: pid(brutto.filter((p) => p.st !== 'F')),
    kvBrutto: pid(brutto.filter((p) => p.sv !== 'F')),
    rvBrutto: pid(brutto.filter((p) => p.sv !== 'F')),
    avBrutto: pid(brutto.filter((p) => p.sv !== 'F')),
    pvBrutto: pid(brutto.filter((p) => p.sv !== 'F')),
    lst: ['stBrutto'],
    soli: ['lst'],
    kist: ['lst'],
    kv: ['kvBrutto'],
    rv: ['rvBrutto'],
    av: ['avBrutto'],
    pv: ['pvBrutto'],
    steuerAbzuege: ['lst', 'soli', 'kist'],
    svAbzuege: ['kv', 'rv', 'av', 'pv'],
    netto: ['gesamtBrutto', 'steuerAbzuege', 'svAbzuege'],
    nettoAbzuege: pid(nettoPosten),
    auszahlung: ['netto', 'nettoAbzuege'],
    agAnteil: ['kvBrutto', 'rvBrutto', 'avBrutto', 'pvBrutto'],
    gesamtKosten: ['gesamtBrutto', 'agAnteil'],
  };
  for (const p of posten) {
    const art = POSTEN_TYPEN[p.typ]?.art;
    if (art === 'menge') aus[`p:${p.id}`] = [`m:${p.id}`, `f:${p.id}`];
    if (art === 'zuschlag') aus[`p:${p.id}`] = [`m:${p.id}`, `f:${p.id}`, `z:${p.id}`];
    if (art === 'menge' || art === 'zuschlag') {
      aus[`f:${p.id}`] = [`p:${p.id}`, `m:${p.id}`];
      aus[`m:${p.id}`] = [`p:${p.id}`, `f:${p.id}`];
      if (art === 'zuschlag') {
        aus[`z:${p.id}`] = [`p:${p.id}`, `m:${p.id}`, `f:${p.id}`];
        aus[`f:${p.id}`].push(`z:${p.id}`);
        aus[`m:${p.id}`].push(`z:${p.id}`);
      }
    }
  }
  for (const [id, quellen] of Object.entries(aus)) if (weg[id]) weg[id].aus = quellen.filter((q) => weg[q]);

  return {
    rates,
    posten,
    bruttoPosten: posten.filter((p) => p.bereich === 'brutto'),
    nettoPosten: posten.filter((p) => p.bereich === 'netto'),
    gesamtBrutto,
    stBrutto,
    kvBrutto,
    rvBrutto,
    avBrutto,
    pvBrutto,
    lst,
    soli,
    kist,
    steuerAbzuege,
    kv,
    rv,
    av,
    pv,
    svAbzuege,
    netto,
    nettoAbzuege,
    auszahlung,
    agAnteil,
    gesamtKosten,
    kumuliert,
    saetze: sv.saetze,
    steuerDetail: st,
    minijobPauschal: pauschalMinijob,
    weg,
    werte,
  };
}

/** Prozent-Anteil eines Betrags am Brutto (z. B. Abgabenquote) in Basispunkten. */
export const quote = (teil, ganzes) => (ganzes > 0 ? Math.round((teil * 10000) / ganzes) : 0);
export { bpOf };
