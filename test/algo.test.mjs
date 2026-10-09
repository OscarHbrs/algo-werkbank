import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, execute, parseInteger, derivationTree, derivationOrder, sententialForm } from '../src/algo.js';

const GGT = `DEKLARIERE a, b
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
`;

function run(src, inputs = []) {
  const r = check(src);
  if (!r.ok) throw r.errors[0];
  const out = [];
  const it = execute(r.program);
  let next = it.next();
  while (!next.done) {
    const ev = next.value;
    if (ev.type === 'output') out.push(ev.value);
    next = ev.type === 'input' ? it.next(BigInt(inputs.shift())) : it.next();
  }
  return out;
}

const err = (src) => { const r = check(src); assert.equal(r.ok, false, 'sollte ungültig sein:\n' + src); return r.errors[0]; };

test('ggT aus den Folien: 18 und 12 ergibt 6', () => {
  assert.deepEqual(run(GGT, [18, 12]), [6n]);
});

test('Ableitung des ggT hat wie auf den Folien 71 Schritte', () => {
  const r = check(GGT);
  const tree = derivationTree(r.program);
  const order = derivationOrder(tree);
  assert.equal(order.length, 71);
  const final = sententialForm(tree, 71).map((p) => p.text).join('');
  assert.equal(final, GGT);
  const s21 = sententialForm(tree, 21).map((p) => p.text).join('');
  assert.equal(s21, 'DEKLARIERE a, b\nLIES a EIN\nLIES b EIN\nSOLANGE <Bedingung>:\n  <Anweisung>ENDE SOLANGE\n<Anweisung>');
});

test('Ganzzahlige Division schneidet ab', () => {
  assert.deepEqual(run('DEKLARIERE x\nSETZE x AUF 7 / 2\nGIB x AUS\nSETZE x AUF -7 / 2\nGIB x AUS\n'), [3n, -3n]);
});

test('einzelne Anweisung ist ein Programm, fehlender Zeilenumbruch am Ende wird ergänzt', () => {
  assert.deepEqual(run('GIB 1 AUS'), [1n]);
  assert.deepEqual(run('GIB -42 AUS\n\n'), [-42n]);
});

test('große Zahlen', () => {
  assert.deepEqual(run('DEKLARIERE x\nSETZE x AUF 99999999999 * 99999999999\nGIB x AUS'), [9999999999800000000001n]);
});

test('Syntaxfehler aus Folie 9', () => {
  assert.equal(err('DEKLARIERE anzahl\nSETZE anzahl AUF anzahl +\n').kind, 'syntax');
  assert.match(err('DEKLARIERE anzahl\nSETZE anzahl anzahl + 1\n').message, /AUF/);
});

test('Syntaxfehler mit Position', () => {
  const cases = [
    ['GIB a + b AUS', 1],
    ['DEKLARIERE a,b', 1],
    ['DEKLARIERE a , b', 1],
    ['DEKLARIERE a b', 1],
    ['DEKLARIERE Anzahl', 1],
    ['DEKLARIERE a1', 1],
    ['DEKLARIERE a\nSETZE a AUF a + 1 + 1', 2],
    ['DEKLARIERE a\nSETZE a AUF 007', 2],
    ['DEKLARIERE a\nSETZE a AUF -0', 2],
    ['DEKLARIERE a\nSETZE a AUF a -1', 2],
    ['DEKLARIERE a\nSETZE a AUF a-1', 2],
    ['DEKLARIERE a\nWENN a => 1:\n  GIB a AUS\nENDE WENN', 2],
    ['DEKLARIERE a\nWENN a >=1:\n  GIB a AUS\nENDE WENN', 2],
    ['DEKLARIERE a\nWENN a > 1\n  GIB a AUS\nENDE WENN', 2],
    ['DEKLARIERE a\nWENN a > 1 :\n  GIB a AUS\nENDE WENN', 2],
    ['DEKLARIERE a\nWENN a > 1:\nGIB a AUS\nENDE WENN', 3],
    ['DEKLARIERE a\nWENN a > 1:\n   GIB a AUS\nENDE WENN', 3],
    ['DEKLARIERE a\nWENN a > 1:\n  GIB a AUS', 3],
    ['DEKLARIERE a\nWENN a > 1:\n  GIB a AUS\nENDE SOLANGE', 4],
    ['DEKLARIERE a\nWENN a > 1:\n  GIB a AUS\n ENDE WENN', 4],
    ['DEKLARIERE a\n\nGIB a AUS', 2],
    ['GIB 1 AUS ', 1],
    ['  GIB 1 AUS', 1],
    ['SETZ a AUF 1', 1],
    ['gib 1 AUS', 1],
    ['ENDE WENN', 1],
    ['SONST:', 1],
    ['GIB 1 AUS\nSONST:\n  GIB 2 AUS\nENDE WENN', 2],
    ['DEKLARIERE a\nWENN a + 1 > 2:\n  GIB a AUS\nENDE WENN', 2],
    ['GIB (1) AUS', 1],
    ['DEKLARIERE a\nWENN a != 1:\n  GIB a AUS\nENDE WENN', 2],
    ['DEKLARIERE a\nWENN a > 1:\n  GIB a AUS\nSONST:\n  GIB 1 AUS\nSONST:\n  GIB 2 AUS\nENDE WENN', 6],
    ['DEKLARIERE a\nSOLANGE a > 1:\nENDE SOLANGE', 3],
    ['', 1],
  ];
  for (const [src, line] of cases) {
    const e = err(src);
    assert.equal(e.line, line, `${JSON.stringify(src)} → Zeile ${e.line}: ${e.message}`);
    console.log(`${JSON.stringify(src).padEnd(60)} ${e.kind} Z${e.line}:${e.col}  ${e.message}`);
  }
});

test('Semantik: nicht deklariert / doppelt', () => {
  assert.equal(err('GIB a AUS').kind, 'semantik');
  assert.equal(err('DEKLARIERE a\nDEKLARIERE a').kind, 'semantik');
  assert.equal(err('DEKLARIERE a, a').kind, 'semantik');
});

test('Laufzeitfehler', () => {
  assert.throws(() => run('DEKLARIERE a\nGIB a AUS'), /noch keinen Wert/);
  assert.throws(() => run('DEKLARIERE a\nSETZE a AUF 1 / 0'), /Division durch 0/);
});

test('Eingaben nach Ldez', () => {
  assert.equal(parseInteger(' 42 '), 42n);
  assert.equal(parseInteger('-7'), -7n);
  assert.equal(parseInteger('007'), null);
  assert.equal(parseInteger('-0'), null);
  assert.equal(parseInteger('1.5'), null);
});

import { EXAMPLES } from '../src/examples.js';
test('alle Beispiele sind gültig und laufen', () => {
  const expected = { ggt: [6n], fakultaet: [3628800n], summe: [5050n], maximum: [12n], prim: [1n], binaer: [1101n] };
  for (const ex of EXAMPLES) {
    const out = run(ex.code, ex.inputs.split(' '));
    if (expected[ex.id]) assert.deepEqual(out, expected[ex.id], ex.id);
    assert.ok(out.length > 0, ex.id);
  }
});

test('<= und >= (Erweiterung)', () => {
  const src = `DEKLARIERE a, b
LIES a EIN
LIES b EIN
WENN a >= b:
  GIB 1 AUS
SONST:
  GIB 0 AUS
ENDE WENN
WENN a <= b:
  GIB 1 AUS
SONST:
  GIB 0 AUS
ENDE WENN
`;
  assert.deepEqual(run(src, [5, 5]), [1n, 1n]);
  assert.deepEqual(run(src, [6, 5]), [1n, 0n]);
  assert.deepEqual(run(src, [4, 5]), [0n, 1n]);
  const tree = derivationTree(check(src).program);
  const order = derivationOrder(tree);
  assert.equal(sententialForm(tree, order.length).map((p) => p.text).join(''), src);
});

import { format, parseStatementText, parseConditionText } from '../src/algo.js';
test('format gibt Programme unverändert wieder aus', () => {
  for (const ex of EXAMPLES) assert.equal(format(check(ex.code).program), ex.code, ex.id);
});
test('einzelne Zeilen für den Struktogramm-Editor', () => {
  assert.equal(parseStatementText('  SETZE a AUF a - b ').kind, 'assign');
  assert.deepEqual(parseStatementText('DEKLARIERE a, b').names.map((n) => n.name), ['a', 'b']);
  assert.throws(() => parseStatementText('WENN a > b:'), /Bausteine/);
  assert.throws(() => parseStatementText('SETZE a AUF a +'), AlgoErrorLike);
  assert.equal(parseConditionText('a >= 0').op, '>=');
  assert.equal(parseConditionText('WENN a ≠ b:').op, '≠');
  assert.throws(() => parseConditionText('a + 1 > b'));
});
function AlgoErrorLike(e) { return e.kind === 'syntax'; }
