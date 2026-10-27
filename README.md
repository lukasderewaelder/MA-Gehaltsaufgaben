# Lohnzettel-Werkstatt

Lohn- und Gehaltszettel für den Mathe-Unterricht (Klasse 8–10): angelehnt an eine übliche Entgeltabrechnung, aber stark vereinfacht und nachrechenbar. Statische Web-App ohne Build, offlinefähig (PWA), Speicher lokal im Browser (IndexedDB), Austausch per JSON-Sicherung. Alle Firmen und Personen sind erfunden – **kein echter Entgeltnachweis**.

## Stand

**M0 bis M5 fertig** (Rechenkern, Zettel-Editor, Bibliothek, Sicherung, Arbeits- und Lösungsblatt mit PDF, Zufallsfälle, Rückwärtsaufgaben, Vorführ- und Erklärmodus). Der Plan mit allen Meilensteinen steht in `C:\Users\luk-e\.claude\plans\plane-eine-interaktive-html-anwendung-frolicking-sloth.md`.

| Meilenstein | Inhalt | Stand |
|---|---|---|
| M0 | Gerüst, PWA, Rechenkern mit Tests | fertig |
| M1 | Zettel-Editor, Vorschau, Bibliothek, Sicherung | fertig |
| M2 | Lohnsteuertabelle als Anzeige, weitere Steuermodi verfeinern | teilweise (Posten, Zuschläge, Sonderzahlung, drei Steuermodi, Überschreiben sind schon drin; Tabelle steht im Beiblatt) |
| M3 | Arbeitsblatt/Lösungsblatt, Teilaufgaben, PDF/Teilen, Beiblatt Merkzettel | fertig |
| M4 | Zufallsfälle, Rückwärtsaufgaben | fertig |
| M5 | Vorführmodus, Erklärmodus (Marken 1–10) | fertig |
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
- **Zufallsfall** (Übersicht): drei Stufen – *leicht* (runde Zahlen, feste Prozentsätze), *mittel* (echte Sätze, Lohnsteuertabelle), *schwer* (Zuschläge, Sonderzahlung, alle Steuerklassen). Darunter einzeln schaltbar: runde Zahlen, Zuschläge, Sonderzahlung, Kirchensteuer, Kinder, Verdienst über der Beitragsgrenze, Minijob, Steuerklassen, Lohnsteuer-Art, Aufgabe (alles, Abzüge und Netto, Sozialversicherung, Steuern, Brutto). **Gleicher Startwert = gleicher Fall.** Bei mehreren **Gruppen** (A, B, …) bleiben Beruf, Firma, Posten und Steuerklasse gleich, nur die Zahlen und Namen ändern sich – für Klassenarbeiten. Im Editor erzeugt **Neu würfeln** einen neuen Fall mit denselben Einstellungen (mit Rückgängig).
- **Rückwärtsaufgaben** (Formular „Arbeitsblatt“ → Aufgabenrichtung): *Beitrag und Satz → Brutto* (alle Brutto-Werte sind Lücken), *Betrag und Stunden → Stundenlohn* (oder Stunden, Zuschlagssatz; Menge, Faktor und Prozentsatz sind als Lücken wählbar), *Netto und Abzugsquote → Brutto* und *Wunsch-Netto → nötiges Brutto durch Probieren* (diese beiden ohne Zettel, mit Versuchstabelle; das Lösungsblatt zeigt die Versuche).
- **Vorführen** (Knopf im Editor, `#/vorfuehren/<id>`): der Zettel groß für Beamer oder iPad. Gesuchte Werte sind blau verdeckt (Verdeckt: gesuchte Werte, alle Ergebnisse oder nichts) und werden durch Tippen aufgedeckt. Ein Tipp auf einen sichtbaren Wert zeigt den **Rechenweg in drei Schritten** (Zutaten gelb markiert, Rechnung, Ergebnis; „Weiter“ oder Pfeiltasten). Oben **Zoom** auf Kopf, Bezüge, Steuer und SV oder Ergebnis, **Vollbild** und **Erklärmodus**.
- **Erklärmodus** (Formular „Aussehen“, auch im Vorführmodus): nummerierte Marken (Grundzettel 1–10, mit zugeschalteten Blöcken mehr) und eine Legende in Schülersprache; wirkt auch im Arbeitsblatt, Lösungsblatt und PDF.

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

## iPad-Checkliste (M4 und M5)

1. Übersicht → *Zufallsfall*: Stufe wählen, 2 Gruppen, *Erzeugen*. Beide Zettel liegen in der Übersicht, Gruppe A und B haben denselben Aufbau.
2. Editor → *Aufgabenrichtung*: eine Rückwärtsaufgabe wählen, Arbeitsblatt und Lösungsblatt ansehen, PDF erstellen und teilen.
3. Editor → *Vorführen*: Werte antippen (aufdecken, Rechenweg), Zoom-Knöpfe, Erklärmodus, Vollbild (am iPad nur in neueren Safari-Versionen möglich).

## iPad-Checkliste (M1)

1. Seite im Safari öffnen, „Zum Home-Bildschirm“ → startet ohne Adressleiste.
2. Neuer Zettel aus Szenario; Felder bedienbar, Tastatur zeigt Ziffern (Dezimalkomma).
3. Wert im Zettel antippen → Dialog mit Rechenweg; ändern, „Wieder automatisch“.
4. Flugmodus an, App neu öffnen: läuft offline.
5. Sicherung erstellen → Teilen-Menü → in Dateien/OneDrive ablegen; Datei wieder einlesen.
