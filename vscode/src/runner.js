// Ausführen im Terminal (Pseudoterminal). Ohne VS-Code-Abhängigkeit, damit testbar.
import { execute, parseInteger } from '../../src/algo.js';

const C = { bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', reset: '\x1b[0m' };
const CHUNK = 20000;

export function parseInputs(text) {
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean);
  const values = [];
  for (const t of tokens) {
    const v = parseInteger(t);
    if (v === null) return { error: `„${t}“ ist keine Ganzzahl (z. B. 12, -3 oder 0, ohne führende Nullen).` };
    values.push(v);
  }
  return { values };
}

export function formatVars(vars) {
  if (!vars?.size) return '(keine Variablen)';
  return [...vars].map(([n, v]) => `${n} = ${v === undefined ? 'ohne Wert' : v}`).join(', ');
}

export class TerminalRun {
  constructor(program, name, { write, onExit, onRuntimeError, schedule = (f) => setTimeout(f, 0) }) {
    this.it = execute(program);
    this.name = name;
    this.write = (s) => write(s.replace(/\n/g, '\r\n'));
    this.onExit = onExit;
    this.onRuntimeError = onRuntimeError;
    this.schedule = schedule;
    this.queue = [];
    this.waiting = null;
    this.buf = '';
    this.steps = 0;
    this.vars = new Map();
    this.finished = false;
    this.resume = undefined;
  }

  start() {
    this.write(`${C.dim}Algo ▶ ${this.name}   (Strg+C bricht ab)${C.reset}\n\n`);
    this.pump();
  }

  pump() {
    if (this.finished) return;
    let budget = CHUNK;
    while (budget-- > 0) {
      let res;
      try {
        res = this.it.next(this.resume);
      } catch (e) {
        if (e.kind !== 'laufzeit') throw e;
        this.write(`\n${C.red}Laufzeitfehler in Zeile ${e.line}: ${e.message}${C.reset}\n`);
        this.write(`${C.dim}Speicher: ${formatVars(this.vars)}${C.reset}\n`);
        this.onRuntimeError?.(e);
        return this.end();
      }
      this.resume = undefined;
      if (res.done) {
        this.write(`\n${C.green}Fertig nach ${this.steps.toLocaleString('de-DE')} ${this.steps === 1 ? 'Schritt' : 'Schritten'}.${C.reset}\n`);
        this.write(`${C.dim}Speicher: ${formatVars(res.value)}${C.reset}\n`);
        return this.end();
      }
      const ev = res.value;
      if (ev.type === 'step') { this.steps++; this.vars = ev.vars; }
      else if (ev.type === 'output') this.write(`${C.bold}${ev.value}${C.reset}\n`);
      else if (ev.type === 'input') {
        if (this.queue.length) {
          this.resume = this.queue.shift();
          this.write(`${C.dim}${ev.name} ← ${this.resume}${C.reset}\n`);
        } else {
          this.waiting = ev;
          this.prompt();
          return;
        }
      }
    }
    this.timer = this.schedule(() => this.pump());
  }

  prompt() {
    this.buf = '';
    this.write(`${C.yellow}${this.waiting.name} = ${C.reset}`);
  }

  end() {
    this.finished = true;
    this.waiting = null;
    this.write(`${C.dim}Beliebige Taste schließt das Terminal.${C.reset}\n`);
  }

  stop(message = 'Abgebrochen.') {
    if (this.finished) return;
    clearTimeout(this.timer);
    this.write(`\n${C.red}${message}${C.reset}\n`);
    this.end();
  }

  // Rohe Tastatureingaben aus dem Terminal
  input(data) {
    if (this.finished) { this.onExit?.(); return; }
    if (data.includes('\x03')) { this.stop(); return; }
    if (!this.waiting || data.startsWith('\x1b')) return;
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') { this.submit(); if (!this.waiting) return; }
      else if (ch === '\x7f' || ch === '\b') {
        if (this.buf) { this.buf = this.buf.slice(0, -1); this.write('\b \b'); }
      } else if (ch >= ' ') { this.buf += ch; this.write(ch); }
    }
  }

  submit() {
    this.write('\n');
    const { values, error } = parseInputs(this.buf);
    if (error || !values.length) {
      this.write(`${C.red}${error ?? 'Bitte eine Ganzzahl eingeben.'}${C.reset}\n`);
      this.prompt();
      return;
    }
    this.resume = values[0];
    this.queue.push(...values.slice(1));
    this.waiting = null;
    this.pump();
  }
}
