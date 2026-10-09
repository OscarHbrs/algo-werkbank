// Läuft innerhalb von VS Code.
const vscode = require('vscode');
const assert = require('assert');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(100); }
  throw new Error('Zeitüberschreitung: ' + what);
}

exports.run = async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri;
  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push(`✔ ${name}`); } catch (e) { results.push(`✖ ${name}: ${e.stack || e}`); }
  };

  const ggtUri = vscode.Uri.joinPath(root, 'ggt.algo');
  const fehlerUri = vscode.Uri.joinPath(root, 'fehler.algo');

  await check('Sprache wird erkannt und Erweiterung aktiviert', async () => {
    const doc = await vscode.workspace.openTextDocument(ggtUri);
    await vscode.window.showTextDocument(doc);
    assert.equal(doc.languageId, 'algo');
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'algo-werkbank');
    await until(() => ext.isActive, 'Aktivierung');
    const cmds = await vscode.commands.getCommands(true);
    for (const c of ['algo.run', 'algo.stepThrough', 'algo.showStructogram', 'algo.openExample']) assert.ok(cmds.includes(c), c);
  });

  await check('Syntaxfehler erscheinen als Diagnose mit Position', async () => {
    const doc = await vscode.workspace.openTextDocument(fehlerUri);
    await vscode.window.showTextDocument(doc);
    const diags = await until(() => { const d = vscode.languages.getDiagnostics(fehlerUri); return d.length && d; }, 'Diagnose');
    assert.equal(diags[0].range.start.line, 1);
    assert.match(diags[0].message, /Doppelpunkt/);
    assert.equal(diags[0].source, 'Algo');
  });

  await check('!= wird beim Tippen zu ≠', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'algo', content: 'DEKLARIERE a\nWENN a ' });
    const ed = await vscode.window.showTextDocument(doc);
    const end = doc.positionAt(doc.getText().length);
    ed.selection = new vscode.Selection(end, end);
    await vscode.commands.executeCommand('type', { text: '!' });
    await vscode.commands.executeCommand('type', { text: '=' });
    await until(() => doc.getText().endsWith('≠'), 'Ersetzung');
  });

  await check('Debugger: Haltepunkt, Variablen, Ausgabe', async () => {
    const doc = await vscode.workspace.openTextDocument(ggtUri);
    await vscode.window.showTextDocument(doc);
    vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(new vscode.Location(ggtUri, new vscode.Position(5, 0)))]);
    const messages = [];
    const tracker = vscode.debug.registerDebugAdapterTrackerFactory('algo', {
      createDebugAdapterTracker: () => ({ onDidSendMessage: (m) => messages.push(m) }),
    });
    let terminated = false;
    const sub = vscode.debug.onDidTerminateDebugSession(() => { terminated = true; });
    const ok = await vscode.debug.startDebugging(undefined, {
      type: 'algo', request: 'launch', name: 'Test', program: ggtUri.fsPath, stopOnEntry: false, eingaben: '18 12',
    });
    assert.ok(ok, 'Debugger startet');
    await until(() => messages.some((m) => m.event === 'stopped'), 'Halt am Haltepunkt');
    const session = vscode.debug.activeDebugSession;
    const st = await session.customRequest('stackTrace', { threadId: 1 });
    assert.equal(st.stackFrames[0].line, 6);
    const vars = await session.customRequest('variables', { variablesReference: 1 });
    assert.deepEqual(vars.variables.map((v) => `${v.name}=${v.value}`), ['a=18', 'b=12']);
    vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
    await session.customRequest('continue', { threadId: 1 });
    await until(() => terminated, 'Programmende');
    const out = messages.filter((m) => m.event === 'output').map((m) => m.body.output).join('');
    assert.match(out, /^6$/m);
    tracker.dispose(); sub.dispose();
  });

  await check('Struktogramm-Panel öffnet sich', async () => {
    const doc = await vscode.workspace.openTextDocument(ggtUri);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('algo.showStructogram');
    await until(() => vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => t.input instanceof vscode.TabInputWebview && t.label.startsWith('Algo:')), 'Webview-Tab');
  });

  await check('Ausführen öffnet ein Terminal', async () => {
    const doc = await vscode.workspace.openTextDocument(ggtUri);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('algo.run');
    await until(() => vscode.window.terminals.find((t) => t.name === 'Algo: ggt.algo'), 'Terminal');
  });

  console.log('\n' + results.join('\n') + '\n');
  if (results.some((r) => r.startsWith('✖'))) throw new Error('Tests fehlgeschlagen');
};
