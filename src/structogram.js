// Struktogramm-Editor: Das Nassi-Shneiderman-Diagramm ist zugleich eine Bearbeitungsfläche.
// Bausteine einfügen (ziehen oder anklicken), per Doppelklick bearbeiten, verschieben, löschen.
// Jede Änderung wird als Algo-Text ausgegeben (onSource); der Text bleibt die Quelle der Wahrheit,
// außer er ist nur wegen eines noch leeren Rumpfs ungültig – dann bleibt das Modell hier erhalten.

import { format, stmtText, condText, parseStatementText, parseConditionText } from './algo.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const emptyBlock = () => ({ kind: 'block', stmts: [] });

export const PALETTE = [
  { type: 'decl', label: 'DEKLARIERE' },
  { type: 'assign', label: 'SETZE … AUF' },
  { type: 'read', label: 'LIES … EIN' },
  { type: 'write', label: 'GIB … AUS' },
  { type: 'if', label: 'WENN' },
  { type: 'ifelse', label: 'WENN … SONST' },
  { type: 'while', label: 'SOLANGE' },
];

export function createStructogramEditor({ container, palette, buttons, scroller, onSource }) {
  let model = null;      // { kind: 'program', body }
  let sel = null;        // { type: 'stmt', path } | { type: 'slot', block, index } | { type: 'noelse', path }
  let history = [];
  let editing = null;    // { path, isNew }
  let drag = null;
  let suppressClick = false;

  // --- Pfade: "2.then.0" = body.stmts[2].then.stmts[0] -------------------
  function resolve(path) {
    const parts = path.split('.');
    let block = model.body;
    for (let i = 0; ; i += 2) {
      const index = +parts[i];
      const stmt = block.stmts[index];
      if (!stmt) return null;
      if (i === parts.length - 1) return { stmt, block, index };
      block = stmt[parts[i + 1]];
      if (!block) return null;
    }
  }
  function getBlock(bpath) {
    if (!bpath) return model.body;
    const parts = bpath.split('.');
    const branch = parts.pop();
    return resolve(parts.join('.'))?.stmt[branch] ?? null;
  }
  function findPath(target) {
    const walk = (block, prefix) => {
      for (let i = 0; i < block.stmts.length; i++) {
        const s = block.stmts[i];
        const p = prefix + i;
        if (s === target) return p;
        for (const br of ['then', 'else', 'body']) {
          if (s[br]) { const r = walk(s[br], `${p}.${br}.`); if (r) return r; }
        }
      }
      return null;
    };
    return walk(model.body, '');
  }
  const parentPath = (path) => path.split('.').slice(0, -2).join('.');   // Anweisung, die den Block enthält
  const blockPathOf = (path) => path.split('.').slice(0, -1).join('.');

  // --- Änderungen ---------------------------------------------------------
  function snapshot() {
    history.push({ model: structuredClone(model), sel: structuredClone(sel) });
    if (history.length > 200) history.shift();
    updateButtons();
  }
  function commit() {
    onSource(format(model));
  }
  function undo() {
    const h = history.pop();
    if (!h) return;
    model = h.model;
    sel = h.sel;
    editing = null;
    commit();
    container.focus({ preventScroll: true });
  }
  function selectStmt(stmt) {
    const path = findPath(stmt);
    sel = path ? { type: 'stmt', path } : null;
  }

  function freeName() {
    const used = new Set();
    const walk = (b) => b.stmts.forEach((s) => {
      if (s.kind === 'decl') s.names.forEach((n) => used.add(n.name));
      for (const br of ['then', 'else', 'body']) if (s[br]) walk(s[br]);
    });
    walk(model.body);
    for (const n of ['x', 'y', 'z', 'n', 'i', 'k', 'summe', 'ergebnis']) if (!used.has(n)) return n;
    return 'neu';
  }
  function someVar() {
    let found = null;
    const walk = (b) => b.stmts.forEach((s) => {
      if (!found && s.kind === 'decl') found = s.names[0].name;
      for (const br of ['then', 'else', 'body']) if (s[br]) walk(s[br]);
    });
    walk(model.body);
    return found ?? 'x';
  }
  function template(type) {
    const v = someVar();
    switch (type) {
      case 'decl': return parseStatementText(`DEKLARIERE ${freeName()}`);
      case 'assign': return parseStatementText(`SETZE ${v} AUF 0`);
      case 'read': return parseStatementText(`LIES ${v} EIN`);
      case 'write': return parseStatementText(`GIB ${v} AUS`);
      case 'if': return { kind: 'if', cond: parseConditionText(`${v} > 0`), then: emptyBlock(), else: null };
      case 'ifelse': return { kind: 'if', cond: parseConditionText(`${v} > 0`), then: emptyBlock(), else: emptyBlock() };
      case 'while': return { kind: 'while', cond: parseConditionText(`${v} > 0`), body: emptyBlock() };
    }
  }

  // Wohin ein neuer Baustein kommt: hinter die Auswahl, in einen ausgewählten leeren Rumpf oder ans Ende.
  function insertionPoint() {
    if (sel?.type === 'stmt') {
      const r = resolve(sel.path);
      if (r) return { block: r.block, index: r.index + 1 };
    }
    if (sel?.type === 'slot') {
      const b = getBlock(sel.block);
      if (b) return { block: b, index: Math.min(sel.index, b.stmts.length) };
    }
    if (sel?.type === 'noelse') {
      const r = resolve(sel.path);
      if (r) return { elseOf: r.stmt };
    }
    return { block: model.body, index: model.body.stmts.length };
  }
  function place(stmt, where) {
    if (where.elseOf) where.elseOf.else = { kind: 'block', stmts: [stmt] };
    else where.block.stmts.splice(where.index, 0, stmt);
  }
  // Ein SONST-Zweig, der beim Verschieben/Löschen leer wird, verschwindet.
  function dropEmptyElse(block) {
    const walk = (b) => b.stmts.forEach((s) => {
      if (s.kind === 'if' && s.else === block && block.stmts.length === 0) s.else = null;
      for (const br of ['then', 'else', 'body']) if (s[br]) walk(s[br]);
    });
    walk(model.body);
  }

  function insertNew(type, where = insertionPoint()) {
    if (!model) return;
    snapshot();
    const s = template(type);
    place(s, where);
    selectStmt(s);
    commit();
    startEdit(sel.path, true);
  }

  function moveTo(path, where) {
    const src = resolve(path);
    if (!src) return;
    // Nicht in sich selbst hineinschieben
    if (where.elseOf && (where.elseOf === src.stmt || contains(src.stmt, where.elseOf))) return;
    if (where.block && contains(src.stmt, where.block)) return;
    snapshot();
    let index = where.index;
    src.block.stmts.splice(src.index, 1);
    if (where.block === src.block && src.index < index) index--;
    place(src.stmt, { ...where, index });
    dropEmptyElse(src.block);
    selectStmt(src.stmt);
    commit();
  }
  function contains(stmt, target) {
    for (const br of ['then', 'else', 'body']) {
      const b = stmt[br];
      if (!b) continue;
      if (b === target) return true;
      for (const s of b.stmts) if (s === target || contains(s, target)) return true;
    }
    return false;
  }

  function removeSelected() {
    if (sel?.type !== 'stmt') return;
    const r = resolve(sel.path);
    if (!r) return;
    snapshot();
    r.block.stmts.splice(r.index, 1);
    const next = r.block.stmts[Math.min(r.index, r.block.stmts.length - 1)];
    dropEmptyElse(r.block);
    if (next) selectStmt(next);
    else {
      const bp = blockPathOf(sel.path);
      sel = getBlock(bp) ? { type: 'slot', block: bp, index: 0 } : null;
    }
    commit();
  }

  function moveSelected(dir) {
    if (sel?.type !== 'stmt') return;
    const r = resolve(sel.path);
    if (!r) return;
    const j = r.index + dir;
    if (j >= 0 && j < r.block.stmts.length) {
      snapshot();
      [r.block.stmts[r.index], r.block.stmts[j]] = [r.block.stmts[j], r.block.stmts[r.index]];
    } else {
      // Am Rand eines Rumpfs: aus dem Block heraus vor bzw. hinter die umgebende Anweisung
      const pp = parentPath(sel.path);
      if (!pp) return;
      const parent = resolve(pp);
      snapshot();
      r.block.stmts.splice(r.index, 1);
      parent.block.stmts.splice(parent.index + (dir > 0 ? 1 : 0), 0, r.stmt);
      dropEmptyElse(r.block);
    }
    selectStmt(r.stmt);
    commit();
  }

  function toggleElse() {
    if (sel?.type !== 'stmt') return;
    const r = resolve(sel.path);
    if (r?.stmt.kind !== 'if') return;
    snapshot();
    r.stmt.else = r.stmt.else ? null : emptyBlock();
    commit();
  }

  // --- Bearbeiten im Diagramm -----------------------------------------------
  function startEdit(path, isNew = false) {
    const node = container.querySelector(`.ns-node[data-path="${path}"]`);
    const r = resolve(path);
    if (!node || !r) return;
    editing = { path, isNew };
    const compound = r.stmt.kind === 'if' || r.stmt.kind === 'while';
    const textEl = node.querySelector(':scope > .ns-text, :scope > .ns-head > .ns-text, :scope > .ns-if-head .ns-text');
    const value = compound ? condText(r.stmt.cond) : stmtText(r.stmt);
    textEl.innerHTML = `<span class="ns-edit"><input type="text" id="ns-edit-input" spellcheck="false" autocomplete="off" aria-label="${compound ? 'Bedingung' : 'Anweisung'}"><span class="ns-edit-err" hidden></span></span>`;
    const input = textEl.querySelector('input');
    const errEl = textEl.querySelector('.ns-edit-err');
    input.value = value;
    input.focus();
    // Bei neuen Bausteinen den Teil markieren, den man meist ändern will
    if (isNew) {
      const m = compound ? null : value.match(/^(DEKLARIERE|LIES|GIB) (\S+)|^SETZE \S+ AUF (.+)$/);
      if (m?.[2]) input.setSelectionRange(value.indexOf(m[2]), value.indexOf(m[2]) + m[2].length);
      else if (m?.[3]) input.setSelectionRange(value.length - m[3].length, value.length);
      else input.select();
    } else input.select();

    let done = false;
    const tryCommit = () => {
      const text = input.value;
      if (text.trim() === value && !isNew) { cancel(); return true; }
      try {
        if (compound) {
          const cond = parseConditionText(text);
          if (!isNew) snapshot();
          r.stmt.cond = cond;
          done = true;
          editing = null;
          selectStmt(r.stmt);
        } else {
          const s = parseStatementText(text);
          if (!isNew) snapshot();
          r.block.stmts[r.index] = s;
          done = true;
          editing = null;
          selectStmt(s);
        }
        commit();
        container.focus({ preventScroll: true });
        return true;
      } catch (e) {
        if (!e.kind) throw e;
        errEl.textContent = e.message.replace('Hier sollte die Zeile enden', 'Hier sollte die Eingabe enden');
        errEl.hidden = false;
        input.classList.add('bad');
        return false;
      }
    };
    const cancel = () => {
      if (done) return;
      done = true;
      editing = null;
      if (isNew) undo(); else { render(); container.focus({ preventScroll: true }); }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); tryCommit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('input', () => {
      if (input.value.includes('!=')) {
        const p = input.selectionStart;
        input.value = input.value.replace('!=', '≠');
        input.setSelectionRange(p - 1, p - 1);
      }
      errEl.hidden = true;
      input.classList.remove('bad');
    });
    input.addEventListener('blur', () => {
      if (done) return;
      // Beim Wegklicken: gültige Eingabe übernehmen, sonst verwerfen
      setTimeout(() => { if (!done && !tryCommit()) cancel(); }, 0);
    });
    updateButtons();
  }

  // --- Darstellung ----------------------------------------------------------
  const grip = '<span class="grip" title="Ziehen zum Verschieben" aria-hidden="true">⠿</span>';
  const slot = (bpath, i) => `<div class="ns-slot" data-block="${bpath}" data-index="${i}"></div>`;

  function blockHTML(block, bpath) {
    if (block.stmts.length === 0) {
      return `<div class="ns-seq"><div class="ns-drop" data-block="${bpath}" data-index="0">Rumpf leer: Baustein hierher ziehen oder hier auswählen und oben anklicken</div></div>`;
    }
    const prefix = bpath ? bpath + '.' : '';
    let h = '<div class="ns-seq">';
    block.stmts.forEach((s, i) => { h += slot(bpath, i) + stmtHTML(s, prefix + i); });
    return h + slot(bpath, block.stmts.length) + '</div>';
  }

  function stmtHTML(s, path) {
    switch (s.kind) {
      case 'if':
        return `<div class="ns-node ns-if" data-path="${path}">
          <div class="ns-if-head" data-line="${s.line}">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="50" y2="100"/><line x1="100" y1="0" x2="50" y2="100"/></svg>
            ${grip}
            <div class="ns-if-cond"><span class="ns-text">${esc(condText(s.cond))}</span></div>
            <div class="ns-if-tf"><span>wahr</span><span>falsch</span></div>
          </div>
          <div class="ns-if-body">${blockHTML(s.then, path + '.then')}${s.else
            ? blockHTML(s.else, path + '.else')
            : `<div class="ns-seq"><div class="ns-drop ns-noelse" data-else-of="${path}" title="Hierher ziehen legt einen SONST-Zweig an">∅</div></div>`}</div>
        </div>`;
      case 'while':
        return `<div class="ns-node ns-while" data-path="${path}">
          <div class="ns-head" data-line="${s.line}">${grip}solange <span class="ns-text">${esc(condText(s.cond))}</span></div>
          ${blockHTML(s.body, path + '.body')}
        </div>`;
      default:
        return `<div class="ns-node ns-stmt" data-path="${path}" data-line="${s.line}">${grip}<span class="ns-text">${esc(stmtText(s))}</span></div>`;
    }
  }

  function render() {
    if (!model) {
      container.innerHTML = '<p class="lead">Der Code ist gerade nicht gültig. Sobald die Statuszeile „gültig“ zeigt, kannst du hier wieder im Struktogramm arbeiten.</p>';
      updateButtons();
      return;
    }
    container.innerHTML = `<div class="ns-block">${blockHTML(model.body, '')}</div>`;
    applySelection();
  }

  function applySelection() {
    container.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    let el = null;
    if (sel?.type === 'stmt') el = container.querySelector(`.ns-node[data-path="${sel.path}"]`);
    if (sel?.type === 'slot') el = container.querySelector(`.ns-drop[data-block="${sel.block}"]`);
    if (sel?.type === 'noelse') el = container.querySelector(`.ns-noelse[data-else-of="${sel.path}"]`);
    if (!el && sel) sel = null;
    el?.classList.add('selected');
    if (el) {
      const r = el.getBoundingClientRect();
      const v = scroller.getBoundingClientRect();
      if (r.bottom > v.bottom || r.top < v.top + 90) el.scrollIntoView({ block: 'nearest' });
    }
    updateButtons();
  }

  function updateButtons() {
    const r = sel?.type === 'stmt' && model ? resolve(sel.path) : null;
    buttons.edit.disabled = !r;
    buttons.up.disabled = !r;
    buttons.down.disabled = !r;
    buttons.del.disabled = !r;
    buttons.undo.disabled = history.length === 0;
    const isIf = r?.stmt.kind === 'if';
    buttons.toggleElse.hidden = !isIf;
    buttons.toggleElse.textContent = isIf && r.stmt.else ? 'SONST entfernen' : 'SONST hinzufügen';
    palette.querySelectorAll('[data-new]').forEach((c) => { c.disabled = !model; });
  }

  // --- Maus, Touch, Tastatur -----------------------------------------------
  container.addEventListener('click', (e) => {
    if (suppressClick || e.target.closest('input')) return;
    const drop = e.target.closest('.ns-drop');
    const node = e.target.closest('.ns-node');
    if (drop?.dataset.elseOf) sel = { type: 'noelse', path: drop.dataset.elseOf };
    else if (drop) sel = { type: 'slot', block: drop.dataset.block, index: 0 };
    else if (node) sel = { type: 'stmt', path: node.dataset.path };
    else sel = null;
    applySelection();
    container.focus({ preventScroll: true });
  });
  container.addEventListener('dblclick', (e) => {
    const node = e.target.closest('.ns-node');
    if (!node || e.target.closest('input')) return;
    sel = { type: 'stmt', path: node.dataset.path };
    applySelection();
    startEdit(node.dataset.path);
  });
  container.addEventListener('keydown', (e) => {
    if (e.target.closest('input') || !model) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (sel?.type !== 'stmt') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); stepSelection(e.key === 'ArrowDown' ? 1 : -1); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(sel.path); }
    else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveSelected(-1); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveSelected(1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepSelection(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Escape') { sel = null; applySelection(); }
  });
  function stepSelection(dir) {
    const nodes = [...container.querySelectorAll('.ns-node')];
    if (!nodes.length) return;
    const i = sel?.type === 'stmt' ? nodes.findIndex((n) => n.dataset.path === sel.path) : -1;
    const next = nodes[Math.max(0, Math.min(nodes.length - 1, i < 0 ? 0 : i + dir))];
    sel = { type: 'stmt', path: next.dataset.path };
    applySelection();
  }

  palette.innerHTML = PALETTE.map((p) => `<button class="chip" data-new="${p.type}" title="Ziehen oder klicken zum Einfügen">${esc(p.label)}</button>`).join('');
  palette.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-new]');
    if (!chip || suppressClick) return;
    insertNew(chip.dataset.new);
  });
  buttons.edit.addEventListener('click', () => sel?.type === 'stmt' && startEdit(sel.path));
  buttons.up.addEventListener('click', () => moveSelected(-1));
  buttons.down.addEventListener('click', () => moveSelected(1));
  buttons.del.addEventListener('click', removeSelected);
  buttons.undo.addEventListener('click', undo);
  buttons.toggleElse.addEventListener('click', toggleElse);
  // Buttons sollen die Auswahl nicht durch Fokuswechsel verlieren
  Object.values(buttons).forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));

  // Ziehen mit Pointer-Events (Maus und Touch). Auf Touch nur am Griff ⠿, damit Scrollen möglich bleibt.
  function onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('input') || !model || editing) return;
    const chip = e.target.closest('[data-new]');
    const node = e.target.closest('.ns-node');
    const onGrip = !!e.target.closest('.grip');
    let payload, label, src = null;
    if (chip) {
      payload = { kind: 'new', type: chip.dataset.new };
      label = chip.textContent;
    } else if (node && (onGrip || e.pointerType === 'mouse')) {
      payload = { kind: 'move', path: node.dataset.path };
      label = node.querySelector('.ns-text')?.textContent ?? '';
      src = node;
    } else return;
    if (onGrip || chip) e.preventDefault();
    drag = { payload, label, src, x0: e.clientX, y0: e.clientY, started: false, target: null };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }
  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true;
      document.body.classList.add('ns-dragging');
      drag.src?.classList.add('drag-src');
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'ns-ghost';
      drag.ghost.textContent = drag.label;
      document.body.appendChild(drag.ghost);
      window.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
    let t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ns-slot, .ns-drop') ?? null;
    if (t && drag.src && drag.src.contains(t)) t = null;
    if (t !== drag.target) {
      drag.target?.classList.remove('target');
      t?.classList.add('target');
      drag.target = t;
    }
    // Automatisch scrollen am Rand der Ansicht
    const v = scroller.getBoundingClientRect();
    if (e.clientY < v.top + 40) scroller.scrollTop -= 12;
    else if (e.clientY > v.bottom - 40) scroller.scrollTop += 12;
  }
  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    const d = drag;
    drag = null;
    if (!d?.started) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    document.body.classList.remove('ns-dragging');
    d.src?.classList.remove('drag-src');
    d.ghost.remove();
    const t = d.target;
    if (!t) return;
    t.classList.remove('target');
    const where = t.dataset.elseOf
      ? { elseOf: resolve(t.dataset.elseOf)?.stmt }
      : { block: getBlock(t.dataset.block), index: +t.dataset.index };
    if (!(where.elseOf || where.block)) return;
    if (d.payload.kind === 'new') insertNew(d.payload.type, where);
    else moveTo(d.payload.path, where);
  }
  container.addEventListener('pointerdown', onPointerDown);
  palette.addEventListener('pointerdown', onPointerDown);

  return {
    // Neues Ergebnis der Prüfung. program: geparstes Programm oder null.
    // fromEditor: Der Text stammt aus diesem Editor – dann bleibt das Modell bei Syntaxfehlern erhalten.
    sync(program, fromEditor) {
      if (program) model = program;
      else if (!fromEditor) model = null;
      if (!fromEditor) history = [];
      if (sel?.type === 'stmt' && model && !resolve(sel.path)) sel = null;
    },
    render,
    isEditing: () => !!editing,
  };
}
