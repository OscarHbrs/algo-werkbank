import { check, execute, parseInteger, derivationTree, derivationOrder, productionAt } from './algo.js';
import { sententialFormHTML, treeHTML, grammarHTML } from './views.js';
import { EXAMPLES } from './examples.js';
import { createStructogramEditor } from './structogram.js';

const $ = (sel) => document.querySelector(sel);
const ta = $('#src');
const hl = $('#hl');
const gutter = $('#gutter');
const statusEl = $('#status');
const consoleEl = $('#console');
const inputsEl = $('#inputs');
const askForm = $('#ask');
const askInput = $('#ask-input');
const askLabel = $('#ask-label');
const varsBody = $('#vars tbody');
const btnRun = $('#run');
const btnStep = $('#step');
const btnStop = $('#stop');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const store = {
  get(k) { try { return localStorage.getItem('algo.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('algo.' + k, v); } catch { /* ohne Speicher weiter */ } },
};

let result = null;        // letztes Ergebnis von check()
let session = null;       // laufende Ausführung
let runtimeError = null;  // { line } nach einem Laufzeitfehler
let currentLine = null;   // Zeile, an der die Ausführung gerade steht
const dirty = { ns: true, deriv: true, tree: true };

// ---------------------------------------------------------------------------
// Editor: Hervorhebung, Zeilennummern, Fehlermarkierung
// ---------------------------------------------------------------------------

const TOKEN = /(DEKLARIERE|SETZE|AUF|LIES|EIN|GIB|AUS|WENN|SONST|SOLANGE|ENDE)(?![A-Za-z])|([a-z]+)|(-?[0-9]+)|([+\-*/<>=≠])|([,:])/g;

function highlightLine(text, err) {
  const cls = new Array(text.length).fill('');
  let lead = 0;
  while (text[lead] === ' ') lead++;
  for (let i = 0; i < lead; i++) cls[i] = 'ig';
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(text))) {
    const c = m[1] ? 'kw' : m[2] ? '' : m[3] ? 'num' : m[4] ? 'op' : 'pun';
    for (let i = m.index; i < m.index + m[0].length; i++) cls[i] = c;
  }
  let html = '';
  let i = 0;
  // Fehler am Zeilenende (fehlendes Zeichen) als Markierung hinter dem Text zeigen
  const errStart = err ? err.col - 1 : -1;
  const errEnd = err ? errStart + err.length : -1;
  while (i < text.length) {
    const inErr = i >= errStart && i < errEnd;
    let j = i;
    while (j < text.length && cls[j] === cls[i] && (j >= errStart && j < errEnd) === inErr) j++;
    const chunk = text.slice(i, j);
    const classes = [cls[i], inErr ? 'squiggle' : '', inErr && !chunk.trim() ? 'ws' : ''].filter(Boolean).join(' ');
    html += classes ? `<span class="${classes}">${esc(chunk)}</span>` : esc(chunk);
    i = j;
  }
  if (err && errStart >= text.length) html += '<span class="squiggle ws"> </span>';
  return html;
}

function primaryError() {
  if (runtimeError) return { line: runtimeError.line, col: 1, length: 0, whole: true };
  return result && !result.ok ? result.errors[0] : null;
}

function renderEditor() {
  const lines = ta.value.split('\n');
  const errs = new Map();
  if (result && !result.ok) for (const e of result.errors) if (e.line && !errs.has(e.line)) errs.set(e.line, e);
  const rtLine = runtimeError?.line;
  let code = '';
  let nums = '';
  lines.forEach((text, idx) => {
    const n = idx + 1;
    const err = errs.get(n);
    const bad = err || rtLine === n;
    const cur = currentLine === n;
    const lc = ['ln', cur ? 'cur' : '', bad ? 'bad' : ''].filter(Boolean).join(' ');
    code += `<span class="${lc}">${highlightLine(text, err)}</span>`;
    nums += `<span class="${cur ? 'cur' : bad ? 'bad' : ''}">${n}</span>`;
  });
  hl.innerHTML = code;
  gutter.innerHTML = nums;
  syncScroll();
}

function syncScroll() {
  hl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  gutter.scrollTop = ta.scrollTop;
}

function offsetOf(line, col) {
  const lines = ta.value.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
  return off + Math.max(0, col - 1);
}

function jumpTo(line, col = 1, length = 0) {
  const start = offsetOf(line, col);
  ta.focus();
  ta.setSelectionRange(start, start + length);
  // Zeile in den sichtbaren Bereich holen
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
  const y = (line - 1) * lh;
  if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
  syncScroll();
}

function scrollLineIntoView(line) {
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
  const y = (line - 1) * lh;
  if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - lh * 2) {
    ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
    syncScroll();
  }
}

// ---------------------------------------------------------------------------
// Syntaxprüfer (Statuszeile)
// ---------------------------------------------------------------------------

const KIND = { alphabet: 'Alphabet', syntax: 'Syntax', semantik: 'Semantik', laufzeit: 'Laufzeit' };

function renderStatus() {
  if (result.ok) {
    statusEl.innerHTML = `<div class="verdict"><span class="pill ok">✓ gültig</span><span class="math">w ∈ L(Algo)</span><span>Das Programm gehört zur Sprache und kann ausgeführt werden.</span></div>`;
    return;
  }
  const first = result.errors[0];
  const semantic = first.kind === 'semantik';
  const head = semantic
    ? `<span class="pill bad">✗ nicht ausführbar</span><span class="math">w ∈ L(Algo)</span><span>Die Syntax stimmt, aber ${result.errors.length === 1 ? 'eine Variable ist' : 'Variablen sind'} nicht korrekt deklariert.</span>`
    : `<span class="pill bad">✗ ungültig</span><span class="math">w ∉ L(Algo)</span>`;
  const items = result.errors.map((e, i) => `
    <button class="err-item" data-err="${i}">
      <span class="err-pos">Z${e.line}:${e.col}</span>
      <span class="err-msg"><span class="err-kind">${KIND[e.kind]}:</span> ${esc(e.message)}</span>
    </button>`).join('');
  statusEl.innerHTML = `<div class="verdict">${head}</div>${items}`;
}

statusEl.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-err]');
  if (!b) return;
  const e = result.errors[+b.dataset.err];
  jumpTo(e.line, e.col, e.length);
});

function recheck() {
  result = check(ta.value);
  ns.sync(result.program, textFromNS);
  renderStatus();
  renderEditor();
  dirty.ns = dirty.deriv = dirty.tree = true;
  renderActiveView();
}

let checkTimer = null;
function onChange() {
  textFromNS = false;
  store.set('code', ta.value);
  if (session) stopSession('Programm geändert, Ausführung beendet.');
  runtimeError = null;
  currentLine = null;
  renderEditor();
  clearTimeout(checkTimer);
  checkTimer = setTimeout(recheck, 120);
}

// ---------------------------------------------------------------------------
// Editor-Tastatur: Tab, Enter mit Einrückung, != → ≠
// ---------------------------------------------------------------------------

function insertText(text) {
  ta.focus();
  if (!document.execCommand('insertText', false, text)) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    onChange();
  }
}

function lineBounds(pos) {
  const v = ta.value;
  const start = v.lastIndexOf('\n', pos - 1) + 1;
  let end = v.indexOf('\n', pos);
  if (end < 0) end = v.length;
  return [start, end];
}

function reindentSelection(dedent) {
  const v = ta.value;
  const [start] = lineBounds(ta.selectionStart);
  const selEnd = ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? ta.selectionEnd - 1 : ta.selectionEnd;
  const [, end] = lineBounds(selEnd);
  const block = v.slice(start, end);
  const changed = block.split('\n').map((l) => dedent ? l.replace(/^ {1,2}/, '') : '  ' + l).join('\n');
  ta.setSelectionRange(start, end);
  insertText(changed);
  ta.setSelectionRange(start, start + changed.length);
}

ta.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n');
    if (e.shiftKey || multi) reindentSelection(e.shiftKey);
    else insertText('  ');
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const [start] = lineBounds(ta.selectionStart);
    const before = ta.value.slice(start, ta.selectionStart);
    let indent = before.match(/^ */)[0];
    if (before.trimEnd().endsWith(':')) indent += '  ';
    insertText('\n' + indent);
  } else if (e.key === 'Backspace' && ta.selectionStart === ta.selectionEnd) {
    // In der Einrückung zwei Leerzeichen auf einmal löschen
    const [start] = lineBounds(ta.selectionStart);
    const before = ta.value.slice(start, ta.selectionStart);
    if (before.length >= 2 && /^ +$/.test(before) && before.length % 2 === 0) {
      e.preventDefault();
      ta.setSelectionRange(ta.selectionStart - 2, ta.selectionStart);
      if (!document.execCommand('delete')) {
        ta.setRangeText('', ta.selectionStart, ta.selectionEnd, 'end');
        onChange();
      }
    }
  }
});

ta.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'insertText' && e.data === '=' && ta.selectionStart === ta.selectionEnd && ta.value[ta.selectionStart - 1] === '!') {
    e.preventDefault();
    ta.setSelectionRange(ta.selectionStart - 1, ta.selectionStart);
    insertText('≠');
  }
});

ta.addEventListener('input', onChange);
ta.addEventListener('scroll', syncScroll);

document.querySelectorAll('[data-insert]').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // Fokus im Editor lassen
  b.addEventListener('click', () => insertText(b.dataset.insert));
});

// ---------------------------------------------------------------------------
// Ausführung
// ---------------------------------------------------------------------------

const CHUNK = 20000;
const MAX_CONSOLE = 4000;

function clearRunning() { consoleEl.querySelector('.c-run')?.remove(); }

function log(cls, html) {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html;
  consoleEl.appendChild(div);
  while (consoleEl.childElementCount > MAX_CONSOLE) consoleEl.firstElementChild.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

let shownVars = new Map();
function renderVars(vars) {
  if (!vars || vars.size === 0) {
    varsBody.innerHTML = '<tr class="empty"><td colspan="2">Noch keine Variablen deklariert.</td></tr>';
    shownVars = new Map();
    return;
  }
  let html = '';
  for (const [name, val] of vars) {
    const changed = shownVars.has(name) && shownVars.get(name) !== val;
    const v = val === undefined ? '<span class="unset">ohne Wert</span>' : esc(val.toString());
    html += `<tr class="${changed ? 'changed' : ''}"><td>${esc(name)}</td><td>${v}</td></tr>`;
  }
  varsBody.innerHTML = html;
  shownVars = new Map(vars);
}

function setCurrentLine(line) {
  currentLine = line;
  renderEditor();
  document.querySelectorAll('#ns [data-line].cur').forEach((el) => el.classList.remove('cur'));
  if (line != null) {
    document.querySelectorAll(`#ns [data-line="${line}"]`).forEach((el) => el.classList.add('cur'));
    scrollLineIntoView(line);
  }
}

function setRunning(on) {
  btnStop.disabled = !on;
  btnRun.textContent = on && session?.paused ? '▶ Weiter' : '▶ Ausführen';
}

function startSession() {
  recheck();
  if (!result.ok) {
    const e = result.errors[0];
    jumpTo(e.line, e.col, e.length);
    return null;
  }
  const queue = [];
  for (const tok of inputsEl.value.split(/[\s,;]+/).filter(Boolean)) {
    const v = parseInteger(tok);
    if (v === null) {
      consoleEl.innerHTML = '';
      log('c-err', `„${esc(tok)}“ in den vorab eingetragenen Eingaben ist keine Ganzzahl. Erlaubt sind z. B. 12, -3 oder 0, ohne führende Nullen.`);
      inputsEl.focus();
      return null;
    }
    queue.push(v);
  }
  consoleEl.innerHTML = '';
  runtimeError = null;
  shownVars = new Map();
  renderVars(new Map());
  session = { it: execute(result.program), queue, resume: undefined, steps: 0, mode: 'run', paused: false, timer: null, vars: new Map() };
  setRunning(true);
  return session;
}

function stopSession(message) {
  if (!session) return;
  clearRunning();
  clearTimeout(session.timer);
  session = null;
  askForm.hidden = true;
  if (message) log('c-info', esc(message));
  setCurrentLine(null);
  setRunning(false);
}

function finish(vars) {
  clearRunning();
  const steps = session.steps;
  session = null;
  askForm.hidden = true;
  renderVars(vars);
  log('c-info', `Fertig nach ${steps.toLocaleString('de-DE')} ${steps === 1 ? 'Schritt' : 'Schritten'}.`);
  setCurrentLine(null);
  setRunning(false);
}

function fail(e) {
  clearRunning();
  const s = session;
  session = null;
  askForm.hidden = true;
  if (e.kind !== 'laufzeit') throw e;
  runtimeError = { line: e.line };
  if (s) renderVars(s.vars);
  log('c-err', `<b>Laufzeitfehler in Zeile ${e.line}:</b> ${esc(e.message)}`);
  setCurrentLine(null);
  setRunning(false);
}

function pump(untilStep) {
  const s = session;
  if (!s) return;
  s.paused = false;
  let budget = CHUNK;
  while (budget-- > 0) {
    let res;
    try {
      res = s.it.next(s.resume);
    } catch (e) {
      fail(e);
      return;
    }
    s.resume = undefined;
    if (res.done) { finish(res.value); return; }
    const ev = res.value;
    if (ev.type === 'step') {
      s.steps++;
      s.vars = ev.vars;
      if (untilStep) {
        s.paused = true;
        renderVars(ev.vars);
        setCurrentLine(ev.line);
        setRunning(true);
        return;
      }
    } else if (ev.type === 'output') {
      log('c-out', `<b>${esc(ev.value.toString())}</b>`);
    } else if (ev.type === 'input') {
      if (s.queue.length) {
        s.resume = s.queue.shift();
        log('c-in', `${esc(ev.name)} ← ${esc(s.resume.toString())}`);
      } else {
        askFor(ev, untilStep);
        return;
      }
    }
  }
  // Viele Schritte: kurz an den Browser zurückgeben, damit „Stopp“ bedienbar bleibt.
  let runEl = consoleEl.querySelector('.c-run');
  if (!runEl) { log('c-info c-run', ''); runEl = consoleEl.querySelector('.c-run'); }
  runEl.textContent = `Läuft … ${s.steps.toLocaleString('de-DE')} Schritte. Endlosschleife? Mit „Stopp“ abbrechen.`;
  consoleEl.appendChild(runEl);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  renderVars(s.vars);
  setCurrentLine(null);
  s.timer = setTimeout(() => pump(false), 0);
}

function askFor(ev, untilStep) {
  session.waiting = { ev, untilStep };
  renderVars(session.vars);
  setCurrentLine(ev.line);
  askLabel.textContent = `${ev.name} =`;
  askInput.value = '';
  askForm.querySelector('.ask-error')?.remove();
  askForm.hidden = false;
  showTab('run');
  askInput.focus();
}

askForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!session?.waiting) return;
  const v = parseInteger(askInput.value);
  askForm.querySelector('.ask-error')?.remove();
  if (v === null) {
    const p = document.createElement('span');
    p.className = 'ask-error';
    p.textContent = 'Bitte eine Ganzzahl, z. B. 12 oder -3.';
    askForm.appendChild(p);
    askInput.select();
    return;
  }
  const { ev, untilStep } = session.waiting;
  session.waiting = null;
  askForm.hidden = true;
  log('c-in', `${esc(ev.name)} ← ${esc(v.toString())}`);
  session.resume = v;
  pump(untilStep);
});

function run() {
  if (session?.waiting) { askInput.focus(); return; }
  if (!session && !startSession()) return;
  session.mode = 'run';
  showTab('run');
  pump(false);
}

function step() {
  if (session?.waiting) { askInput.focus(); return; }
  if (!session && !startSession()) return;
  session.mode = 'step';
  pump(true);
}

btnRun.addEventListener('click', run);
btnStep.addEventListener('click', step);
btnStop.addEventListener('click', () => stopSession('Angehalten.'));
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  else if (e.key === 'F10') { e.preventDefault(); step(); }
  else if (e.key === 'Escape' && session) { e.preventDefault(); stopSession('Angehalten.'); }
});
inputsEl.addEventListener('input', () => store.set('inputs', inputsEl.value));

// ---------------------------------------------------------------------------
// Struktogramm
// ---------------------------------------------------------------------------

let textFromNS = false; // aktueller Text wurde im Struktogramm erzeugt (nicht getippt)

function applySource(text) {
  ta.value = text;
  textFromNS = true;
  store.set('code', text);
  if (session) stopSession('Programm geändert, Ausführung beendet.');
  runtimeError = null;
  currentLine = null;
  clearTimeout(checkTimer);
  recheck();
}

const ns = createStructogramEditor({
  container: $('#ns'),
  palette: $('#palette'),
  scroller: $('#view-ns'),
  buttons: {
    edit: $('#ns-edit'), up: $('#ns-up'), down: $('#ns-down'), del: $('#ns-del'),
    undo: $('#ns-undo'), toggleElse: $('#ns-else'),
  },
  onSource: applySource,
});

function renderNS() {
  ns.render();
  if (currentLine != null) setCurrentLine(currentLine);
}

function invalidNote() {
  return '<p class="lead">Das Programm ist gerade nicht gültig. Sobald die Statuszeile „gültig“ zeigt, erscheint hier die Ansicht.</p>';
}

// ---------------------------------------------------------------------------
// Ableitung
// ---------------------------------------------------------------------------

const deriv = { tree: null, order: [], step: 0 };
const dRange = $('#d-range');

function renderDeriv() {
  const form = $('#d-form');
  if (!result.ok) {
    deriv.tree = null;
    $('#d-rule').textContent = '';
    $('#d-count').textContent = '';
    form.innerHTML = esc('Das Programm ist gerade nicht gültig. Eine Ableitung gibt es nur für Wörter der Sprache.');
    return;
  }
  deriv.tree = derivationTree(result.program);
  deriv.order = derivationOrder(deriv.tree);
  dRange.max = deriv.order.length;
  deriv.step = Math.min(deriv.step, deriv.order.length);
  showDerivStep();
}

function showDerivStep() {
  if (!deriv.tree) return;
  const k = deriv.step;
  dRange.value = k;
  $('#d-count').textContent = `${k} / ${deriv.order.length}`;
  $('#d-rule').textContent = k === 0 ? 'Startsymbol: <Anweisung>' : `Schritt ${k}:  ${productionAt(deriv.order, k)}`;
  $('#d-form').innerHTML = sententialFormHTML(deriv.tree, k);
}

const setDeriv = (k) => { deriv.step = Math.max(0, Math.min(deriv.order.length, k)); showDerivStep(); };
dRange.addEventListener('input', () => setDeriv(+dRange.value));
$('#d-first').addEventListener('click', () => setDeriv(0));
$('#d-prev').addEventListener('click', () => setDeriv(deriv.step - 1));
$('#d-next').addEventListener('click', () => setDeriv(deriv.step + 1));
$('#d-last').addEventListener('click', () => setDeriv(deriv.order.length));

// ---------------------------------------------------------------------------
// Syntaxbaum
// ---------------------------------------------------------------------------

function renderTree() {
  const el = $('#tree');
  if (!result.ok) { el.innerHTML = invalidNote(); return; }
  el.innerHTML = treeHTML(derivationTree(result.program));
}

// ---------------------------------------------------------------------------
// Grammatik
// ---------------------------------------------------------------------------

function renderGrammar() {
  $('#grammar').innerHTML = grammarHTML();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = ['run', 'ns', 'deriv', 'tree', 'gram'];
let activeTab = 'run';

function showTab(name) {
  activeTab = name;
  for (const t of TABS) {
    $(`#tab-${t}`).setAttribute('aria-selected', String(t === name));
    $(`#view-${t}`).hidden = t !== name;
  }
  store.set('tab', name);
  renderActiveView();
}

function renderActiveView() {
  if (!result) return;
  if (activeTab === 'ns' && dirty.ns) { renderNS(); dirty.ns = false; }
  if (activeTab === 'deriv' && dirty.deriv) { renderDeriv(); dirty.deriv = false; }
  if (activeTab === 'tree' && dirty.tree) { renderTree(); dirty.tree = false; }
}

for (const t of TABS) $(`#tab-${t}`).addEventListener('click', () => showTab(t));

// ---------------------------------------------------------------------------
// Beispiele und Start
// ---------------------------------------------------------------------------

const exSelect = $('#example');
exSelect.innerHTML = '<option value="">Beispiel laden …</option>' +
  EXAMPLES.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('');
exSelect.addEventListener('change', () => {
  const ex = EXAMPLES.find((e) => e.id === exSelect.value);
  exSelect.value = '';
  if (!ex) return;
  if (session) stopSession();
  ta.value = ex.code;
  inputsEl.value = ex.inputs;
  store.set('inputs', ex.inputs);
  consoleEl.innerHTML = '';
  renderVars(new Map());
  deriv.step = 0;
  onChange();
  clearTimeout(checkTimer);
  recheck();
  ta.focus();
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
});

ta.value = store.get('code') ?? EXAMPLES[0].code;
inputsEl.value = store.get('inputs') ?? EXAMPLES[0].inputs;
renderGrammar();
renderVars(new Map());
recheck();
const savedTab = store.get('tab');
showTab(TABS.includes(savedTab) ? savedTab : 'run');
