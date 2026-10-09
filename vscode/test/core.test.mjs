import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EXAMPLES } from '../../src/examples.js';

const require = createRequire(import.meta.url);
const { AlgoDebugSession, TerminalRun } = require('../dist/core.cjs');
const { check } = await import('../../src/algo.js');
const ggt = EXAMPLES.find((e) => e.id === 'ggt').code;
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');

test('Terminal: ggT mit interaktiver Eingabe, Tippfehler und Rücktaste', async () => {
  let out = '';
  let exited = false;
  const run = new TerminalRun(check(ggt).program, 'ggt.algo', { write: (s) => { out += s; }, onExit: () => { exited = true; }, schedule: setImmediate });
  run.start();
  assert.match(strip(out), /a = $/);
  run.input('1x'); run.input('\x7f'); run.input('\x7f'); run.input('abc\r');
  assert.match(strip(out), /„abc“ ist keine Ganzzahl/);
  run.input('18 12\r'); // zwei Werte auf einmal
  await new Promise((r) => setImmediate(r));
  const text = strip(out);
  assert.match(text, /b ← 12\n6\n/);
  assert.match(text, /Fertig nach 12 Schritten\.\nSpeicher: a = 6, b = 6/);
  run.input('x');
  assert.ok(exited);
});

test('Terminal: Endlosschleife lässt sich mit Strg+C abbrechen', async () => {
  let out = '';
  const prog = check('DEKLARIERE x\nSETZE x AUF 0\nSOLANGE x >= 0:\n  SETZE x AUF x + 1\nENDE SOLANGE\n').program;
  const run = new TerminalRun(prog, 't.algo', { write: (s) => { out += s; }, schedule: setImmediate });
  run.start();
  await new Promise((r) => setTimeout(r, 50));
  run.input('\x03');
  assert.match(strip(out), /Abgebrochen\./);
  assert.ok(run.finished);
});

test('Terminal: Laufzeitfehler', () => {
  let out = '';
  let err = null;
  const run = new TerminalRun(check('DEKLARIERE x\nGIB x AUS\n').program, 't.algo', { write: (s) => { out += s; }, onRuntimeError: (e) => { err = e; } });
  run.start();
  assert.match(strip(out), /Laufzeitfehler in Zeile 2: „x“ hat noch keinen Wert/);
  assert.equal(err.line, 2);
});

// --- Debugger über das Debug Adapter Protocol -----------------------------------
function client(text, { inputs = [] } = {}) {
  const asked = [];
  const lines = [];
  const session = new AlgoDebugSession({
    readProgram: async () => ({ text, name: 'ggt.algo', sourcePath: '/tmp/ggt.algo' }),
    askInput: async (name) => { asked.push(name); return inputs.shift(); },
    onLine: (p, l) => lines.push(l),
  });
  const events = [];
  const waiters = [];
  const pendingResponses = new Map();
  let seq = 1;
  session.onDidSendMessage((m) => {
    if (m.type === 'event') {
      events.push(m);
      waiters.filter((w) => w.event === m.event).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); });
    } else if (m.type === 'response') pendingResponses.get(m.request_seq)?.(m);
  });
  const request = (command, args = {}) => new Promise((resolve) => {
    const s = seq++;
    pendingResponses.set(s, resolve);
    session.handleMessage({ seq: s, type: 'request', command, arguments: args });
  });
  const waitFor = (event) => new Promise((resolve) => waiters.push({ event, resolve }));
  return { request, waitFor, events, asked, lines };
}

async function start(c, launch, breakpoints = []) {
  await c.request('initialize', { adapterID: 'algo', linesStartAt1: true, columnsStartAt1: true });
  await c.request('setBreakpoints', { source: { path: '/tmp/ggt.algo' }, breakpoints: breakpoints.map((line) => ({ line })) });
  await c.request('configurationDone');
  const stopped = c.waitFor('stopped');
  const r = await c.request('launch', { program: '/tmp/ggt.algo', ...launch });
  return { r, stopped };
}

const vars = async (c) => {
  const r = await c.request('variables', { variablesReference: 1 });
  return Object.fromEntries(r.body.variables.map((v) => [v.name, v.value]));
};
const line = async (c) => (await c.request('stackTrace', { threadId: 1 })).body.stackFrames[0].line;

test('Debugger: Schritt für Schritt mit Speicher und Eingabe', async () => {
  const c = client(ggt, { inputs: ['18 12'] });
  const { stopped } = await start(c, { stopOnEntry: true });
  assert.equal((await stopped).body.reason, 'entry');
  assert.equal(await line(c), 1);
  let s = c.waitFor('stopped'); await c.request('next', { threadId: 1 }); await s;
  assert.equal(await line(c), 2);
  assert.deepEqual(await vars(c), { a: 'ohne Wert', b: 'ohne Wert' });
  s = c.waitFor('stopped'); await c.request('next', { threadId: 1 }); await s;  // LIES a → Eingabe „18 12“
  s = c.waitFor('stopped'); await c.request('next', { threadId: 1 }); await s;  // LIES b nimmt 12 aus der Warteschlange
  assert.equal(await line(c), 4);
  assert.deepEqual(await vars(c), { a: '18', b: '12' });
  assert.deepEqual(c.asked, ['a']);
  const ev = (await c.request('evaluate', { expression: 'a - b', context: 'watch' })).body.result;
  assert.equal(ev, '6');
  assert.equal((await c.request('evaluate', { expression: 'a > b', context: 'watch' })).body.result, 'wahr');
  const done = c.waitFor('terminated');
  await c.request('continue', { threadId: 1 });
  await done;
  const out = c.events.filter((e) => e.event === 'output').map((e) => e.body.output).join('');
  assert.match(out, /^6$/m);
  assert.match(out, /Fertig nach 12 Schritten\. Speicher: a = 6, b = 6/);
  assert.equal(c.lines.at(-1), null);
});

test('Debugger: Haltepunkt in der Schleife und Eingaben aus der Startkonfiguration', async () => {
  const c = client(ggt);
  const { stopped } = await start(c, { stopOnEntry: false, eingaben: '18 12' }, [6, 8]);
  const s1 = await stopped;
  assert.equal(s1.body.reason, 'breakpoint');
  assert.equal(await line(c), 6);
  assert.deepEqual(await vars(c), { a: '18', b: '12' });
  const s = c.waitFor('stopped'); await c.request('continue', { threadId: 1 }); await s;
  assert.equal(await line(c), 8);
  assert.deepEqual(await vars(c), { a: '6', b: '12' });
  const bps = (await c.request('setBreakpoints', { source: { path: '/tmp/ggt.algo' }, breakpoints: [{ line: 9 }, { line: 7 }] })).body.breakpoints;
  assert.deepEqual(bps.map((b) => b.verified), [false, true]); // ENDE WENN nein, SONST ja
});

test('Debugger: Laufzeitfehler hält an der Zeile an', async () => {
  const c = client('DEKLARIERE x\nSETZE x AUF 1 / 0\n');
  const { stopped } = await start(c, { stopOnEntry: false });
  const s = await stopped;
  assert.equal(s.body.reason, 'exception');
  assert.match(s.body.text, /Division durch 0/);
  assert.equal(await line(c), 2);
});

test('Debugger: ungültiges Programm wird nicht gestartet', async () => {
  const c = client('GIB a + b AUS\n');
  const { r } = await start(c, {});
  assert.equal(r.success, false);
  assert.match(r.message, /Zeile 1/);
});
