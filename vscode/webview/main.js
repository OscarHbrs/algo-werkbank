// Skript im Webview-Panel. Nutzt dieselben Module wie die Werkbank-Webseite.
import { check, derivationTree, derivationOrder, productionAt } from '../../src/algo.js';
import { createStructogramEditor } from '../../src/structogram.js';
import { sententialFormHTML, treeHTML, grammarHTML, esc } from '../../src/views.js';

const vscode = acquireVsCodeApi();
const $ = (s) => document.querySelector(s);
const state = vscode.getState() ?? {};

let text = null;          // aktueller Programmtext
let result = null;
let textFromNS = false;   // Text stammt aus dem Struktogramm
let pending = [];         // an VS Code geschickte Texte, deren Echo noch aussteht
let currentLine = null;
let activeTab = state.tab ?? document.body.dataset.tab ?? 'ns';
const dirty = { ns: true, deriv: true, tree: true };

const ns = createStructogramEditor({
  container: $('#ns'),
  palette: $('#palette'),
  scroller: $('#view-ns'),
  buttons: {
    edit: $('#ns-edit'), up: $('#ns-up'), down: $('#ns-down'), del: $('#ns-del'),
    undo: $('#ns-undo'), toggleElse: $('#ns-else'),
  },
  onSource(t) {
    text = t;
    textFromNS = true;
    pending.push(t);
    recheck();
    vscode.postMessage({ type: 'source', text: t });
  },
  onSelect(line) { if (line) vscode.postMessage({ type: 'reveal', line }); },
});

function recheck() {
  result = check(text);
  ns.sync(result.program, textFromNS);
  dirty.ns = dirty.deriv = dirty.tree = true;
  renderStatus();
  renderActive();
}

function renderStatus() {
  const el = $('#status');
  if (result.ok) {
    el.className = 'wv-status ok';
    el.innerHTML = '<b>✓ gültig</b> <span class="math">w ∈ L(Algo)</span>';
    el.dataset.line = '';
    return;
  }
  const e = result.errors[0];
  const more = result.errors.length > 1 ? ` <span class="math">(+${result.errors.length - 1} weitere)</span>` : '';
  el.className = 'wv-status bad';
  el.innerHTML = `<b>✗ Zeile ${e.line}:</b> ${esc(e.message)}${more}`;
  el.dataset.line = e.line;
}
$('#status').addEventListener('click', () => {
  const line = +$('#status').dataset.line;
  if (line) vscode.postMessage({ type: 'reveal', line });
});

function highlightLine() {
  document.querySelectorAll('#ns [data-line].cur').forEach((el) => el.classList.remove('cur'));
  if (currentLine == null) return;
  const els = document.querySelectorAll(`#ns [data-line="${currentLine}"]`);
  els.forEach((el) => el.classList.add('cur'));
  els[0]?.scrollIntoView({ block: 'nearest' });
}

// --- Ableitung -------------------------------------------------------------
const deriv = { tree: null, order: [], step: state.derivStep ?? 0 };
const dRange = $('#d-range');
function renderDeriv() {
  if (!result.program || !result.ok) {
    deriv.tree = null;
    $('#d-rule').textContent = '';
    $('#d-count').textContent = '';
    $('#d-form').textContent = 'Das Programm ist gerade nicht gültig. Eine Ableitung gibt es nur für Wörter der Sprache.';
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
  saveState();
}
const setDeriv = (k) => { deriv.step = Math.max(0, Math.min(deriv.order.length, k)); showDerivStep(); };
dRange.addEventListener('input', () => setDeriv(+dRange.value));
$('#d-first').addEventListener('click', () => setDeriv(0));
$('#d-prev').addEventListener('click', () => setDeriv(deriv.step - 1));
$('#d-next').addEventListener('click', () => setDeriv(deriv.step + 1));
$('#d-last').addEventListener('click', () => setDeriv(deriv.order.length));

// --- Syntaxbaum, Grammatik ---------------------------------------------------
function renderTree() {
  $('#tree').innerHTML = result.ok
    ? treeHTML(derivationTree(result.program))
    : '<p class="lead">Das Programm ist gerade nicht gültig. Sobald es gültig ist, erscheint hier der Baum.</p>';
}
$('#grammar').innerHTML = grammarHTML();

// --- Tabs --------------------------------------------------------------------
const TABS = ['ns', 'deriv', 'tree', 'gram'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'ns';
  activeTab = name;
  for (const t of TABS) {
    $(`#tab-${t}`).setAttribute('aria-selected', String(t === name));
    $(`#view-${t}`).hidden = t !== name;
  }
  saveState();
  renderActive();
}
function renderActive() {
  if (!result) return;
  if (activeTab === 'ns' && dirty.ns) { ns.render(); highlightLine(); dirty.ns = false; }
  if (activeTab === 'deriv' && dirty.deriv) { renderDeriv(); dirty.deriv = false; }
  if (activeTab === 'tree' && dirty.tree) { renderTree(); dirty.tree = false; }
}
function saveState() { vscode.setState({ tab: activeTab, derivStep: deriv.step }); }
for (const t of TABS) $(`#tab-${t}`).addEventListener('click', () => showTab(t));

// --- Nachrichten von der Erweiterung -----------------------------------------
window.addEventListener('message', (e) => {
  const m = e.data;
  if (m.type === 'text') {
    const t = m.text.replace(/\r\n?/g, '\n');
    const i = pending.indexOf(t);
    if (i >= 0) { pending.splice(0, i + 1); return; } // Echo der eigenen Änderung
    pending = [];
    if (t === text) return;
    text = t;
    textFromNS = false;
    recheck();
  } else if (m.type === 'line') {
    currentLine = m.line;
    highlightLine();
  } else if (m.type === 'tab') {
    showTab(m.tab);
  }
});

showTab(activeTab);
vscode.postMessage({ type: 'ready' });
