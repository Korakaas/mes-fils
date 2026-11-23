// Noyau partagé par les écrans : état de l'interface, petits composants HTML, feuilles et messages.

import * as store from './store.js';
import * as L from './logic.js';

export const ui = {
  search: '',
  filters: { weights: [], materials: [], colors: [], boxes: [] },
  sort: 'recent',
  showEmpty: false,
  sheet: null,
  toast: '',
  lightbox: null,
  chooseSel: new Set(),
  chooseFilters: { weights: [], materials: [], colors: [] },
  projectFilter: 'tous',
  draftPattern: null,
};

export const actions = {};
export const inputs = {};
export const submits = {};

let renderFn = () => {};
export function setRenderer(fn) {
  renderFn = fn;
}
export function rerender() {
  renderFn();
}

export function go(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

export function back(fallback = '#/') {
  if (history.length > 1 && document.referrer !== '') history.back();
  else go(fallback);
}

// ---------- Texte ----------

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

export function numStr(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace('.', ',');
}

// ---------- Icônes ----------

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const icons = {
  back: P('<path d="M15 5l-7 7 7 7"/>'),
  chev: P('<path d="M9 5l7 7-7 7"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
  camera: P('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  check: P('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
  alert: P('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  doc: P('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
  ball: P('<circle cx="12" cy="12" r="8"/><path d="M5 9c4 1 9 1 14 0M4.5 14c5 1.5 10 1.5 15 0M9 4.5c1 4 1 11 0 15"/>'),
  folder: P('<path d="M4 7h6l2 2h8v10H4z"/>'),
  trash: P('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  sliders: P('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
};

// ---------- Composants ----------

export function topbar(title, { backHref = null, right = '' } = {}) {
  const b = backHref
    ? `<a class="iconbtn" href="${backHref}" aria-label="Retour">${icons.back}</a>`
    : '';
  return `<div class="topbar">${b}<h1>${esc(title)}</h1>${right}</div>`;
}

export function pill(kind, text) {
  return `<span class="pill ${kind}">${esc(text)}</span>`;
}

export function colorStyle(colorKey) {
  const c = L.colorOf(colorKey);
  if (!c) return 'background-color:#f1e8de';
  return c.hex.startsWith('linear') ? `background:${c.hex}` : `background-color:${c.hex}`;
}

/** Cadre photo : la photo (fichier local) est posée après coup par hydratePhotos. */
export function photoAttrs(photoId, colorKey) {
  return `style="${colorStyle(colorKey)}" ${photoId ? `data-photo="${esc(photoId)}"` : ''}`;
}

export async function hydratePhotos(root = document) {
  const els = [...root.querySelectorAll('[data-photo]')];
  await Promise.all(
    els.map(async (el) => {
      const id = el.dataset.photo;
      const url = await store.blobUrl(id).catch(() => null);
      if (url && el.isConnected) {
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      }
    }),
  );
}

export function emptyState(iconHtml, text, buttonHtml = '') {
  return `<div class="empty">${iconHtml}<p>${esc(text)}</p>${buttonHtml}</div>`;
}

export function switchRow(id, label, on, act) {
  return `<div class="switchrow"><span class="txt" id="${id}-l">${esc(label)}</span>
    <button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-labelledby="${id}-l" data-act="${act}"></button></div>`;
}

export function yarnTitle(y) {
  return y.colorName ? `${y.name} · ${y.colorName}` : y.name;
}

export function yarnLine(y) {
  const rem = L.remainingGrams(y);
  const parts = [];
  if (y.skeins) parts.push(`${numStr(y.skeins)} pelote${y.skeins > 1 ? 's' : ''}`);
  parts.push(L.fmtGrams(rem));
  return parts.join(' · ');
}

// ---------- Messages et feuilles ----------

let toastTimer = null;
export function toast(msg, ms = 2600) {
  ui.toast = msg;
  paintOverlay();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = '';
    paintOverlay();
  }, ms);
}

export function openSheet(sheet) {
  ui.sheet = sheet;
  paintOverlay();
}

export function closeSheet() {
  ui.sheet = null;
  paintOverlay();
}

export function confirmSheet({ title, text, confirmLabel = 'Confirmer', danger = false, onConfirm }) {
  openSheet({ type: 'confirm', title, text, confirmLabel, danger, onConfirm });
}

export function promptSheet({ title, label, value = '', confirmLabel = 'Enregistrer', type = 'text', hint = '', onConfirm }) {
  openSheet({ type: 'prompt', title, label, value, confirmLabel, inputType: type, hint, onConfirm });
}

export function optionsSheet({ title, options, selected, multi = true, onChange, onReset }) {
  openSheet({ type: 'options', title, options, selected: new Set(selected), multi, onChange, onReset });
}

export function paintOverlay() {
  const root = document.getElementById('overlay');
  if (!root) return;
  let html = '';
  const s = ui.sheet;
  if (s) {
    let body = '';
    if (s.type === 'confirm') {
      body = `<h2>${esc(s.title)}</h2>${s.text ? `<p>${esc(s.text)}</p>` : ''}
        <div class="actions"><button type="button" class="btn" data-act="sheet.close">Annuler</button>
        <button type="button" class="btn ${s.danger ? 'danger' : 'primary'}" data-act="sheet.confirm">${esc(s.confirmLabel)}</button></div>`;
    } else if (s.type === 'prompt') {
      body = `<h2>${esc(s.title)}</h2>
        <form data-submit="sheet.prompt" class="stack"><div class="field"><label for="sheet-input">${esc(s.label)}</label>
        <input id="sheet-input" name="v" type="${s.inputType === 'number' ? 'text' : s.inputType}" ${s.inputType === 'number' ? 'inputmode="decimal"' : ''} value="${esc(s.value)}" autocomplete="off">
        ${s.hint ? `<span class="hint">${esc(s.hint)}</span>` : ''}</div>
        <div class="actions"><button type="button" class="btn" data-act="sheet.close">Annuler</button>
        <button type="submit" class="btn primary">${esc(s.confirmLabel)}</button></div></form>`;
    } else if (s.type === 'options') {
      body = `<h2>${esc(s.title)}</h2><div class="stack" style="gap:2px">${s.options
        .map(
          (o) => `<button type="button" class="optrow" aria-pressed="${s.selected.has(o.value)}" data-act="sheet.opt" data-value="${esc(o.value)}"><span class="box"></span>${esc(o.label)}</button>`,
        )
        .join('')}</div>
        <div class="actions">${s.onReset ? '<button type="button" class="btn" data-act="sheet.reset">Tout effacer</button>' : ''}
        <button type="button" class="btn primary" data-act="sheet.close">Terminé</button></div>`;
    } else if (s.type === 'html') {
      body = s.html;
    }
    html += `<div class="scrim" data-act="sheet.scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(s.title || 'Fenêtre')}">${body}</div></div>`;
  }
  if (ui.lightbox) {
    html += `<div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo"><img alt="Photo agrandie" src="${esc(ui.lightbox.url)}">
      <div class="row" style="max-width:360px"><button type="button" class="btn" data-act="lightbox.close">Fermer</button>
      ${ui.lightbox.onDelete ? '<button type="button" class="btn" data-act="lightbox.delete">Supprimer</button>' : ''}</div></div>`;
  }
  if (ui.toast) html += `<div class="toast" role="status">${esc(ui.toast)}</div>`;
  root.innerHTML = html;
  const input = root.querySelector('#sheet-input');
  if (input) {
    input.focus();
    input.select && input.select();
  }
}

// Actions communes aux feuilles
actions['sheet.close'] = () => closeSheet();
actions['sheet.scrim'] = (el, ev) => {
  if (ev.target === el) closeSheet();
};
actions['sheet.confirm'] = async () => {
  const s = ui.sheet;
  closeSheet();
  if (s && s.onConfirm) await s.onConfirm();
};
submits['sheet.prompt'] = async (form) => {
  const s = ui.sheet;
  const v = new FormData(form).get('v');
  closeSheet();
  if (s && s.onConfirm) await s.onConfirm(String(v ?? '').trim());
};
actions['sheet.opt'] = (el) => {
  const s = ui.sheet;
  if (!s || s.type !== 'options') return;
  const v = el.dataset.value;
  if (s.multi) {
    if (s.selected.has(v)) s.selected.delete(v);
    else s.selected.add(v);
  } else {
    s.selected = new Set([v]);
  }
  s.onChange && s.onChange([...s.selected]);
  paintOverlay();
  rerender();
};
actions['sheet.reset'] = () => {
  const s = ui.sheet;
  if (!s) return;
  s.selected = new Set();
  s.onReset && s.onReset();
  paintOverlay();
  rerender();
};
actions['lightbox.close'] = () => {
  ui.lightbox = null;
  paintOverlay();
};
actions['lightbox.delete'] = async () => {
  const lb = ui.lightbox;
  ui.lightbox = null;
  paintOverlay();
  if (lb && lb.onDelete) await lb.onDelete();
};

// ---------- Choix d'un fichier ----------

export function pickFile({ accept, capture = false }) {
  return new Promise((resolve) => {
    const input = document.getElementById('file-input');
    input.value = '';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    const done = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
    };
    const onChange = () => {
      done();
      resolve(input.files && input.files[0] ? input.files[0] : null);
    };
    const onCancel = () => {
      done();
      resolve(null);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    input.click();
  });
}

export function readForm(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) out[k] = v;
  return out;
}

export function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const x = L.toNumber(v);
  return Number.isFinite(x) ? x : null;
}

export function data() {
  const yarns = store.list('yarns');
  const projects = store.list('projects');
  return {
    yarns,
    yarnsById: Object.fromEntries(yarns.map((y) => [y.id, y])),
    boxes: store.list('boxes'),
    patterns: store.list('patterns'),
    projects,
    settings: store.getSettings(),
  };
}
