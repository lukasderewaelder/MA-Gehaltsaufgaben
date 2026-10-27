# Lohnzettel-Werkstatt

Lohn- und Gehaltszettel für den Mathe-Unterricht (Klasse 8–10): angelehnt an eine übliche Entgeltabrechnung, aber stark vereinfacht und nachrechenbar. Statische Web-App ohne Build, offlinefähig (PWA), Speicher lokal im Browser (IndexedDB), Austausch per JSON-Sicherung. Alle Firmen und Personen sind erfunden – **kein echter Entgeltnachweis**.

## Stand

**M0 bis M3 fertig** (Rechenkern, Zettel-Editor mit Live-Vorschau, Bibliothek, Sicherung, Arbeits- und Lösungsblatt mit PDF). Der Plan mit allen Meilensteinen steht in `C:\Users\luk-e\.claude\plans\plane-eine-interaktive-html-anwendung-frolicking-sloth.md`.

| Meilenstein | Inhalt | Stand |
|---|---|---|
| M0 | Gerüst, PWA, Rechenkern mit Tests | fertig |
| M1 | Zettel-Editor, Vorschau, Bibliothek, Sicherung | fertig |
| M2 | Lohnsteuertabelle als Anzeige, weitere Steuermodi verfeinern | teilweise (Posten, Zuschläge, Sonderzahlung, drei Steuermodi, Überschreiben sind schon drin; Tabelle steht im Beiblatt) |
| M3 | Arbeitsblatt/Lösungsblatt, Teilaufgaben, PDF/Teilen, Beiblatt Merkzettel | fertig |
| M4 | Zufallsfälle, Rückwärtsaufgaben | offen |
| M5 | Vorführmodus, Erklärmodus (Marken 1–10) | offen |
| M6 | Jahresübersicht, Härtung, Barrierefreiheit | offen |

## Benutzung

- **Neuer Zettel** → leer oder aus einem von neun Szenarien (Verkäuferin, Azubi, Minijob, Handwerker mit Überstunden, Pflegekraft mit Zuschlägen, Steuerklasse III und V, Weihnachtsgeld, über der Beitragsgrenze).
- Links Eingaben (Firma, Person, Posten, Lohnsteuer-Art, Aussehen und weitere Blöcke), rechts der Zettel.
- **Auf einen Wert im Zettel tippen**: zeigt den Rechenweg und erlaubt, den Wert von Hand zu ändern (gelb markiert). Abhängige Felder rechnen mit dem neuen Wert weiter; so entstehen auch Zettel mit Fehlern.
- Lohnsteuer wahlweise nach **Tabelle** (Stufen von 50 €), **festem Prozentsatz** oder **rechnerisch nach Steuertarif** (§ 32a EStG).
- **Weitere Blöcke** (Standard aus): Verdienstbescheinigung, Netto-Abzüge, Arbeitgeberseite, Fehltage/Hinweise, Anschriften/Bank. **Optik**: modern oder originalgetreu (Matrixdruck-Stil).
- **Ansichten** über dem Zettel: *Zettel* (alles sichtbar, Werte antippen zum Ändern), *Arbeitsblatt* (gesuchte Werte leer) und *Lösungsblatt* (gesuchte Werte grün, mit Rechenweg). Dort schaltet ein Tipp auf einen Wert „gesucht“ um. Im Formular unter **Arbeitsblatt**: Blattart (Aufgabenblatt mit Zettel oder nur Zettel), Überschrift, Rechenzeilen, Beiblatt „Abzüge im Überblick“ (Sätze der Person, Beitragsbemessungsgrenzen, Lohnsteuertabelle als Ausschnitt), gesuchte Werte, einleitender Text und Text jeder Teilaufgabe (leer = automatisch).
- **PDF erstellen …**: Arbeitsblatt, Lösungsblatt oder beides in einer Datei (A4 hoch). Danach *Teilen* (am iPad, z. B. nach GoodNotes), *Herunterladen* oder *Öffnen*. Rot umrandete Seiten in der Vorschau sind zu voll (Zettel müsste unter 55 % schrumpfen).
- **Drucken** gibt die gerade gezeigte Ansicht aus (Zettel oder alle Seiten des Arbeits-/Lösungsblatts).
- **Sicherung** (Übersicht): alle Zettel als JSON-Datei erstellen, auf anderem Gerät einlesen (neuere Fassung gewinnt).

## Rechenkern (`src/calc/`)

- `rates.js`: Parameter je Jahr (derzeit **2026**), geprüft gegen § 32a EStG (gesetze-im-internet.de) und die Sozialversicherungs-Rechengrößen 2026. Ein weiteres Jahr braucht nur einen weiteren Eintrag (Steuerformel-Koeffizienten, Beitragssätze, Grenzen).
- `sv.js`: KV/RV/AV/PV mit Beitragsbemessungsgrenzen, Pflegeversicherung nach Kinderzahl, Sonderzahlung gegen die anteilige Jahresgrenze.
- `tax.js`: Einkommensteuertarif, Splitting (III), Klasse V/VI als Näherung, Soli (Freigrenze und Milderungszone), Kirchensteuer, kleine Lohnsteuertabelle, Sonderzahlung über die Jahresdifferenz.
- `payroll.js`: setzt alles zusammen, liefert zu jedem Feld einen Rechenweg-Text.

**Bewusste Vereinfachungen:** Vorsorgepauschale ohne Mindestansätze; Klasse V/VI als Näherung; Soli/Kirchensteuer in der Tabellenvariante ohne Kinderfreibetrag; Minijob ohne Arbeitnehmerabzüge; kein Übergangsbereich; die Jahressummen unterstellen gleiches laufendes Brutto in allen Monaten. Die Ergebnisse weichen von der amtlichen Lohnsteuertabelle um wenige Euro ab.

## Entwickeln

```bash
npm test                       # Unit-Tests (Rechenkern, Modell, Sicherung, Precache)
node tools/precache.mjs        # nach neuen/geänderten Dateien: sw.js aktualisieren (sonst schlägt npm test fehl)
node tools/serve.mjs 4180      # lokaler Server, http://localhost:4180/
```

Auf localhost ist der Service Worker aus (`?sw=1` schaltet ihn ein). Neue Dateien in `src/` oder `assets/` → `node tools/precache.mjs`.

## iPad-Checkliste (M1)

1. Seite im Safari öffnen, „Zum Home-Bildschirm“ → startet ohne Adressleiste.
2. Neuer Zettel aus Szenario; Felder bedienbar, Tastatur zeigt Ziffern (Dezimalkomma).
3. Wert im Zettel antippen → Dialog mit Rechenweg; ändern, „Wieder automatisch“.
4. Flugmodus an, App neu öffnen: läuft offline.
5. Sicherung erstellen → Teilen-Menü → in Dateien/OneDrive ablegen; Datei wieder einlesen.
