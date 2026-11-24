// Couleurs d'un fil : une famille (pour les filtres) et, au choix, une teinte précise (nuancier ou couleur libre).
import * as L from './logic.js';
import { ui, actions, inputs, esc, openSheet, closeSheet } from './ctx.js';

const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => hex2(v * 255)).join('');
}

const HUES = [2, 22, 46, 95, 165, 205, 262, 325];
const TONES = [
  [88, 62],
  [76, 56],
  [62, 52],
  [46, 50],
  [32, 46],
];
const NEUTRALS = ['#FFFFFF', '#F3EBDD', '#E1CDB0', '#BFA58A', '#8C6B52', '#B7B3B3', '#6B6568', '#2B2628'];

/** Nuancier : 5 tons pour 8 teintes, puis une rangée de neutres. */
export const SHADES = [...TONES.flatMap(([l, s]) => HUES.map((h) => hsl(h, s, l))), ...NEUTRALS];

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Famille de couleur la plus proche d'une teinte (pour que les filtres et le tri continuent de marcher). */
export function nearestFamily(hex) {
  const c = rgb(hex);
  if (!c) return '';
  let best = '';
  let bd = Infinity;
  for (const f of L.COLORS) {
    const r = rgb(f.hex);
    if (!r) continue;
    const d = (r[0] - c[0]) ** 2 + (r[1] - c[1]) ** 2 + (r[2] - c[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = f.key;
    }
  }
  return best;
}

const dotStyle = (c) => (c.hex.startsWith('linear') ? `background:${c.hex}` : `background-color:${c.hex}`);

/** Pastilles de famille + une pastille « teinte personnalisée » qui ouvre le nuancier. */
export function colorDots({ act, shadeAct, key, hex }) {
  const fam = L.COLORS.map(
    (c) => `<button type="button" class="dot" aria-label="${esc(c.label)}" aria-pressed="${!hex && key === c.key}" data-act="${act}" data-value="${c.key}" style="${dotStyle(c)}"></button>`,
  ).join('');
  const custom = `<button type="button" class="dot custom" data-custom aria-label="Autre teinte (nuancier)" aria-pressed="${!!hex}" data-act="${shadeAct}" ${hex ? `style="background-color:${esc(hex)}"` : ''}><span class="plus" aria-hidden="true">+</span></button>`;
  return `<div class="colors" role="group" aria-label="Couleur">${fam}${custom}</div>`;
}

/** Choix d'une pastille de famille : efface la teinte personnalisée. */
export function toggleFamily(scope, el) {
  const already = el.getAttribute('aria-pressed') === 'true';
  scope.querySelectorAll('.colors .dot').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  const custom = scope.querySelector('.colors .dot.custom');
  if (custom) custom.style.backgroundColor = '';
  scope.querySelector('[name="colorHex"]').value = '';
  scope.querySelector('[name="colorKey"]').value = already ? '' : el.dataset.value;
  if (!already) el.setAttribute('aria-pressed', 'true');
}

/** Applique une teinte précise : la famille la plus proche est retenue en même temps. */
export function applyShade(scope, hex) {
  scope.querySelector('[name="colorHex"]').value = hex;
  scope.querySelector('[name="colorKey"]').value = nearestFamily(hex);
  scope.querySelectorAll('.colors .dot').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  const custom = scope.querySelector('.colors .dot.custom');
  if (custom) {
    custom.style.backgroundColor = hex;
    custom.setAttribute('aria-pressed', 'true');
  }
}

export function openShadeSheet(current, onPick) {
  ui.shade = { onPick, native: current || '#C98B9B' };
  const grid = SHADES.map(
    (h) => `<button type="button" class="shade" aria-label="Teinte ${h}" aria-pressed="${(current || '').toLowerCase() === h.toLowerCase()}" data-act="shade.pick" data-hex="${h}" style="background-color:${h}"></button>`,
  ).join('');
  openSheet({
    type: 'html',
    title: 'Nuancier',
    html: `<h2>Nuancier</h2>
      <div class="shades" role="group" aria-label="Teintes">${grid}</div>
      <div class="field" style="margin-top:14px"><label for="shade-native">Une autre couleur exacte</label>
        <div class="row" style="align-items:center">
          <input id="shade-native" type="color" value="${esc(ui.shade.native)}" data-input="shade.native" style="width:64px;height:48px;padding:2px;flex:none">
          <button type="button" class="btn" data-act="shade.useNative">Utiliser cette couleur</button></div></div>
      <div class="actions"><button type="button" class="btn" data-act="sheet.close">Annuler</button></div>`,
  });
}

actions['shade.pick'] = (el) => {
  const cb = ui.shade && ui.shade.onPick;
  closeSheet();
  if (cb) cb(el.dataset.hex);
};
inputs['shade.native'] = (el) => {
  if (ui.shade) ui.shade.native = el.value;
};
actions['shade.useNative'] = () => {
  const s = ui.shade;
  closeSheet();
  if (s && s.onPick) s.onPick(s.native);
};
