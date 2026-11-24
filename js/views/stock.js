import * as L from '../logic.js';
import { ui, actions, inputs, esc, icons, photoAttrs, hydratePhotos, data, emptyState, optionsSheet, plural, go, rerender } from '../ctx.js';
import * as sync from '../sync.js';

const SORTS = [
  { value: 'recent', label: 'Ajoutés récemment' },
  { value: 'name', label: 'Nom, de A à Z' },
  { value: 'most', label: 'Plus de fil d’abord' },
  { value: 'least', label: 'Moins de fil d’abord' },
];

export function filterYarns(d) {
  const q = ui.search.trim().toLowerCase();
  let list = d.yarns.filter((y) => (ui.showEmpty ? y.inStock === false : y.inStock !== false));
  list = list.filter((y) => L.matchesFilters(y, ui.filters));
  if (ui.filters.boxes.length) {
    list = list.filter((y) => ui.filters.boxes.includes(y.boxId || 'none'));
  }
  if (q) {
    list = list.filter((y) => [y.name, y.colorName, y.brand, y.material, y.weightCategory].join(' ').toLowerCase().includes(q));
  }
  const rem = (y) => L.remainingGrams(y);
  const sorters = {
    recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'fr'),
    most: (a, b) => rem(b) - rem(a),
    least: (a, b) => rem(a) - rem(b),
  };
  return list.sort(sorters[ui.sort] || sorters.recent);
}

function cardHtml(y, d) {
  const rem = L.remainingGrams(y);
  const avail = L.availableGrams(y, d.projects);
  const reservedAll = rem > 0 && avail <= 0;
  const level = L.stockLevel(rem);
  const badge = y.inStock === false ? '<span class="pill bad">Épuisé</span>' : reservedAll ? '<span class="pill info">Réservé</span>' : `<span class="pill ${level.key}">${level.label}</span>`;
  const meters = L.metersFromGrams(y, rem);
  const line = [y.skeins ? plural(Number(y.skeins), 'pelote', 'pelotes') : '', L.fmtGrams(rem), meters ? `≈ ${L.fmtMeters(meters)}` : ''].filter(Boolean).join(' · ');
  return `<a class="lot ${y.inStock === false ? 'empty' : ''}" href="#/fil/${esc(y.id)}">
    <div class="photo" ${photoAttrs(y.photoId, y.colorKey, y.colorHex)}>${badge}</div>
    <div class="info"><span class="name">${esc(y.name || 'Sans nom')}${y.colorName ? ` · ${esc(y.colorName)}` : ''}</span><span class="meta">${esc(line)}</span></div></a>`;
}

export function listHtml(d) {
  const list = filterYarns(d);
  if (!d.yarns.length) {
    return emptyState(icons.ball, 'Ton stock est vide. Ajoute ton premier fil : le nom et le nombre de pelotes suffisent.', '<a class="btn primary" href="#/fil/nouveau">Ajouter un fil</a>');
  }
  if (!list.length) return emptyState(icons.search, 'Aucun fil ne correspond. Essaie d’enlever un filtre.', '<button type="button" class="btn" data-act="stock.reset">Tout afficher</button>');
  return `<div class="grid">${list.map((y) => cardHtml(y, d)).join('')}</div>`;
}

export function renderStock() {
  const d = data();
  const inStock = d.yarns.filter((y) => y.inStock !== false).length;
  const nActive = (k) => ui.filters[k].length;
  const chip = (act, key, label, count) => `<button type="button" class="chip" aria-pressed="${count > 0}" data-act="${act}" data-key="${key}">${label}${count ? ` · ${count}` : ''}</button>`;
  const anyFilter = ui.filters.weights.length + ui.filters.materials.length + ui.filters.colors.length + ui.filters.boxes.length + (ui.showEmpty ? 1 : 0) > 0;
  const st = sync.getState();
  return `
    <div class="topbar"><h1>Mon stock</h1>
      <a class="iconbtn" href="#/reglages" aria-label="Réglages">${icons.gear}</a></div>
    <div class="search"><label class="sr" for="stock-search">Chercher un fil</label>${icons.search}
      <input id="stock-search" type="search" placeholder="Chercher un fil" value="${esc(ui.search)}" data-input="stock.search" autocomplete="off"></div>
    <div class="chips" role="group" aria-label="Filtres">
      <button type="button" class="chip" aria-pressed="${!anyFilter}" data-act="stock.reset">Tous (${inStock})</button>
      ${chip('stock.filter', 'weights', 'Épaisseur', nActive('weights'))}
      ${chip('stock.filter', 'materials', 'Matière', nActive('materials'))}
      ${chip('stock.filter', 'colors', 'Couleur', nActive('colors'))}
      ${chip('stock.filter', 'boxes', 'Boîte', nActive('boxes'))}
      <button type="button" class="chip" data-act="stock.sort">Trier</button>
      <button type="button" class="chip" aria-pressed="${ui.showEmpty}" data-act="stock.toggleEmpty">Épuisés</button>
    </div>
    <div id="stock-list">${listHtml(d)}</div>
    <a class="fab" href="#/fil/nouveau">${icons.plus}Ajouter un fil</a>`;
}

actions['stock.reset'] = () => {
  ui.filters = { weights: [], materials: [], colors: [], boxes: [] };
  ui.search = '';
  ui.showEmpty = false;
  go('#/');
};

actions['stock.toggleEmpty'] = () => {
  ui.showEmpty = !ui.showEmpty;
  rerender();
};

actions['stock.sort'] = () => {
  optionsSheet({
    title: 'Trier les fils',
    options: SORTS,
    selected: [ui.sort],
    multi: false,
    onChange: ([v]) => {
      ui.sort = v;
    },
  });
};

actions['stock.filter'] = (el) => {
  const key = el.dataset.key;
  const d = data();
  const optionsByKey = {
    weights: L.WEIGHTS.map((w) => ({ value: w, label: w })),
    materials: L.MATERIALS.map((m) => ({ value: m, label: m })),
    colors: L.COLORS.map((c) => ({ value: c.key, label: c.label })),
    boxes: [{ value: 'none', label: 'Sans boîte' }, ...d.boxes.map((b) => ({ value: b.id, label: b.name }))],
  };
  const titles = { weights: 'Épaisseur', materials: 'Matière', colors: 'Couleur', boxes: 'Boîte' };
  optionsSheet({
    title: titles[key],
    options: optionsByKey[key],
    selected: ui.filters[key],
    onChange: (vals) => {
      ui.filters[key] = vals;
    },
    onReset: () => {
      ui.filters[key] = [];
    },
  });
};

inputs['stock.search'] = (el) => {
  ui.search = el.value;
  const box = document.getElementById('stock-list');
  if (box) {
    box.innerHTML = listHtml(data());
    hydratePhotos(box);
  }
};

