# Algo Werkbank

Eine Web-Umgebung für **Algo**, die kleine Algorithmen-Sprache aus *Programmierung 1 – Aufbau von Programmiersprachen* (HBRS, WS 2026/27). Programme schreiben, auf Syntax prüfen, ausführen, Schritt für Schritt debuggen und die Ableitung nach der Grammatik ansehen.

## Funktionen

- **Syntaxprüfer** live beim Tippen: gültig (`w ∈ L(Algo)`) oder ungültig, mit Zeile, Spalte und einer Erklärung, was genau falsch ist (Alphabet, Syntax, Einrückung, Semantik).
- **Ausführen** mit Eingaben für `LIES` (vorab eintragen oder interaktiv) und Ausgaben von `GIB`.
- **Einzelschritt** (F10) mit markierter Zeile und Speicheransicht.
- **Struktogramm** (Nassi-Shneiderman) des Programms.
- **Ableitung**: Linksableitung vom Startsymbol `<Anweisung>` bis zum Programm. Für den ggT sind es wie auf den Folien 71 Schritte.
- **Syntaxbaum** und **Grammatik** (EBNF der Syntaxdiagramme).
- Editor mit Hervorhebung, automatischer Einrückung (2 Leerzeichen) und `!=` → `≠`.

## Sprache in Kürze

```
DEKLARIERE a, b
LIES a EIN
LIES b EIN
SOLANGE a ≠ b:
  WENN a > b:
    SETZE a AUF a - b
  SONST:
    SETZE b AUF b - a
  ENDE WENN
ENDE SOLANGE
GIB a AUS
```

- Anweisungen: `DEKLARIERE`, `SETZE … AUF …`, `LIES … EIN`, `GIB … AUS`, `WENN …:` / `SONST:` / `ENDE WENN`, `SOLANGE …:` / `ENDE SOLANGE`
- Bezeichner nur aus `a`–`z`, Werte nur Ganzzahlen (beliebig groß), ohne führende Nullen
- Ausdruck: `Wert` oder `Wert ␣ Op ␣ Wert` mit `+ - * /` (ganzzahlige Division, schneidet zur 0 hin ab)
- Bedingung: `Wert ␣ Op ␣ Wert` mit `< > = ≠ <= >=`
- Genau ein Leerzeichen zwischen den Teilen, jeder Rumpf zwei Leerzeichen tiefer, keine Leerzeilen

### Festlegungen, die über die Folien hinausgehen

- Zusätzliche Vergleichsoperatoren `<=` und `>=` (in der Vorlesung gibt es nur `< > = ≠`).

- Ein fehlender Zeilenumbruch am Dateiende wird ergänzt (Leerzeilen *am Ende* werden ignoriert).
- Semantik: Jede Variable muss vorher (im Text) deklariert sein und darf nur einmal deklariert werden.
- Laufzeitfehler: Lesen einer Variable ohne Wert, Division durch 0.
- Eingaben für `LIES` müssen Ganzzahlen nach L<sub>dez</sub> sein (z. B. `12`, `-3`, `0`).

## Starten

Statische Seite ohne Build-Schritt. Wegen ES-Modulen über einen lokalen Server öffnen:

```
python3 -m http.server 8000
```

dann http://localhost:8000.

## Tests

```
npm test
```

## Aufbau

- `src/algo.js` – Sprachkern: Alphabet- und Syntaxprüfung (rekursiver Abstieg inkl. Einrückung), Semantikprüfung, Interpreter als Generator, Ableitungsbaum
- `src/app.js` – Oberfläche
- `src/examples.js` – Beispielprogramme
- `test/` – Tests mit `node:test`
