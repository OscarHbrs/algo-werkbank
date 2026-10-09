// VS-Code-Erweiterung für Algo.
import * as vscode from 'vscode';
import { basename } from 'path';
import { check } from '../../src/algo.js';
import { EXAMPLES } from '../../src/examples.js';
import { AlgoDebugSession } from './debug.js';
import { TerminalRun, parseInputs } from './runner.js';
import { AlgoPanel, sourcePathOf } from './panel.js';

const KIND = { alphabet: 'Alphabet', syntax: 'Syntax', semantik: 'Semantik', laufzeit: 'Laufzeit' };
const isAlgo = (doc) => doc?.languageId === 'algo';

export function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('algo');
  const runtimeDiagnostics = vscode.languages.createDiagnosticCollection('algo-laufzeit');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'workbench.actions.view.problems';
  context.subscriptions.push(diagnostics, runtimeDiagnostics, status);

  // --- Syntaxprüfung: Fehler im Editor und im Problems-Panel -----------------
  const toRange = (doc, e) => {
    const line = Math.max(0, Math.min((e.line ?? 1) - 1, doc.lineCount - 1));
    const text = doc.lineAt(line).text;
    const start = Math.min(Math.max(0, (e.col ?? 1) - 1), text.length);
    const end = Math.min(text.length, start + Math.max(1, e.length ?? 1));
    return new vscode.Range(line, start, line, Math.max(end, start));
  };

  function validate(doc) {
    if (!isAlgo(doc)) return;
    const r = check(doc.getText());
    diagnostics.set(doc.uri, r.errors.map((e) => {
      const d = new vscode.Diagnostic(toRange(doc, e), e.message, vscode.DiagnosticSeverity.Error);
      d.source = 'Algo';
      d.code = KIND[e.kind];
      return d;
    }));
    if (vscode.window.activeTextEditor?.document === doc) updateStatus(r);
  }

  function updateStatus(r) {
    if (!r) { status.hide(); return; }
    if (r.ok) {
      status.text = '$(pass) Algo: gültig';
      status.tooltip = 'w ∈ L(Algo): Das Programm gehört zur Sprache und kann ausgeführt werden.';
      status.backgroundColor = undefined;
    } else {
      const semantic = r.errors[0].kind === 'semantik';
      status.text = semantic ? '$(warning) Algo: nicht deklariert' : '$(error) Algo: ungültig';
      status.tooltip = `${semantic ? 'w ∈ L(Algo), aber nicht ausführbar' : 'w ∉ L(Algo)'}\nZeile ${r.errors[0].line}: ${r.errors[0].message}`;
      status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    status.show();
  }

  const timers = new Map();
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidCloseTextDocument((doc) => { diagnostics.delete(doc.uri); runtimeDiagnostics.delete(doc.uri); }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const doc = e.document;
      if (!isAlgo(doc)) return;
      runtimeDiagnostics.delete(doc.uri);
      replaceNotEqual(e);
      clearTimeout(timers.get(doc));
      timers.set(doc, setTimeout(() => validate(doc), 120));
    }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (isAlgo(ed?.document)) validate(ed.document); else updateStatus(null);
    }),
  );
  vscode.workspace.textDocuments.forEach(validate);
  if (isAlgo(vscode.window.activeTextEditor?.document)) validate(vscode.window.activeTextEditor.document);

  // „!=“ wird beim Tippen zu „≠“ – wie in der Werkbank
  function replaceNotEqual(e) {
    if (e.reason !== undefined) return; // nicht bei Rückgängig/Wiederholen
    for (const c of e.contentChanges) {
      if (c.text !== '=' || c.range.start.character === 0) continue;
      const start = c.range.start.translate(0, -1);
      const range = new vscode.Range(start, start.translate(0, 2));
      if (e.document.getText(range) !== '!=') continue;
      const ed = vscode.window.visibleTextEditors.find((x) => x.document === e.document);
      ed?.edit((b) => b.replace(range, '≠'), { undoStopBefore: false, undoStopAfter: false });
    }
  }

  function runtimeError(sourcePath, e) {
    const doc = vscode.workspace.textDocuments.find((d) => sourcePathOf(d) === sourcePath);
    if (!doc) return;
    const line = doc.lineAt(Math.min(e.line - 1, doc.lineCount - 1));
    const d = new vscode.Diagnostic(line.range, `Laufzeitfehler: ${e.message}`, vscode.DiagnosticSeverity.Error);
    d.source = 'Algo';
    d.code = 'Laufzeit';
    runtimeDiagnostics.set(doc.uri, [d]);
  }

  // --- Befehle ---------------------------------------------------------------
  function algoDocument(uri) {
    if (uri instanceof vscode.Uri) return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    const doc = vscode.window.activeTextEditor?.document;
    if (isAlgo(doc)) return doc;
    if (AlgoPanel.current) return AlgoPanel.current.doc;
    vscode.window.showWarningMessage('Öffne zuerst eine Algo-Datei (.algo).');
    return null;
  }

  function ensureValid(doc) {
    const r = check(doc.getText());
    if (r.ok) return r;
    const e = r.errors[0];
    vscode.window.showErrorMessage(`${basename(doc.uri.path)} ist nicht ausführbar. Zeile ${e.line}: ${e.message}`, 'Probleme anzeigen')
      .then((a) => a && vscode.commands.executeCommand('workbench.actions.view.problems'));
    return null;
  }

  const terminals = new Map(); // Dokument-URI -> Terminal
  function run(uri) {
    const doc = algoDocument(uri);
    if (!doc) return;
    const r = ensureValid(doc);
    if (!r) return;
    runtimeDiagnostics.delete(doc.uri);
    const key = doc.uri.toString();
    terminals.get(key)?.dispose();
    const write = new vscode.EventEmitter();
    const close = new vscode.EventEmitter();
    const name = basename(doc.uri.path);
    const sourcePath = sourcePathOf(doc);
    const session = new TerminalRun(r.program, name, {
      write: (s) => write.fire(s),
      onExit: () => close.fire(),
      onRuntimeError: (e) => runtimeError(sourcePath, e),
    });
    const terminal = vscode.window.createTerminal({
      name: `Algo: ${name}`,
      iconPath: new vscode.ThemeIcon('play'),
      pty: {
        onDidWrite: write.event,
        onDidClose: close.event,
        open: () => session.start(),
        close: () => session.stop('Terminal geschlossen.'),
        handleInput: (data) => session.input(data),
      },
    });
    terminals.set(key, terminal);
    terminal.show();
  }
  context.subscriptions.push(vscode.window.onDidCloseTerminal((t) => {
    for (const [k, v] of terminals) if (v === t) terminals.delete(k);
  }));

  function debug(uri, stopOnEntry) {
    const doc = algoDocument(uri);
    if (!doc || !ensureValid(doc)) return;
    vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(doc.uri), {
      type: 'algo', request: 'launch', name: stopOnEntry ? 'Algo: Schritt für Schritt' : 'Algo: Debuggen',
      program: sourcePathOf(doc), stopOnEntry,
    });
  }

  function panel(tab) {
    const doc = algoDocument();
    if (doc) AlgoPanel.show(context, doc, tab);
  }

  async function openExample() {
    const pick = await vscode.window.showQuickPick(
      EXAMPLES.map((e) => ({ label: e.title, description: `Eingaben z. B.: ${e.inputs}`, example: e })),
      { placeHolder: 'Beispielprogramm öffnen' },
    );
    if (!pick) return;
    const doc = await vscode.workspace.openTextDocument({ language: 'algo', content: pick.example.code });
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`${pick.example.title}: Passende Eingaben für LIES wären ${pick.example.inputs}.`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('algo.run', run),
    vscode.commands.registerCommand('algo.stepThrough', (uri) => debug(uri, true)),
    vscode.commands.registerCommand('algo.debug', (uri) => debug(uri, false)),
    vscode.commands.registerCommand('algo.showStructogram', () => panel('ns')),
    vscode.commands.registerCommand('algo.showDerivation', () => panel('deriv')),
    vscode.commands.registerCommand('algo.showTree', () => panel('tree')),
    vscode.commands.registerCommand('algo.showGrammar', () => panel('gram')),
    vscode.commands.registerCommand('algo.openExample', openExample),
    vscode.commands.registerCommand('algo.newFile', async () => {
      const doc = await vscode.workspace.openTextDocument({ language: 'algo', content: '' });
      await vscode.window.showTextDocument(doc);
    }),
  );

  // --- Debugger --------------------------------------------------------------
  async function readProgram(program) {
    const doc = vscode.workspace.textDocuments.find((d) => sourcePathOf(d) === program || d.uri.toString() === program)
      ?? await vscode.workspace.openTextDocument(/^[a-z]+:/.test(program) && !/^[a-zA-Z]:\\/.test(program) ? vscode.Uri.parse(program) : vscode.Uri.file(program));
    return { text: doc.getText(), name: basename(doc.uri.path), sourcePath: sourcePathOf(doc) };
  }

  function askInput(name, line) {
    return vscode.window.showInputBox({
      title: `LIES ${name} EIN (Zeile ${line})`,
      prompt: `Ganzzahl für ${name}. Mehrere Werte durch Leerzeichen trennen, die weiteren gehen an die nächsten LIES.`,
      placeHolder: 'z. B. 12',
      ignoreFocusOut: true,
      validateInput: (v) => {
        const { values, error } = parseInputs(v);
        if (error) return error;
        return values.length ? null : 'Bitte eine Ganzzahl eingeben.';
      },
    });
  }

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('algo', {
      resolveDebugConfiguration(folder, config) {
        if (!config.type && !config.request && !config.name) {
          const doc = vscode.window.activeTextEditor?.document;
          if (!isAlgo(doc)) return undefined;
          Object.assign(config, { type: 'algo', request: 'launch', name: 'Algo: Schritt für Schritt', program: sourcePathOf(doc), stopOnEntry: true });
        }
        if (!config.program) {
          return vscode.window.showErrorMessage('In der Startkonfiguration fehlt "program".').then(() => undefined);
        }
        return config;
      },
    }),
    vscode.debug.registerDebugAdapterDescriptorFactory('algo', {
      createDebugAdapterDescriptor: () => new vscode.DebugAdapterInlineImplementation(new AlgoDebugSession({
        readProgram,
        askInput,
        onLine: (sourcePath, line) => AlgoPanel.current?.highlight(sourcePath, line),
        onRuntimeError: runtimeError,
      })),
    }),
  );
}

export function deactivate() {}
