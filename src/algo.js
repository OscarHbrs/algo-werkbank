// Algo – Sprachkern: Syntaxprüfung, semantische Prüfung, Ausführung und Ableitung.
// Grundlage: Programmierung 1, „Aufbau von Programmiersprachen“ (HBRS, WS 2026/27), Folien 33–44.

export const KEYWORDS = ['DEKLARIERE', 'SETZE', 'AUF', 'LIES', 'EIN', 'GIB', 'AUS', 'WENN', 'SONST', 'SOLANGE', 'ENDE'];
const STATEMENT_KEYWORDS = ['DEKLARIERE', 'SETZE', 'LIES', 'GIB', 'WENN', 'SOLANGE'];

// Σalgo (Folie 10)
const ALPHABET = new Set([
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'ABDEFGIKLNORSTUWZ',
  ...'0123456789',
  '+', '-', '*', '/', '<', '=', '>', '≠', ',', ':', ' ', '\n',
]);
const RECHENOPERATOREN = ['+', '-', '*', '/'];
const VERGLEICHSOPERATOREN = ['<', '>', '=', '≠'];
const isLower = (c) => c >= 'a' && c <= 'z';
const isDigit = (c) => c >= '0' && c <= '9';
const isUpper = (c) => c >= 'A' && c <= 'Z';

export class AlgoError extends Error {
  // kind: 'alphabet' | 'syntax' | 'semantik' | 'laufzeit'
  constructor(kind, message, line = null, col = null, length = 1) {
    super(message);
    this.kind = kind;
    this.line = line;
    this.col = col;
    this.length = length;
  }
}

// Zeilenenden vereinheitlichen. Ein fehlender Zeilenumbruch am Dateiende wird ergänzt,
// überzählige Leerzeilen am Ende entfernt – das erledigt jeder Editor ohnehin.
export function normalize(src) {
  let s = src.replace(/\r\n?/g, '\n');
  s = s.replace(/\n+$/, '');
  return s.length ? s + '\n' : '';
}

function lineCol(src, pos) {
  let line = 1, start = 0;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src[i] === '\n') { line++; start = i + 1; }
  }
  return { line, col: pos - start + 1 };
}

function alphabetHint(c) {
  if (c === '!') return 'Für „ungleich“ gibt es nur das Zeichen ≠.';
  if (c === '\t') return 'Tabulatoren sind nicht erlaubt. Eingerückt wird mit genau zwei Leerzeichen pro Ebene.';
  if (c === '(' || c === ')') return 'Klammern gibt es in Algo nicht. Ein Ausdruck hat höchstens einen Rechenoperator.';
  if (c === '_') return 'Bezeichner bestehen nur aus Kleinbuchstaben a–z.';
  if ('äöüßÄÖÜ'.includes(c)) return 'Umlaute und ß gehören nicht zum Alphabet. Schreibe z. B. „ae“ statt „ä“.';
  if (c === '"' || c === "'") return 'Zeichenketten gibt es in Algo nicht. Alle Werte sind Ganzzahlen.';
  if (c === '#') return 'Kommentare gibt es in Algo nicht.';
  if (c === '≤' || c === '≥') return 'Als Vergleichsoperatoren gibt es nur <, >, = und ≠.';
  if (c === '%') return 'Einen Modulo-Operator gibt es nicht. Rest von a durch b: erst a / b, dann mal b, dann von a abziehen.';
  if (c === '.') return 'Kommazahlen gibt es nicht. Alle Werte sind Ganzzahlen.';
  if (isUpper(c)) return `Großbuchstaben gibt es nur so weit, wie die Schlüsselwörter sie brauchen. „${c}“ kommt in keinem Schlüsselwort vor.`;
  if (isDigit(c) || isLower(c)) return '';
  return '';
}

function showChar(c) {
  if (c === '\t') return 'Tabulator';
  if (c === ' ') return 'Leerzeichen';
  return `„${c}“`;
}

export function checkAlphabet(src) {
  let line = 1, col = 1;
  for (const c of src) {
    if (!ALPHABET.has(c)) {
      const hint = alphabetHint(c);
      throw new AlgoError('alphabet',
        `Das Zeichen ${showChar(c)} gehört nicht zum Algo-Alphabet Σalgo.${hint ? ' ' + hint : ''}`, line, col);
    }
    if (c === '\n') { line++; col = 1; } else col++;
  }
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// ---------------------------------------------------------------------------
// Syntaxprüfung: rekursiver Abstieg direkt über den Zeichen, Einrückung inklusive.
// ---------------------------------------------------------------------------

class Parser {
  constructor(src) {
    this.s = src;
    this.pos = 0;
  }

  loc(pos = this.pos) { return lineCol(this.s, pos); }

  fail(message, pos = this.pos, length = 1) {
    // Fehler am Programmende auf das Ende der letzten Zeile legen.
    if (pos >= this.s.length) pos = Math.max(0, this.s.length - 1);
    const { line, col } = this.loc(pos);
    throw new AlgoError('syntax', message, line, col, length);
  }

  eof() { return this.pos >= this.s.length; }
  at(str, pos = this.pos) { return this.s.startsWith(str, pos); }

  // Beschreibt, was an einer Stelle steht – für Fehlermeldungen.
  found(pos = this.pos) {
    if (pos >= this.s.length) return 'das Programmende';
    const c = this.s[pos];
    if (c === '\n') return 'das Zeilenende';
    if (c === ' ') return 'ein Leerzeichen';
    let end = pos;
    const cls = (ch) => (isUpper(ch) || isLower(ch)) ? 'w' : isDigit(ch) ? 'd' : 'o';
    const k = cls(c);
    if (k === 'o') return `„${c}“`;
    while (end < this.s.length && cls(this.s[end]) === k) end++;
    return `„${this.s.slice(pos, end)}“`;
  }

  tokenLength(pos = this.pos) {
    let end = pos;
    while (end < this.s.length && this.s[end] !== ' ' && this.s[end] !== '\n') end++;
    return Math.max(1, end - pos);
  }

  expect(str, what) {
    if (this.at(str)) { this.pos += str.length; return; }
    // Gemeinsamen Anfang überspringen, damit der Fehler genau zeigt, wo es abweicht.
    let p = this.pos, i = 0;
    while (i < str.length && this.s[p] === str[i]) { p++; i++; }
    const rest = str.slice(i);
    if (rest[0] === '\n') {
      if (this.s[p] === ' ') this.fail(`Hier sollte die Zeile enden, gefunden: ein Leerzeichen. Leerzeichen am Zeilenende sind nicht erlaubt.`, p);
      this.fail(`Hier sollte die Zeile enden, gefunden: ${this.found(p)}.`, p, this.tokenLength(p));
    }
    if (rest[0] === ' ' && rest.trim() && this.s.startsWith(rest.trim(), p)) {
      this.fail(`${what} erwartet. Vor „${rest.trim()}“ fehlt ein Leerzeichen; gefunden: ${this.found(p)}.`, p, this.tokenLength(p));
    }
    this.fail(`${what} erwartet, gefunden: ${this.found(p)}.`, p, this.tokenLength(p));
  }

  indentAt(pos) {
    let n = 0;
    while (this.s[pos + n] === ' ') n++;
    return n;
  }

  lineAt(pos) { return this.loc(pos).line; }

  // <Anweisung> auf Einrückungsebene depth: eine Anweisung oder eine <Sequenz> aus mehreren.
  parseAnweisung(depth, owner) {
    const want = 2 * depth;
    const stmts = [];
    while (!this.eof()) {
      const lineStart = this.pos;
      const ind = this.indentAt(lineStart);
      if (this.s[lineStart + ind] === '\n') {
        this.fail('Leerzeilen sind in Algo nicht erlaubt. Jede Zeile enthält genau eine Anweisung.', lineStart, Math.max(1, ind));
      }
      if (ind < want) break; // Rumpf zu Ende, der umgebende Block übernimmt
      if (ind > want) {
        this.fail(depth === 0 && stmts.length === 0
          ? `Ein Programm beginnt ohne Einrückung. Gefunden: ${ind} Leerzeichen.`
          : `Zu tief eingerückt: erwartet ${want} Leerzeichen, gefunden ${ind}. Pro Block sind es genau zwei Leerzeichen mehr.`,
          lineStart, ind);
      }
      this.pos = lineStart + ind;
      stmts.push(this.parseStatement(depth));
    }
    if (stmts.length === 0) {
      if (depth === 0) this.fail('Das Programm ist leer. Ein Programm besteht aus mindestens einer Anweisung.', 0);
      const head = owner.kind === 'if' ? (owner.inElse ? 'SONST:' : 'WENN …:') : 'SOLANGE …:';
      if (this.eof()) this.fail(`Das Programm endet nach „${head}“ (Zeile ${owner.headLine}). Es fehlt der Rumpf mit mindestens einer Anweisung.`);
      this.fail(`Nach „${head}“ (Zeile ${owner.headLine}) fehlt der Rumpf: mindestens eine Anweisung, eingerückt mit ${want} Leerzeichen.`,
        this.pos, this.tokenLength(this.pos + this.indentAt(this.pos)) + this.indentAt(this.pos));
    }
    return { kind: 'block', depth, stmts };
  }

  parseStatement(depth) {
    const start = this.pos;
    const line = this.lineAt(start);
    let end = start;
    while (end < this.s.length && (isUpper(this.s[end]) || isLower(this.s[end]))) end++;
    const word = this.s.slice(start, end);

    switch (word) {
      case 'DEKLARIERE': {
        this.expect('DEKLARIERE ', '„DEKLARIERE␣“');
        const names = [this.parseBezeichner()];
        while (this.at(',')) {
          if (!this.at(', ')) this.fail('Nach dem Komma folgt genau ein Leerzeichen: „DEKLARIERE a, b“.', this.pos + 1);
          this.expect(', ', 'Komma und Leerzeichen „,␣“');
          names.push(this.parseBezeichner());
        }
        if (this.at(' ,')) this.fail('Vor dem Komma steht kein Leerzeichen. Schreibweise: „DEKLARIERE a, b“.');
        if (this.at(' ') && isLower(this.s[this.pos + 1] ?? '')) this.fail('Mehrere Bezeichner werden mit Komma und Leerzeichen getrennt: „DEKLARIERE a, b“.', this.pos + 1, this.tokenLength(this.pos + 1));
        this.expect('\n', 'Zeilenende');
        return { kind: 'decl', line, names };
      }
      case 'SETZE': {
        this.expect('SETZE ', '„SETZE␣“');
        const target = this.parseBezeichner();
        if (this.at(' ') && !this.at(' AUF ')) {
          const p = this.pos + 1;
          if (this.at(' AUF')) this.expect(' AUF ', '„␣AUF␣“');
          this.fail(`„AUF“ erwartet, gefunden: ${this.found(p)}. Schreibweise: „SETZE x AUF Ausdruck“.`, p, this.tokenLength(p));
        }
        this.expect(' AUF ', '„␣AUF␣“');
        const expr = this.parseAusdruck();
        this.expect('\n', 'Zeilenende');
        return { kind: 'assign', line, target, expr };
      }
      case 'LIES': {
        this.expect('LIES ', '„LIES␣“');
        const target = this.parseBezeichner();
        this.expect(' EIN\n', '„␣EIN“');
        return { kind: 'read', line, target };
      }
      case 'GIB': {
        this.expect('GIB ', '„GIB␣“');
        const value = this.parseWert();
        if (this.at(' ') && RECHENOPERATOREN.includes(this.s[this.pos + 1])) {
          this.fail('Ausgegeben wird genau ein Wert (Bezeichner oder Ganzzahl). Rechne vorher mit SETZE.', this.pos + 1);
        }
        this.expect(' AUS\n', '„␣AUS“');
        return { kind: 'write', line, value };
      }
      case 'WENN': {
        this.expect('WENN ', '„WENN␣“');
        const cond = this.parseBedingung();
        this.expectColon();
        const node = { kind: 'if', line, cond, then: null, else: null, elseLine: null, endLine: null };
        const owner = { kind: 'if', headLine: line, inElse: false };
        node.then = this.parseAnweisung(depth + 1, owner);
        this.expectCloser(depth, ['SONST:', 'ENDE WENN'], line, 'WENN');
        if (this.at('SONST')) {
          node.elseLine = this.lineAt(this.pos);
          this.expect('SONST:\n', '„SONST:“');
          owner.inElse = true;
          owner.headLine = node.elseLine;
          node.else = this.parseAnweisung(depth + 1, owner);
          this.expectCloser(depth, ['ENDE WENN'], line, 'WENN');
        }
        node.endLine = this.lineAt(this.pos);
        this.expect('ENDE WENN\n', '„ENDE WENN“');
        return node;
      }
      case 'SOLANGE': {
        this.expect('SOLANGE ', '„SOLANGE␣“');
        const cond = this.parseBedingung();
        this.expectColon();
        const node = { kind: 'while', line, cond, body: null, endLine: null };
        node.body = this.parseAnweisung(depth + 1, { kind: 'while', headLine: line });
        this.expectCloser(depth, ['ENDE SOLANGE'], line, 'SOLANGE');
        node.endLine = this.lineAt(this.pos);
        this.expect('ENDE SOLANGE\n', '„ENDE SOLANGE“');
        return node;
      }
      case 'SONST':
        this.fail('„SONST:“ ohne passendes „WENN“ auf derselben Einrückungsebene.', start, 5);
      case 'ENDE': {
        const what = this.at('ENDE WENN') ? '„ENDE WENN“ ohne passendes „WENN“'
          : this.at('ENDE SOLANGE') ? '„ENDE SOLANGE“ ohne passendes „SOLANGE“'
          : '„ENDE“ ohne passenden Blockanfang';
        this.fail(`${what} auf derselben Einrückungsebene.`, start, this.tokenLength(start));
      }
      default: {
        const len = Math.max(1, word.length || this.tokenLength(start));
        if (word && isUpper(word[0])) {
          const upper = word.toUpperCase();
          const best = KEYWORDS
            .map((k) => [k, editDistance(upper, k)])
            .sort((a, b) => a[1] - b[1])[0];
          if (STATEMENT_KEYWORDS.includes(upper) || KEYWORDS.includes(upper)) {
            this.fail(`Schlüsselwörter werden komplett großgeschrieben: „${upper}“.`, start, len);
          }
          if (best[1] <= 2) this.fail(`Unbekanntes Schlüsselwort „${word}“. Meintest du „${best[0]}“?`, start, len);
        }
        if (word && isLower(word[0])) {
          const upper = word.toUpperCase();
          if (KEYWORDS.includes(upper)) this.fail(`Schlüsselwörter werden großgeschrieben: „${upper}“.`, start, len);
          if (this.s.startsWith(' AUF ', end) || this.s.startsWith(' = ', end)) {
            this.fail(`Eine Zuweisung beginnt mit SETZE: „SETZE ${word} AUF …“.`, start, len);
          }
        }
        this.fail(`Eine Anweisung beginnt mit DEKLARIERE, SETZE, LIES, GIB, WENN oder SOLANGE. Gefunden: ${this.found(start)}.`, start, len);
      }
    }
  }

  expectColon() {
    if (this.at(':\n')) { this.pos += 2; return; }
    if (this.at(' :')) this.fail('Zwischen Bedingung und Doppelpunkt steht kein Leerzeichen.', this.pos);
    if (this.at('\n') || this.eof()) this.fail('Nach der Bedingung fehlt der Doppelpunkt „:“.', this.pos);
    if (this.at(':')) this.expect(':\n', 'Zeilenende nach „:“');
    if (this.at(' ') && RECHENOPERATOREN.includes(this.s[this.pos + 1])) {
      this.fail('Eine Bedingung vergleicht genau zwei Werte. Rechnungen sind darin nicht erlaubt – vorher mit SETZE ausrechnen.', this.pos + 1);
    }
    if (this.at(' ') && VERGLEICHSOPERATOREN.includes(this.s[this.pos + 1])) {
      this.fail('Eine Bedingung hat genau einen Vergleichsoperator.', this.pos + 1);
    }
    this.fail(`„:“ erwartet, gefunden: ${this.found()}.`, this.pos, this.tokenLength());
  }

  // Nach einem Rumpf muss die passende Endzeile (oder SONST:) auf Ebene depth folgen.
  expectCloser(depth, options, headLine, head) {
    const want = 2 * depth;
    const list = options.map((o) => `„${o}“`).join(' oder ');
    if (this.eof()) {
      this.fail(`Das Programm endet, aber ${list} fehlt (zu „${head}“ in Zeile ${headLine}).`);
    }
    const lineStart = this.pos;
    const ind = this.indentAt(lineStart);
    const textPos = lineStart + ind;
    const isCloser = options.some((o) => this.at(o.split(/[ :]/)[0], textPos));
    if (ind !== want) {
      if (isCloser) {
        const closer = this.s.slice(textPos).split('\n')[0];
        this.fail(`„${closer}“ muss genauso eingerückt sein wie das zugehörige „${head}“ in Zeile ${headLine}: ${want} Leerzeichen, gefunden ${ind}.`, lineStart, Math.max(1, ind));
      }
      this.fail(`Hier fehlt ${list} zu „${head}“ aus Zeile ${headLine}, eingerückt mit ${want} Leerzeichen.`, lineStart, Math.max(1, ind) );
    }
    this.pos = textPos;
    if (options.some((o) => this.at(o))) return;
    if (this.at('ENDE')) {
      const other = this.at('ENDE WENN') ? '„ENDE WENN“' : this.at('ENDE SOLANGE') ? '„ENDE SOLANGE“' : this.found();
      this.fail(`${list} erwartet (zu „${head}“ in Zeile ${headLine}), gefunden: ${other}.`, this.pos, this.tokenLength() + (this.at('ENDE ') ? 1 + this.tokenLength(this.pos + 5) : 0));
    }
    if (this.at('SONST')) {
      if (this.at('SONST\n') || this.at('SONST ')) this.fail('Nach „SONST“ folgt direkt ein Doppelpunkt: „SONST:“.', this.pos + 5);
      this.fail(`„SONST:“ ist hier nicht möglich: Zu „${head}“ (Zeile ${headLine}) gehört bereits ein SONST.`, this.pos, 5);
    }
    this.fail(`${list} erwartet (zu „${head}“ in Zeile ${headLine}), gefunden: ${this.found()}.`, this.pos, this.tokenLength());
  }

  parseBezeichner() {
    const start = this.pos;
    while (!this.eof() && isLower(this.s[this.pos])) this.pos++;
    if (this.pos === start) {
      const c = this.s[start];
      if (c !== undefined && isUpper(c)) {
        this.fail(`Bezeichner erwartet, gefunden: ${this.found(start)}. Bezeichner bestehen nur aus Kleinbuchstaben a–z.`, start, this.tokenLength(start));
      }
      if (c === ' ') this.fail('Bezeichner erwartet, gefunden: ein zusätzliches Leerzeichen. Zwischen den Teilen steht genau ein Leerzeichen.', start);
      this.fail(`Bezeichner erwartet, gefunden: ${this.found(start)}.`, start, this.tokenLength(start));
    }
    const next = this.s[this.pos];
    if (next !== undefined && (isUpper(next) || isDigit(next))) {
      this.fail(`Bezeichner bestehen nur aus Kleinbuchstaben a–z. „${next}“ ist darin nicht erlaubt.`, this.pos);
    }
    const { line, col } = this.loc(start);
    return { kind: 'var', name: this.s.slice(start, this.pos), line, col };
  }

  parseGanzzahl() {
    const start = this.pos;
    if (this.at('0')) {
      this.pos++;
      if (isDigit(this.s[this.pos] ?? '')) this.fail('Führende Nullen sind nicht erlaubt. Eine Ganzzahl beginnt mit 1–9 oder ist genau 0.', start);
      return { kind: 'int', value: 0n, text: '0', ...this.loc(start) };
    }
    let neg = false;
    if (this.at('-')) {
      neg = true;
      this.pos++;
      if (this.at('0')) this.fail('„-0“ ist keine gültige Ganzzahl. Nach dem Minus folgt eine Ziffer von 1 bis 9.', start, 2);
      if (this.at('-')) this.fail('Zwei Minuszeichen hintereinander sind nicht erlaubt.', start, 2);
      if (this.at(' ')) this.fail('Nach dem Minus einer Ganzzahl folgt direkt eine Ziffer. Für eine Rechnung: Wert ␣ - ␣ Wert, z. B. „a - b“.', start);
    }
    const digitsStart = this.pos;
    if (!/[1-9]/.test(this.s[this.pos] ?? '')) this.fail(`Ziffer erwartet, gefunden: ${this.found()}.`);
    while (!this.eof() && isDigit(this.s[this.pos])) this.pos++;
    const next = this.s[this.pos];
    if (next !== undefined && (isLower(next) || isUpper(next))) {
      this.fail('Nach einer Zahl darf kein Buchstabe folgen. Bezeichner bestehen nur aus Buchstaben.', this.pos);
    }
    const digits = this.s.slice(digitsStart, this.pos);
    const text = (neg ? '-' : '') + digits;
    return { kind: 'int', value: BigInt(text), text, ...this.loc(start) };
  }

  parseWert() {
    const c = this.s[this.pos];
    if (c !== undefined && isLower(c)) return this.parseBezeichner();
    if (c !== undefined && (isDigit(c) || c === '-')) return this.parseGanzzahl();
    if (c === ' ') this.fail('Wert erwartet, gefunden: ein zusätzliches Leerzeichen. Zwischen den Teilen steht genau ein Leerzeichen.');
    this.fail(`Wert erwartet (Bezeichner oder Ganzzahl), gefunden: ${this.found()}.`, this.pos, this.tokenLength());
  }

  parseAusdruck() {
    const left = this.parseWert();
    if (this.at(' ') && RECHENOPERATOREN.includes(this.s[this.pos + 1] ?? '')) {
      this.pos++;
      const op = this.s[this.pos];
      this.pos++;
      if (!this.at(' ')) {
        if (op === '-' && isDigit(this.s[this.pos] ?? '')) {
          this.fail('Nach dem Rechenoperator folgt ein Leerzeichen. „a -1“ ist nicht erlaubt: „a - 1“ oder „a + -1“.', this.pos);
        }
        this.fail(`Nach dem Rechenoperator „${op}“ folgt genau ein Leerzeichen.`, this.pos);
      }
      this.pos++;
      const right = this.parseWert();
      if (this.at(' ') && RECHENOPERATOREN.includes(this.s[this.pos + 1] ?? '')) {
        this.fail('Ein Ausdruck hat höchstens einen Rechenoperator. „a + b + 1“ geht nicht – Zwischenergebnis erst mit SETZE speichern.', this.pos + 1);
      }
      return { kind: 'expr', left, op, right };
    }
    if (!this.at(' ') && RECHENOPERATOREN.includes(this.s[this.pos] ?? '')) {
      this.fail('Vor und nach dem Rechenoperator steht genau ein Leerzeichen, z. B. „a - b“.', this.pos);
    }
    return { kind: 'expr', left, op: null, right: null };
  }

  parseBedingung() {
    const left = this.parseWert();
    if (!this.at(' ')) {
      if (VERGLEICHSOPERATOREN.includes(this.s[this.pos] ?? '')) this.fail('Vor und nach dem Vergleichsoperator steht genau ein Leerzeichen, z. B. „a ≠ b“.');
      if (this.at(':')) this.fail('Eine Bedingung vergleicht zwei Werte: Wert ␣ Vergleichsoperator ␣ Wert, z. B. „a > 0“.');
      this.fail(`Leerzeichen und Vergleichsoperator erwartet, gefunden: ${this.found()}.`, this.pos, this.tokenLength());
    }
    this.pos++;
    const op = this.s[this.pos];
    if (!VERGLEICHSOPERATOREN.includes(op ?? '')) {
      if (RECHENOPERATOREN.includes(op ?? '')) {
        this.fail(`Vergleichsoperator erwartet (<, >, =, ≠), gefunden: „${op}“. In Bedingungen wird nicht gerechnet – vorher mit SETZE ausrechnen.`);
      }
      this.fail(`Vergleichsoperator erwartet (<, >, = oder ≠), gefunden: ${this.found()}.`, this.pos, this.tokenLength());
    }
    this.pos++;
    if ((op === '<' || op === '>') && this.at('=')) this.fail('„<=“ und „>=“ gibt es nicht. Erlaubt sind nur <, >, = und ≠.', this.pos - 1, 2);
    if (op === '=' && this.at('=')) this.fail('Gleichheit wird mit einem einzelnen „=“ geprüft.', this.pos - 1, 2);
    if (!this.at(' ')) this.fail(`Nach dem Vergleichsoperator „${op}“ folgt genau ein Leerzeichen.`);
    this.pos++;
    const right = this.parseWert();
    return { kind: 'cond', left, op, right };
  }
}

export function parse(source) {
  const src = normalize(source);
  checkAlphabet(src);
  const p = new Parser(src);
  const body = p.parseAnweisung(0, null);
  return { kind: 'program', body, source: src };
}

// ---------------------------------------------------------------------------
// Semantische Prüfung: Variablen vor der Verwendung deklarieren, nicht doppelt.
// ---------------------------------------------------------------------------

export function checkSemantics(program) {
  const errors = [];
  const declared = new Map(); // name -> Zeile
  const use = (v) => {
    if (v.kind === 'var' && !declared.has(v.name)) {
      errors.push(new AlgoError('semantik',
        `„${v.name}“ ist nicht deklariert. Ergänze vorher „DEKLARIERE ${v.name}“.`, v.line, v.col, v.name.length));
    }
  };
  const block = (b) => b.stmts.forEach(stmt);
  function stmt(s) {
    switch (s.kind) {
      case 'decl':
        for (const v of s.names) {
          if (declared.has(v.name)) {
            errors.push(new AlgoError('semantik',
              `„${v.name}“ ist bereits deklariert (Zeile ${declared.get(v.name)}).`, v.line, v.col, v.name.length));
          } else declared.set(v.name, v.line);
        }
        break;
      case 'assign': use(s.target); use(s.expr.left); if (s.expr.right) use(s.expr.right); break;
      case 'read': use(s.target); break;
      case 'write': use(s.value); break;
      case 'if': use(s.cond.left); use(s.cond.right); block(s.then); if (s.else) block(s.else); break;
      case 'while': use(s.cond.left); use(s.cond.right); block(s.body); break;
    }
  }
  block(program.body);
  return errors;
}

// Komplette Prüfung: liefert { ok, program, errors }.
export function check(source) {
  let program;
  try {
    program = parse(source);
  } catch (e) {
    if (e instanceof AlgoError) return { ok: false, program: null, errors: [e] };
    throw e;
  }
  const errors = checkSemantics(program);
  return { ok: errors.length === 0, program, errors };
}

// ---------------------------------------------------------------------------
// Ausführung als Generator. Ereignisse:
//   { type: 'step', line, vars }          vor jeder Anweisung bzw. Bedingungsprüfung
//   { type: 'input', name, line }         erwartet eine BigInt über next(wert)
//   { type: 'output', value, line }
// Laufzeitfehler werden als AlgoError('laufzeit') geworfen.
// ---------------------------------------------------------------------------

export function* execute(program) {
  const vars = new Map(); // name -> BigInt | undefined (deklariert, noch ohne Wert)
  const snapshot = () => new Map(vars);
  const rt = (msg, node) => new AlgoError('laufzeit', msg, node.line, node.col ?? 1, node.name?.length ?? 1);

  const value = (v) => {
    if (v.kind === 'int') return v.value;
    if (!vars.has(v.name)) throw rt(`„${v.name}“ ist nicht deklariert.`, v);
    const x = vars.get(v.name);
    if (x === undefined) throw rt(`„${v.name}“ hat noch keinen Wert. Vorher „LIES ${v.name} EIN“ oder „SETZE ${v.name} AUF …“.`, v);
    return x;
  };
  const target = (v) => {
    if (!vars.has(v.name)) throw rt(`„${v.name}“ ist nicht deklariert.`, v);
  };
  const compare = (c) => {
    const a = value(c.left), b = value(c.right);
    switch (c.op) {
      case '<': return a < b;
      case '>': return a > b;
      case '=': return a === b;
      case '≠': return a !== b;
    }
  };
  const evaluate = (e) => {
    const a = value(e.left);
    if (!e.op) return a;
    const b = value(e.right);
    switch (e.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0n) throw rt('Division durch 0.', e.right.kind === 'var' ? e.right : { ...e.right, name: e.right.text });
        return a / b; // BigInt schneidet Nachkommastellen ab: 7 / 2 = 3, -7 / 2 = -3
    }
  };

  function* block(b) { for (const s of b.stmts) yield* stmt(s); }
  function* stmt(s) {
    yield { type: 'step', line: s.line, vars: snapshot() };
    switch (s.kind) {
      case 'decl':
        for (const v of s.names) vars.set(v.name, undefined);
        break;
      case 'assign':
        target(s.target);
        vars.set(s.target.name, evaluate(s.expr));
        break;
      case 'read': {
        target(s.target);
        const x = yield { type: 'input', name: s.target.name, line: s.line };
        if (typeof x !== 'bigint') throw rt('Eingabe abgebrochen.', s.target);
        vars.set(s.target.name, x);
        break;
      }
      case 'write':
        yield { type: 'output', value: value(s.value), line: s.line };
        break;
      case 'if':
        if (compare(s.cond)) yield* block(s.then);
        else if (s.else) {
          yield { type: 'step', line: s.elseLine, vars: snapshot() };
          yield* block(s.else);
        }
        break;
      case 'while': {
        let first = true;
        for (;;) {
          if (!first) yield { type: 'step', line: s.line, vars: snapshot() };
          first = false;
          if (!compare(s.cond)) break;
          yield* block(s.body);
        }
        break;
      }
    }
  }

  yield* block(program.body);
  return snapshot();
}

// Eingaben für LIES: eine Ganzzahl nach Ldez (Minus optional, ohne führende Nullen).
export function parseInteger(text) {
  const t = text.trim();
  if (!/^(0|-?[1-9][0-9]*)$/.test(t)) return null;
  return BigInt(t);
}

// ---------------------------------------------------------------------------
// Ableitungsbaum nach der Grammatik (Folien 33–44) und Linksableitung.
// Knoten: { nt, depth, children } | { t, depth }
// ---------------------------------------------------------------------------

export function derivationTree(program) {
  const T = (t, depth) => ({ t, depth });
  const N = (nt, depth, children) => ({ nt, depth, children });

  const buchstabe = (c, d) => N('Buchstabe', d, [T(c, d)]);
  const bezeichner = (v, d) => N('Bezeichner', d, [...v.name].map((c) => buchstabe(c, d)));
  const ganzzahl = (v, d) => {
    if (v.text === '0') return N('Ganzzahl', d, [T('0', d)]);
    const neg = v.text.startsWith('-');
    const digits = neg ? v.text.slice(1) : v.text;
    const kids = [];
    if (neg) kids.push(T('-', d));
    kids.push(T(digits[0], d));
    for (const c of digits.slice(1)) kids.push(N('Ziffer', d, [T(c, d)]));
    return N('Ganzzahl', d, kids);
  };
  const wert = (v, d) => N('Wert', d, [v.kind === 'var' ? bezeichner(v, d) : ganzzahl(v, d)]);
  const ausdruck = (e, d) => N('Ausdruck', d, e.op
    ? [wert(e.left, d), T(' ', d), N('Rechenoperator', d, [T(e.op, d)]), T(' ', d), wert(e.right, d)]
    : [wert(e.left, d)]);
  const bedingung = (c, d) => N('Bedingung', d,
    [wert(c.left, d), T(' ', d), N('Vergleichsoperator', d, [T(c.op, d)]), T(' ', d), wert(c.right, d)]);

  function anweisung(b, d) {
    if (b.stmts.length === 1) return einzeln(b.stmts[0], d);
    return N('Anweisung', d, [N('Sequenz', d, b.stmts.map((s) => einzeln(s, d)))]);
  }
  function einzeln(s, d) {
    const E = (nt, kids) => N('Anweisung', d, [N('Einzelanweisung', d, [N(nt, d, kids)])]);
    switch (s.kind) {
      case 'decl': {
        const kids = [T('DEKLARIERE ', d)];
        s.names.forEach((v, i) => { if (i) kids.push(T(', ', d)); kids.push(bezeichner(v, d)); });
        kids.push(T('\n', d));
        return E('Deklaration', kids);
      }
      case 'assign':
        return E('Zuweisung', [T('SETZE ', d), bezeichner(s.target, d), T(' AUF ', d), ausdruck(s.expr, d), T('\n', d)]);
      case 'read':
        return E('Eingabe', [T('LIES ', d), bezeichner(s.target, d), T(' EIN\n', d)]);
      case 'write':
        return E('Ausgabe', [T('GIB ', d), wert(s.value, d), T(' AUS\n', d)]);
      case 'if': {
        const kids = [T('WENN ', d), bedingung(s.cond, d), T(':\n', d), anweisung(s.then, d + 1)];
        if (s.else) kids.push(T('SONST:\n', d), anweisung(s.else, d + 1));
        kids.push(T('ENDE WENN\n', d));
        return N('Anweisung', d, [N('Selektion', d, kids)]);
      }
      case 'while':
        return N('Anweisung', d, [N('Iteration', d,
          [T('SOLANGE ', d), bedingung(s.cond, d), T(':\n', d), anweisung(s.body, d + 1), T('ENDE SOLANGE\n', d)])]);
    }
  }
  return anweisung(program.body, 0);
}

// Nichtterminale in Präorder = Reihenfolge der Linksableitung.
export function derivationOrder(tree) {
  const order = [];
  (function walk(n) {
    if (n.nt) { order.push(n); n.children.forEach(walk); }
  })(tree);
  order.forEach((n, i) => { n.index = i; });
  return order;
}

// Satzform nach `step` Ableitungsschritten als Liste von Teilstücken:
// { text, nt?: boolean, fresh?: boolean }. Einrückung wird am Zeilenanfang ergänzt.
export function sententialForm(tree, step) {
  const parts = [];
  let atLineStart = true;
  const emit = (text, depth, info) => {
    if (atLineStart && depth > 0) parts.push({ text: '  '.repeat(depth), indent: true, fresh: info.fresh });
    atLineStart = text.endsWith('\n');
    parts.push({ text, ...info });
  };
  (function walk(n, fresh) {
    if (!n.nt) return emit(n.t, n.depth, { fresh });
    if (n.index >= step) return emit(`<${n.nt}>`, n.depth, { nt: true, fresh });
    const childFresh = n.index === step - 1;
    n.children.forEach((c) => walk(c, childFresh));
  })(tree, false);
  return parts;
}

// Die im Schritt `step` (1-basiert) angewandte Regel als Text, z. B. „<Wert> → <Bezeichner>“.
export function productionAt(order, step) {
  const n = order[step - 1];
  const rhs = n.children.map((c) => c.nt ? `<${c.nt}>` : c.t.replace(/ /g, '␣').replace(/\n/g, '↵')).join(' ');
  return `<${n.nt}> → ${rhs}`;
}

// ---------------------------------------------------------------------------
// Grammatik in EBNF (Folien 33–44), für die Referenz in der Oberfläche.
// ---------------------------------------------------------------------------

export const GRAMMAR = [
  ['Anweisung', '<Einzelanweisung> | <Sequenz> | <Selektion> | <Iteration>'],
  ['Einzelanweisung', '<Deklaration> | <Zuweisung> | <Eingabe> | <Ausgabe>'],
  ['Sequenz', '<Anweisung> <Anweisung> { <Anweisung> }'],
  ['Deklaration', 'DEKLARIERE␣ <Bezeichner> { ,␣ <Bezeichner> } ↵'],
  ['Zuweisung', 'SETZE␣ <Bezeichner> ␣AUF␣ <Ausdruck> ↵'],
  ['Eingabe', 'LIES␣ <Bezeichner> ␣EIN↵'],
  ['Ausgabe', 'GIB␣ <Wert> ␣AUS↵'],
  ['Selektion', 'WENN␣ <Bedingung> :↵ ␣␣<Anweisung> [ SONST:↵ ␣␣<Anweisung> ] ENDE␣WENN↵'],
  ['Iteration', 'SOLANGE␣ <Bedingung> :↵ ␣␣<Anweisung> ENDE␣SOLANGE↵'],
  ['Bedingung', '<Wert> ␣ <Vergleichsoperator> ␣ <Wert>'],
  ['Ausdruck', '<Wert> [ ␣ <Rechenoperator> ␣ <Wert> ]'],
  ['Wert', '<Bezeichner> | <Ganzzahl>'],
  ['Bezeichner', '<Buchstabe> { <Buchstabe> }'],
  ['Buchstabe', 'a | … | z'],
  ['Ganzzahl', '0 | [ - ] ( 1 | … | 9 ) { <Ziffer> }'],
  ['Ziffer', '0 | … | 9'],
  ['Rechenoperator', '+ | - | * | /'],
  ['Vergleichsoperator', '< | > | = | ≠'],
];
