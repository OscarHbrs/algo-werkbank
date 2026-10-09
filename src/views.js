// HTML-Darstellungen, die Webseite und VS-Code-Erweiterung gemeinsam nutzen.
import { sententialForm, GRAMMAR } from './algo.js';

export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Satzform nach k Ableitungsschritten; frisch ersetzte Teile hervorgehoben.
export function sententialFormHTML(tree, k) {
  let html = '';
  for (const p of sententialForm(tree, k)) {
    const text = esc(p.text);
    const inner = p.nt ? `<span class="nt">${text}</span>` : text;
    html += p.fresh && !p.indent ? `<span class="fresh">${inner}</span>` : inner;
  }
  return html;
}

function treeNodeHTML(n, depth) {
  if (!n.nt) {
    const t = n.t.replace(/ /g, '␣').replace(/\n/g, '↵');
    return `<li><span class="leaf">${esc(t)}</span></li>`;
  }
  const open = depth < 12 ? ' open' : '';
  return `<li><details${open}><summary>&lt;${n.nt}&gt;</summary><ul>${n.children.map((c) => treeNodeHTML(c, depth + 1)).join('')}</ul></details></li>`;
}

export function treeHTML(tree) {
  return `<ul>${treeNodeHTML(tree, 0)}</ul>`;
}

export function grammarHTML() {
  const rhs = (s) => s.replace(/(<[A-Za-z]+>)|(\s+)|([{}[\]()|…])|(<|[^\s<]+)/g, (m, nt, ws, meta, term) => {
    if (nt) return `<span class="kw">${esc(nt)}</span>`;
    if (ws) return ' ';
    if (meta) return `<span class="pun">${esc(meta)}</span>`;
    return `<span class="t">${esc(term)}</span>`;
  });
  return GRAMMAR.map(([l, r]) => `<tr><td>&lt;${l}&gt;</td><td>:=</td><td>${rhs(r)}</td></tr>`).join('');
}
