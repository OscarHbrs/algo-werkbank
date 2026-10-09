// Webview-Panel neben dem Editor: Struktogramm-Editor, Ableitung, Syntaxbaum, Grammatik.
// Änderungen im Struktogramm werden als Bearbeitung des Dokuments übernommen (also auch mit Strg+Z rückgängig).
import * as vscode from 'vscode';
import { basename } from 'path';

const TITLES = { ns: 'Struktogramm', deriv: 'Ableitung', tree: 'Syntaxbaum', gram: 'Grammatik' };
const nameOf = (doc) => basename(doc.uri.path);
export const sourcePathOf = (doc) => doc.uri.scheme === 'file' ? doc.uri.fsPath : doc.uri.toString();

export class AlgoPanel {
  static current = null;

  static show(context, doc, tab = 'ns') {
    if (AlgoPanel.current) {
      AlgoPanel.current.setDocument(doc);
      AlgoPanel.current.panel.reveal(undefined, true);
      AlgoPanel.current.post({ type: 'tab', tab });
    } else {
      AlgoPanel.current = new AlgoPanel(context, doc, tab);
    }
    return AlgoPanel.current;
  }

  constructor(context, doc, tab) {
    this.context = context;
    this.doc = doc;
    this.disposables = [];
    const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
    this.panel = vscode.window.createWebviewPanel(
      'algoWerkbank', this.title(),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [dist] },
    );
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.html(tab);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document !== this.doc) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.postText(), 80);
      }),
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed?.document.languageId === 'algo') this.setDocument(ed.document);
      }),
    );
    this.panel.onDidDispose(() => {
      AlgoPanel.current = null;
      clearTimeout(this.timer);
      this.disposables.forEach((d) => d.dispose());
    });
  }

  title() { return `Algo: ${nameOf(this.doc)}`; }
  post(msg) { this.panel.webview.postMessage(msg); }

  setDocument(doc) {
    if (doc === this.doc) return;
    this.doc = doc;
    this.panel.title = this.title();
    this.post({ type: 'line', line: null });
    this.postText();
  }

  postText() {
    this.post({ type: 'text', text: this.doc.getText(), name: nameOf(this.doc) });
  }

  // Aktuelle Zeile beim Debuggen
  highlight(sourcePath, line) {
    if (sourcePathOf(this.doc) !== sourcePath) return;
    this.post({ type: 'line', line });
  }

  async onMessage(m) {
    if (m.type === 'ready') this.postText();
    else if (m.type === 'source') await this.applySource(m.text);
    else if (m.type === 'reveal') this.reveal(m.line);
  }

  // Nur den geänderten Bereich ersetzen, damit Cursor und Scrollposition im Editor erhalten bleiben.
  async applySource(text) {
    const doc = this.doc;
    if (doc.isClosed) return;
    const old = doc.getText();
    const target = doc.eol === vscode.EndOfLine.CRLF ? text.replace(/\n/g, '\r\n') : text;
    if (old === target) return;
    let p = 0;
    while (p < old.length && p < target.length && old[p] === target[p]) p++;
    let s = 0;
    while (s < old.length - p && s < target.length - p && old[old.length - 1 - s] === target[target.length - 1 - s]) s++;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(p), doc.positionAt(old.length - s)), target.slice(p, target.length - s));
    await vscode.workspace.applyEdit(edit);
  }

  reveal(line) {
    const ed = vscode.window.visibleTextEditors.find((e) => e.document === this.doc);
    if (!ed || !line || line > this.doc.lineCount) return;
    const text = this.doc.lineAt(line - 1);
    const pos = new vscode.Position(line - 1, text.firstNonWhitespaceCharacterIndex);
    ed.selection = new vscode.Selection(pos, pos);
    ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  html(tab) {
    const webview = this.panel.webview;
    const uri = (f) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', f));
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const tabs = Object.entries(TITLES).map(([id, label]) =>
      `<button role="tab" id="tab-${id}" aria-controls="view-${id}" aria-selected="false">${label}</button>`).join('');
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${uri('style.css')}">
<link rel="stylesheet" href="${uri('webview.css')}">
<title>Algo</title>
</head>
<body data-tab="${tab}">
<div class="wv">
  <nav class="tabs" role="tablist">${tabs}</nav>

  <div class="view" id="view-ns" role="tabpanel" aria-labelledby="tab-ns" hidden>
    <div class="ns-tools">
      <div class="palette" id="palette" aria-label="Bausteine"></div>
      <div class="ns-actions">
        <button class="btn" id="ns-edit" title="Bearbeiten (Doppelklick, Enter)">Bearbeiten</button>
        <button class="btn" id="ns-up" title="Nach oben (Alt+↑)">↑</button>
        <button class="btn" id="ns-down" title="Nach unten (Alt+↓)">↓</button>
        <button class="btn" id="ns-else" hidden>SONST hinzufügen</button>
        <button class="btn" id="ns-del" title="Löschen (Entf)">Löschen</button>
        <button class="btn" id="ns-undo" title="Rückgängig (Strg+Z)">Rückgängig</button>
      </div>
    </div>
    <p class="lead">Bausteine ins Struktogramm ziehen oder anklicken: Sie landen hinter dem ausgewählten Block. Doppelklick bearbeitet, am Griff ⠿ verschiebst du Blöcke. Der Code im Editor wird automatisch mitgeschrieben.</p>
    <div class="ns-scroll"><div id="ns" tabindex="0" aria-label="Struktogramm"></div></div>
  </div>

  <div class="view" id="view-deriv" role="tabpanel" aria-labelledby="tab-deriv" hidden>
    <p class="lead">Linksableitung vom Startsymbol &lt;Anweisung&gt; bis zum fertigen Programm, Schritt für Schritt wie auf den Folien.</p>
    <div class="deriv-controls">
      <button class="btn" id="d-first" title="Zum Anfang">⏮</button>
      <button class="btn" id="d-prev" title="Zurück">◀</button>
      <input type="range" id="d-range" min="0" value="0" aria-label="Ableitungsschritt">
      <button class="btn" id="d-next" title="Weiter">▶</button>
      <button class="btn" id="d-last" title="Zum Ende">⏭</button>
      <span class="d-count" id="d-count"></span>
    </div>
    <div class="d-rule" id="d-rule"></div>
    <pre class="d-form" id="d-form"></pre>
  </div>

  <div class="view" id="view-tree" role="tabpanel" aria-labelledby="tab-tree" hidden>
    <p class="lead">Ableitungsbaum: Nichtterminale als Knoten, Terminalsymbole als Blätter. ␣ steht für ein Leerzeichen, ↵ für einen Zeilenumbruch.</p>
    <div class="tree-scroll"><div id="tree"></div></div>
  </div>

  <div class="view" id="view-gram" role="tabpanel" aria-labelledby="tab-gram" hidden>
    <p class="lead">Die Syntaxdiagramme der Vorlesung in EBNF. Startsymbol: &lt;Anweisung&gt;. Zusätzlich zur Vorlesung gibt es die Vergleichsoperatoren &lt;= und &gt;=.</p>
    <div class="gram-scroll"><table class="grammar" id="grammar"></table></div>
    <ul class="rules">
      <li>Jede Einzelanweisung steht in einer eigenen Zeile. Leerzeilen gibt es nicht.</li>
      <li>Ein Programm beginnt ohne Einrückung. Jeder Rumpf steht genau zwei Leerzeichen tiefer.</li>
      <li>Zwischen den Teilen einer Anweisung steht genau ein Leerzeichen, am Zeilenende keines.</li>
      <li>Alle Werte sind Ganzzahlen. Division schneidet ab: 7 / 2 = 3, -7 / 2 = -3.</li>
      <li>Vergleiche: &lt;, &gt;, =, ≠ sowie &lt;= und &gt;= (Erweiterung, nicht aus der Vorlesung).</li>
      <li>Variablen werden vor der Verwendung mit DEKLARIERE bekannt gemacht.</li>
    </ul>
    <p class="alphabet"><span class="label">Σalgo</span> a … z · A B D E F G I K L N O R S T U W Z · 0 … 9 · + - * / &lt; = &gt; ≠ , : ␣ ↵</p>
  </div>

  <button class="wv-status" id="status" type="button"></button>
</div>
<script nonce="${nonce}" src="${uri('webview.js')}"></script>
</body>
</html>`;
  }
}
