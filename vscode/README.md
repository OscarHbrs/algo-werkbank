# Algo für VS Code

Die Sprache **Algo** aus *Programmierung 1 – Aufbau von Programmiersprachen* (HBRS) in VS Code: mit allem, was die [Algo Werkbank](https://oscarhbrs.github.io/algo-werkbank/) im Browser kann.

## Funktionen

- **Hervorhebung und Einrückung** für `.algo`-Dateien: nach `WENN …:`, `SOLANGE …:` und `SONST:` geht es zwei Leerzeichen tiefer, `!=` wird beim Tippen zu `≠`.
- **Syntaxprüfung beim Tippen**: Fehler mit genauer Position und Erklärung im Editor und im Problems-Panel, Status „gültig / ungültig“ unten in der Statusleiste.
- **Ausführen** (▶ oben rechts oder `Strg+Enter`): läuft im Terminal, `LIES` fragt dort nach Zahlen. Mehrere Werte auf einmal eingeben geht auch (`18 12`). `Strg+C` bricht ab.
- **Schritt für Schritt** (`F10` oder ⤼ oben rechts): echter VS-Code-Debugger. Speicher im Variablen-Panel, Haltepunkte, Werte beim Überfahren mit der Maus, Ausdrücke wie `a - b` oder `a > b` unter „Überwachen“. `LIES` fragt über ein Eingabefeld.
- **Struktogramm-Editor** (Symbol oben rechts): Programm per Bausteine bauen, bearbeiten, verschieben und löschen; der Code wird mitgeschrieben und ist mit `Strg+Z` rückgängig zu machen. Beim Debuggen ist der aktuelle Block markiert.
- **Ableitung**, **Syntaxbaum** und **Grammatik** im selben Panel.
- **Beispiele**: `Algo: Beispiel öffnen` in der Befehlspalette (ggT, Fakultät, Primzahltest, …). Snippets für alle Anweisungen (`wenn`, `solange`, `setze`, …).

## Startkonfiguration (optional)

Für wiederholte Läufe mit denselben Eingaben in `.vscode/launch.json`:

```json
{
  "type": "algo",
  "request": "launch",
  "name": "ggT",
  "program": "${file}",
  "stopOnEntry": false,
  "eingaben": "18 12"
}
```

## Entwickeln

```
npm install
npm test            # Tests ohne VS Code
npm run test:vscode # Integrationstests in einer isolierten VS-Code-Instanz
npm run package     # erzeugt algo.vsix
```

Die Sprache selbst (`../src/algo.js`), der Struktogramm-Editor und die Darstellungen werden mit der Webseite geteilt.
