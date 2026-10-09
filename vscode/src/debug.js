// Debug-Adapter für Algo (Debug Adapter Protocol), läuft direkt im Extension-Host.
// Alles, was VS Code braucht (Datei lesen, Eingabe abfragen), kommt über `deps` herein – so ist er auch ohne VS Code testbar.
import {
  DebugSession, InitializedEvent, StoppedEvent, TerminatedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Breakpoint,
} from '@vscode/debugadapter';
import { check, execute, parseStatementText, parseConditionText } from '../../src/algo.js';
import { parseInputs, formatVars } from './runner.js';

const THREAD = 1;
const CHUNK = 20000;

export class AlgoDebugSession extends DebugSession {
  // deps: { readProgram(program) → Promise<{ text, name, sourcePath }>, askInput(name, line) → Promise<string|undefined>,
  //         onLine?(sourcePath, line|null), onRuntimeError?(sourcePath, error) }
  constructor(deps) {
    super();
    this.deps = deps;
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
    this.breakpoints = new Map(); // sourcePath -> Set(Zeile)
    this.configDone = new Promise((r) => { this.resolveConfigDone = r; });
    this.queue = [];
    this.vars = new Map();
    this.line = 1;
    this.steps = 0;
    this.terminated = false;
  }

  initializeRequest(response) {
    response.body = {
      supportsConfigurationDoneRequest: true,
      supportsEvaluateForHovers: true,
      supportsTerminateRequest: true,
    };
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  configurationDoneRequest(response, args) {
    super.configurationDoneRequest(response, args);
    this.resolveConfigDone();
  }

  async launchRequest(response, args) {
    await Promise.race([this.configDone, new Promise((r) => setTimeout(r, 1000))]);
    let src;
    try {
      src = await this.deps.readProgram(args.program);
    } catch {
      this.sendErrorResponse(response, 1, `Datei nicht gefunden: ${args.program}`);
      return;
    }
    const r = check(src.text);
    if (!r.ok) {
      const e = r.errors[0];
      this.sendErrorResponse(response, 2, `${src.name} ist kein gültiges Algo-Programm. Zeile ${e.line}: ${e.message}`);
      return;
    }
    const pre = parseInputs(args.eingaben ?? '');
    if (pre.error) {
      this.sendErrorResponse(response, 3, `Eingaben in der Startkonfiguration: ${pre.error}`);
      return;
    }
    this.queue = pre.values;
    this.sourcePath = src.sourcePath;
    this.source = new Source(src.name, src.sourcePath);
    this.it = execute(r.program);
    this.mode = args.stopOnEntry ? 'entry' : 'run';
    this.sendResponse(response);
    this.pump();
  }

  async setBreakPointsRequest(response, args) {
    const path = args.source.path;
    let stoppable = null;
    try {
      const src = await this.deps.readProgram(path);
      const r = check(src.text);
      if (r.program) stoppable = stoppableLines(r.program);
    } catch { /* Datei nicht lesbar: alle Haltepunkte annehmen */ }
    const set = new Set();
    const bps = (args.breakpoints ?? []).map((b) => {
      const ok = !stoppable || stoppable.has(b.line);
      if (ok) set.add(b.line);
      const bp = new Breakpoint(ok, b.line);
      if (!ok) bp.message = 'Hier kann nicht angehalten werden. Haltepunkte gehen auf Anweisungen, WENN/SOLANGE-Zeilen und SONST.';
      return bp;
    });
    this.breakpoints.set(path, set);
    response.body = { breakpoints: bps };
    this.sendResponse(response);
  }

  // --- Ausführung ---------------------------------------------------------
  pump() {
    if (this.terminated || this.waitingForInput) return;
    let budget = CHUNK;
    while (budget-- > 0) {
      let res;
      try {
        res = this.it.next(this.resumeValue);
      } catch (e) {
        if (e.kind !== 'laufzeit') throw e;
        this.runtimeError(e);
        return;
      }
      this.resumeValue = undefined;
      if (res.done) { this.finish(res.value); return; }
      const ev = res.value;
      if (ev.type === 'step') {
        this.steps++;
        this.line = ev.line;
        this.vars = ev.vars;
        if (this.mode === 'entry') { this.stop('entry'); return; }
        if (this.mode === 'step') { this.stop('step'); return; }
        if (this.pauseRequested) { this.pauseRequested = false; this.stop('pause'); return; }
        if (this.breakpoints.get(this.sourcePath)?.has(ev.line)) { this.stop('breakpoint'); return; }
      } else if (ev.type === 'output') {
        this.sendEvent(new OutputEvent(`${ev.value}\n`, 'stdout'));
      } else if (ev.type === 'input') {
        if (this.queue.length) {
          this.resumeValue = this.queue.shift();
          this.sendEvent(new OutputEvent(`${ev.name} ← ${this.resumeValue}\n`, 'console'));
        } else {
          this.ask(ev);
          return;
        }
      }
    }
    this.timer = setTimeout(() => this.pump(), 0);
  }

  async ask(ev) {
    this.waitingForInput = true;
    this.line = ev.line;
    this.deps.onLine?.(this.sourcePath, ev.line);
    const answer = await this.deps.askInput(ev.name, ev.line);
    this.waitingForInput = false;
    if (this.terminated) return;
    const { values, error } = parseInputs(answer ?? '');
    if (answer === undefined || error || !values.length) {
      this.sendEvent(new OutputEvent('Eingabe abgebrochen, Programm beendet.\n', 'console'));
      this.end();
      return;
    }
    this.resumeValue = values[0];
    this.queue.push(...values.slice(1));
    this.sendEvent(new OutputEvent(`${ev.name} ← ${this.resumeValue}\n`, 'console'));
    this.pump();
  }

  stop(reason, text) {
    this.deps.onLine?.(this.sourcePath, this.line);
    this.sendEvent(new StoppedEvent(reason, THREAD, text));
  }

  finish(vars) {
    this.vars = vars;
    this.sendEvent(new OutputEvent(`Fertig nach ${this.steps.toLocaleString('de-DE')} ${this.steps === 1 ? 'Schritt' : 'Schritten'}. Speicher: ${formatVars(vars)}\n`, 'console'));
    this.end();
  }

  runtimeError(e) {
    this.failed = true;
    this.line = e.line;
    this.sendEvent(new OutputEvent(`Laufzeitfehler in Zeile ${e.line}: ${e.message}\n`, 'stderr'));
    this.deps.onRuntimeError?.(this.sourcePath, e);
    this.stop('exception', e.message);
  }

  end() {
    if (this.terminated) return;
    this.terminated = true;
    clearTimeout(this.timer);
    this.deps.onLine?.(this.sourcePath, null);
    this.sendEvent(new TerminatedEvent());
  }

  resume(mode, response) {
    this.sendResponse(response);
    if (this.failed) { this.end(); return; }
    this.mode = mode;
    this.pump();
  }

  continueRequest(response) { response.body = { allThreadsContinued: true }; this.resume('run', response); }
  nextRequest(response) { this.resume('step', response); }
  stepInRequest(response) { this.resume('step', response); }
  stepOutRequest(response) { this.resume('step', response); }
  pauseRequest(response) { this.pauseRequested = true; this.sendResponse(response); }
  disconnectRequest(response) { this.end(); this.sendResponse(response); }
  terminateRequest(response) { this.end(); this.sendResponse(response); }

  // --- Zustand anzeigen ---------------------------------------------------
  threadsRequest(response) {
    response.body = { threads: [new Thread(THREAD, 'Algo')] };
    this.sendResponse(response);
  }

  stackTraceRequest(response) {
    response.body = { stackFrames: [new StackFrame(0, 'Programm', this.source, this.line, 1)], totalFrames: 1 };
    this.sendResponse(response);
  }

  scopesRequest(response) {
    response.body = { scopes: [new Scope('Speicher', 1, false)] };
    this.sendResponse(response);
  }

  variablesRequest(response) {
    response.body = {
      variables: [...this.vars].map(([name, v]) => ({
        name, value: v === undefined ? 'ohne Wert' : v.toString(), type: 'Ganzzahl', variablesReference: 0,
      })),
    };
    this.sendResponse(response);
  }

  // Hover, Überwachen und Debugkonsole: Werte, Ausdrücke (a + b) und Bedingungen (a > b)
  evaluateRequest(response, args) {
    const expr = args.expression.trim();
    try {
      response.body = { result: evaluate(expr, this.vars), variablesReference: 0 };
      this.sendResponse(response);
    } catch (e) {
      if (args.context === 'hover') { this.sendErrorResponse(response, 4, ''); return; }
      this.sendErrorResponse(response, 4, e.message);
    }
  }
}

function stoppableLines(program) {
  const lines = new Set();
  const walk = (b) => b.stmts.forEach((s) => {
    lines.add(s.line);
    if (s.kind === 'if') { walk(s.then); if (s.else) { lines.add(s.elseLine); walk(s.else); } }
    if (s.kind === 'while') walk(s.body);
  });
  walk(program.body);
  return lines;
}

function evaluate(expr, vars) {
  const value = (v) => {
    if (v.kind === 'int') return v.value;
    if (!vars.has(v.name)) throw new Error(`„${v.name}“ ist (noch) nicht deklariert.`);
    const x = vars.get(v.name);
    if (x === undefined) throw new Error(`„${v.name}“ hat noch keinen Wert.`);
    return x;
  };
  if (/ (<=|>=|<|>|=|≠) /.test(expr)) {
    const c = parseConditionText(expr);
    const a = value(c.left), b = value(c.right);
    const r = { '<': a < b, '>': a > b, '=': a === b, '≠': a !== b, '<=': a <= b, '>=': a >= b }[c.op];
    return r ? 'wahr' : 'falsch';
  }
  if (/^[a-z]+$/.test(expr) && vars.has(expr) && vars.get(expr) === undefined) return 'ohne Wert';
  const e = parseStatementText(`SETZE x AUF ${expr}`).expr;
  const a = value(e.left);
  if (!e.op) return a.toString();
  const b = value(e.right);
  if (e.op === '/' && b === 0n) throw new Error('Division durch 0.');
  return { '+': a + b, '-': a - b, '*': a * b, '/': b === 0n ? 0n : a / b }[e.op].toString();
}
