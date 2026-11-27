// Modification en lot : choisir un champ, sa nouvelle valeur, puis confirmer.

import * as store from '../store.js';
import * as L from '../logic.js';
import { ui, actions, submits, openSheet, closeSheet, confirmSheet, promptSheet, esc, icons, data, plural, toast, rerender } from '../ctx.js';

let ids = []; // fils concernés, figés à l'ouverture

const cancelBtn = '<button type="button" class="btn" data-act="sheet.close">Annuler</button>';
const row = (act, attrs, label) =>
  `<button type="button" class="listrow" data-act="${act}" ${attrs}><span class="grow"><span class="t">${esc(label)}</span></span><span class="chev">${icons.chev}</span></button>`;

function listSheet(title, rows) {
  openSheet({ type: 'html', title, html: `<h2>${esc(title)}</h2><div class="stack" style="gap:8px">${rows}</div><div class="actions">${cancelBtn}</div>` });
}

export function openBulkEdit(selected) {
  if (!selected.length) return;
  ids = selected;
  listSheet(`Modifier ${plural(ids.length, 'fil', 'fils')}`, L.BULK_FIELDS.map((f) => row('bulk.field', `data-field="${f.key}"`, f.label)).join(''));
}

actions['bulk.field'] = (el) => {
  const field = el.dataset.field;
  const { label } = L.BULK_FIELDS.find((f) => f.key === field);
  if (field === 'boxId') {
    const boxes = [{ id: '', name: 'Pas de boîte' }, ...data().boxes];
    listSheet(label, boxes.map((b) => row('bulk.value', `data-field="boxId" data-value="${esc(b.id)}"`, b.name)).join('') + row('bulk.newBox', '', '+ Nouvelle boîte'));
  } else if (field === 'weightCategory' || field === 'material') {
    const values = field === 'material' ? L.MATERIALS : L.WEIGHTS;
    listSheet(label, values.map((v) => row('bulk.value', `data-field="${field}" data-value="${esc(v)}"`, v)).join(''));
  } else {
    const input = {
      brand: 'type="text" autocomplete="off"',
      price: 'type="text" inputmode="decimal" autocomplete="off" placeholder="ex. 3,50"',
      purchasedAt: 'type="date"',
    }[field];
    const title = field === 'price' ? 'Prix d’une pelote (€)' : label;
    openSheet({
      type: 'html',
      title,
      html: `<h2>${esc(title)}</h2>
        <form data-submit="bulk.input" data-field="${field}" class="stack" novalidate>
          <div class="field"><label for="bulk-input">Nouvelle valeur pour ${plural(ids.length, 'fil', 'fils')}</label><input id="bulk-input" name="v" ${input}></div>
          <div class="actions">${cancelBtn}<button type="submit" class="btn primary">Continuer</button></div>
        </form>`,
    });
    document.getElementById('bulk-input').focus();
  }
};

actions['bulk.value'] = (el) => confirmChange(el.dataset.field, el.dataset.value);

submits['bulk.input'] = (form) => confirmChange(form.dataset.field, new FormData(form).get('v'));

actions['bulk.newBox'] = () => {
  promptSheet({
    title: 'Nouvelle boîte',
    label: 'Nom de la boîte',
    hint: 'ex. Boîte bleue, Tiroir du haut',
    confirmLabel: 'Continuer',
    // La boîte n'est créée qu'à la confirmation : annuler ne laisse pas de boîte vide
    onConfirm: async (name) => {
      if (name) confirmChange('boxId', '', name);
    },
  });
};

/** Prix changé : les projets qui utilisent ces fils voient leur coût recalculé. */
function costWarning(changed) {
  const touched = new Set(changed.map((y) => y.id));
  const count = data().projects.filter((p) => (p.slots || []).some((s) => (s.allocations || []).some((a) => touched.has(a.yarnId)))).length;
  return count ? ` Le coût de ${plural(count, 'projet', 'projets')} sera recalculé.` : '';
}

function confirmChange(field, raw, newBoxName = '') {
  const parsed = L.parseBulkValue(field, newBoxName ? 'nouvelle' : raw);
  if (!parsed.ok) {
    toast(parsed.error);
    return;
  }
  const d = data();
  const changed = L.bulkChanges(d.yarns, ids, field, parsed.value);
  if (!changed.length) {
    closeSheet();
    toast(ids.length > 1 ? 'Ces fils ont déjà cette valeur' : 'Ce fil a déjà cette valeur');
    return;
  }
  const { label } = L.BULK_FIELDS.find((f) => f.key === field);
  let shown = String(parsed.value);
  if (field === 'boxId') shown = newBoxName || d.boxes.find((b) => b.id === parsed.value)?.name || 'Pas de boîte';
  if (field === 'price') shown = L.fmtEuro(parsed.value);
  if (field === 'purchasedAt') shown = new Date(parsed.value).toLocaleDateString('fr-FR');
  const same = ids.length - changed.length;
  const replaced = changed.filter((c) => {
    const before = d.yarnsById[c.id][field];
    return before !== undefined && before !== null && before !== '';
  }).length;
  const text = [
    `${label} : ${shown}.`,
    replaced ? `${plural(replaced, 'valeur déjà remplie sera remplacée', 'valeurs déjà remplies seront remplacées')}.` : '',
    same ? `${plural(same, 'fil a déjà cette valeur', 'fils ont déjà cette valeur')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  confirmSheet({
    title: `Modifier ${plural(changed.length, 'fil', 'fils')} ?`,
    text: text + (field === 'price' ? costWarning(changed) : ''),
    confirmLabel: 'Modifier',
    onConfirm: () => apply(field, parsed.value, newBoxName),
  });
}

async function apply(field, value, newBoxName) {
  let next = value;
  if (newBoxName) next = (await store.put('boxes', { name: newBoxName })).id;
  else if (field === 'boxId' && next && !store.get('boxes', next)) {
    toast('Cette boîte n’existe plus');
    return;
  }
  // Recalculé maintenant : un fil a pu changer ou disparaître depuis l'ouverture (synchro)
  const changed = L.bulkChanges(store.list('yarns'), ids, field, next);
  for (const y of changed) await store.put('yarns', y);
  ui.selecting = false;
  ui.selected = new Set();
  toast(plural(changed.length, 'fil modifié', 'fils modifiés'));
  rerender();
}
