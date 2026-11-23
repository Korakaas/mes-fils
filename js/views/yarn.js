import * as store from '../store.js';
import * as L from '../logic.js';
import { shrinkImage } from '../media.js';
import {
  ui, actions, submits, esc, icons, topbar, photoAttrs, data, go, toast, confirmSheet, promptSheet, pickFile, readForm, toNum, numStr, yarnTitle, hydratePhotos, rerender,
} from '../ctx.js';

// ---------- Fiche d'un fil ----------

export function renderYarn(id) {
  const d = data();
  const y = d.yarnsById[id];
  if (!y) return `${topbar('Fil introuvable', { backHref: '#/' })}<p class="hint">Ce fil n’existe plus.</p>`;
  const rem = L.remainingGrams(y);
  const reserved = L.reservedGrams(y.id, d.projects);
  const avail = Math.max(0, rem - reserved);
  const meters = L.metersFromGrams(y, rem);
  const skeins = L.skeinsFromGrams(y, rem);
  const level = L.stockLevel(rem);
  const box = d.boxes.find((b) => b.id === y.boxId);
  const usedG = y.weighedGrams !== null && y.weighedGrams !== undefined && y.weighedGrams !== '' ? Math.max(0, L.totalGrams(y) - rem) : Number(y.usedGrams) || 0;
  const users = d.projects.filter((p) => (p.slots || []).some((s) => (s.allocations || []).some((a) => a.yarnId === y.id)));
  const tags = [y.material, y.weightCategory, L.colorOf(y.colorKey)?.label].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');
  const row = (k, v) => (v ? `<div class="kv"><span>${k}</span><span>${v}</span></div>` : '');
  return `
    ${topbar(yarnTitle(y), { backHref: '#/' })}
    <div class="photo-hero" ${photoAttrs(y.photoId, y.colorKey)}>
      <div class="over"><button type="button" class="btn small" data-act="yarn.photo" data-id="${esc(y.id)}">${icons.camera}${y.photoId ? 'Changer la photo' : 'Ajouter une photo'}</button></div>
    </div>
    <div class="chips wrap" style="margin-bottom:12px">${tags}${y.inStock === false ? '<span class="pill bad">Épuisé</span>' : `<span class="pill ${level.key}">${level.label}</span>`}</div>
    <div class="card stats" aria-label="Quantité restante">
      <div><div class="n">${esc(L.fmtGrams(rem))}</div><div class="l">restant</div></div>
      <div><div class="n">${meters ? `≈ ${esc(L.fmtMeters(meters))}` : '—'}</div><div class="l">mètres</div></div>
      <div><div class="n">${skeins !== null ? `≈ ${esc(numStr(Math.round(skeins * 10) / 10))}` : '—'}</div><div class="l">pelotes</div></div>
    </div>
    <div class="card" style="margin-top:10px">
      <div class="kv"><span>Disponible</span><span>${esc(L.fmtGrams(avail))}</span></div>
      <div class="kv"><span>Réservé par des projets</span><span>${esc(L.fmtGrams(reserved))}</span></div>
      <div class="kv"><span>Déjà utilisé</span><span>${esc(L.fmtGrams(usedG))}</span></div>
    </div>
    <div class="card" style="margin-top:10px">
      ${row('Pelote', y.gramsPerSkein ? `${esc(numStr(y.gramsPerSkein))} g${y.metersPerSkein ? ` · ${esc(numStr(y.metersPerSkein))} m` : ''}` : '')}
      ${row('Nombre de pelotes', y.skeins ? esc(numStr(y.skeins)) : '')}
      ${row('Prix par pelote', y.price !== null && y.price !== '' && y.price !== undefined ? esc(L.fmtEuro(L.toNumber(y.price))) : '')}
      ${row('Marque', esc(y.brand || ''))}
      ${row('Acheté le', y.purchasedAt ? esc(new Date(y.purchasedAt).toLocaleDateString('fr-FR')) : '')}
      ${row('Boîte', box ? esc(box.name) : '<span style="color:var(--muted)">Pas de boîte</span>')}
      ${y.url ? row('Lien', `<a href="${esc(y.url)}" target="_blank" rel="noopener">Ouvrir</a>`) : ''}
      ${y.notes ? row('Notes', esc(y.notes)) : ''}
    </div>
    ${
      users.length
        ? `<div class="section"><h2>Utilisé dans</h2><div class="stack">${users
            .map((p) => {
              const g = (p.slots || []).flatMap((s) => s.allocations || []).filter((a) => a.yarnId === y.id).reduce((s, a) => s + (Number(a.grams) || 0), 0);
              return `<a class="listrow" href="#/projet/${esc(p.id)}"><span class="grow"><span class="t">${esc(p.name)}</span><span class="s">${esc(L.statusLabel(p.status))} · ${esc(L.fmtGrams(g))}</span></span><span class="chev">${icons.chev}</span></a>`;
            })
            .join('')}</div></div>`
        : ''
    }
    <div class="row section">
      <a class="btn" href="#/fil/${esc(y.id)}/modifier">Modifier</a>
      <button type="button" class="btn primary" data-act="yarn.weigh" data-id="${esc(y.id)}">Peser le reste</button>
    </div>
    <div class="stack" style="margin-top:14px">
      ${y.inStock === false ? `<button type="button" class="btn block" data-act="yarn.restock" data-id="${esc(y.id)}">Remettre en stock</button>` : ''}
      <button type="button" class="linkbtn" style="color:var(--bad)" data-act="yarn.delete" data-id="${esc(y.id)}">Supprimer ce fil</button>
    </div>`;
}

actions['yarn.photo'] = async (el) => {
  const file = await pickFile({ accept: 'image/*' });
  if (!file) return;
  const y = store.get('yarns', el.dataset.id);
  if (!y) return;
  const blob = await shrinkImage(file);
  const photoId = await store.putBlob(blob, file.name);
  await store.put('yarns', { ...y, photoId });
  toast('Photo enregistrée');
  rerender();
};

actions['yarn.weigh'] = (el) => {
  const y = store.get('yarns', el.dataset.id);
  promptSheet({
    title: 'Peser le reste',
    label: 'Poids sur la balance, en grammes',
    type: 'number',
    value: y.weighedGrams !== null && y.weighedGrams !== undefined && y.weighedGrams !== '' ? numStr(y.weighedGrams) : '',
    hint: 'Ce poids remplace le calcul. Laisse vide pour revenir au calcul automatique.',
    onConfirm: async (v) => {
      const w = toNum(v);
      const cur = store.get('yarns', y.id);
      const next = { ...cur, weighedGrams: w === null ? null : Math.max(0, w) };
      next.inStock = w === null ? cur.inStock !== false : L.remainingGrams(next) >= 1;
      await store.put('yarns', next);
      toast(w === null ? 'Retour au calcul automatique' : 'Poids enregistré');
      rerender();
    },
  });
};

actions['yarn.restock'] = async (el) => {
  const y = store.get('yarns', el.dataset.id);
  await store.put('yarns', { ...y, inStock: true });
  rerender();
};

actions['yarn.delete'] = (el) => {
  const id = el.dataset.id;
  confirmSheet({
    title: 'Supprimer ce fil ?',
    text: 'Il disparaît du stock et des projets qui l’utilisent.',
    confirmLabel: 'Supprimer',
    danger: true,
    onConfirm: async () => {
      for (const p of store.list('projects')) {
        const slots = (p.slots || []).map((s) => ({ ...s, allocations: (s.allocations || []).filter((a) => a.yarnId !== id) }));
        if (JSON.stringify(slots) !== JSON.stringify(p.slots)) await store.put('projects', { ...p, slots });
      }
      await store.remove('yarns', id);
      toast('Fil supprimé');
      go('#/');
    },
  });
};

// ---------- Formulaire ----------

let draft = { photoFile: null, photoUrl: null };

export function renderYarnForm(id) {
  const d = data();
  const editing = id ? d.yarnsById[id] : null;
  if (id && !editing) return `${topbar('Fil introuvable', { backHref: '#/' })}`;
  draft = { photoFile: null, photoUrl: null };
  const y = editing || { skeins: 1, weightCategory: '', material: '', colorKey: '' };
  const chipGroup = (name, values, current) =>
    `<div class="chips wrap" role="group" aria-label="${name}">${values
      .map((v) => `<button type="button" class="chip" aria-pressed="${current === v}" data-act="yarnform.chip" data-field="${name}" data-value="${esc(v)}">${esc(v)}</button>`)
      .join('')}</div>`;
  const colors = `<div class="colors" role="group" aria-label="Couleur">${L.COLORS.map(
    (c) => `<button type="button" class="dot" aria-label="${esc(c.label)}" aria-pressed="${y.colorKey === c.key}" data-act="yarnform.color" data-value="${c.key}" style="${c.hex.startsWith('linear') ? `background:${c.hex}` : `background-color:${c.hex}`}"></button>`,
  ).join('')}</div>`;
  const boxOptions = ['<option value="">Pas de boîte</option>', ...d.boxes.map((b) => `<option value="${esc(b.id)}" ${y.boxId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`)].join('');
  return `
    ${topbar(editing ? 'Modifier le fil' : 'Ajouter un fil', { backHref: editing ? `#/fil/${id}` : '#/' })}
    <form data-submit="yarn.save" data-id="${esc(id || '')}" id="yarn-form" novalidate>
      <input type="hidden" name="weightCategory" value="${esc(y.weightCategory || '')}">
      <input type="hidden" name="material" value="${esc(y.material || '')}">
      <input type="hidden" name="colorKey" value="${esc(y.colorKey || '')}">
      <div class="row" style="align-items:flex-end;margin-bottom:14px">
        <div style="flex:none;width:96px">
          <button type="button" class="btn block" id="yarn-photo-btn" data-act="yarnform.photo" style="height:96px;border-radius:20px;flex-direction:column;gap:2px;padding:0;background-size:cover;background-position:center" ${y.photoId ? `data-photo="${esc(y.photoId)}"` : ''}>${icons.camera}<span style="font-size:12px">Photo</span></button>
        </div>
        <div class="field" style="margin:0"><label for="f-name">Nom du fil</label><input id="f-name" name="name" type="text" value="${esc(y.name || '')}" required autocomplete="off" placeholder="ex. Phil Coton 4"></div>
      </div>
      <div class="field"><span class="legend">Épaisseur</span>${chipGroup('weightCategory', L.WEIGHTS, y.weightCategory)}</div>
      <div class="field"><span class="legend">Matière</span>${chipGroup('material', L.MATERIALS, y.material)}</div>
      <div class="field"><span class="legend">Couleur</span>${colors}</div>
      <div class="row">
        <div class="field"><label for="f-skeins">Pelotes</label><input id="f-skeins" name="skeins" type="text" inputmode="decimal" value="${esc(numStr(y.skeins))}" placeholder="ex. 5"></div>
        <div class="field"><label for="f-grams">Poids (g)</label><input id="f-grams" name="gramsPerSkein" type="text" inputmode="decimal" value="${esc(numStr(y.gramsPerSkein))}" placeholder="ex. 50"></div>
        <div class="field"><label for="f-meters">Mètres</label><input id="f-meters" name="metersPerSkein" type="text" inputmode="decimal" value="${esc(numStr(y.metersPerSkein))}" placeholder="ex. 85"></div>
      </div>
      <p class="hint" style="margin:-6px 0 14px">Poids et mètres sont ceux d’une pelote, lus sur l’étiquette.</p>
      <details class="more"${editing ? ' open' : ''}><summary>Plus de détails</summary><div class="inner">
        <div class="field"><label for="f-color">Nom du coloris</label><input id="f-color" name="colorName" type="text" value="${esc(y.colorName || '')}" placeholder="ex. Taupe"></div>
        <div class="field"><label for="f-brand">Marque</label><input id="f-brand" name="brand" type="text" value="${esc(y.brand || '')}"></div>
        <div class="row">
          <div class="field"><label for="f-price">Prix d’une pelote (€)</label><input id="f-price" name="price" type="text" inputmode="decimal" value="${esc(numStr(y.price))}"></div>
          <div class="field"><label for="f-date">Acheté le</label><input id="f-date" name="purchasedAt" type="date" value="${esc(y.purchasedAt || '')}"></div>
        </div>
        <div class="field"><label for="f-box">Boîte de rangement</label>
          <div class="row" style="align-items:center"><select id="f-box" name="boxId">${boxOptions}</select>
          <button type="button" class="btn small" style="flex:none" data-act="yarnform.newbox">Nouvelle</button></div></div>
        <div class="field"><label for="f-url">Lien du site</label><input id="f-url" name="url" type="url" value="${esc(y.url || '')}" placeholder="https://"></div>
        <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes" name="notes">${esc(y.notes || '')}</textarea></div>
      </div></details>
      <div class="footer-actions">
        <button type="submit" class="btn primary block">${editing ? 'Enregistrer' : 'Enregistrer le fil'}</button>
        <p class="hint">Le reste (prix, boîte, composition) se complète plus tard.</p>
      </div>
    </form>`;
}

export function afterYarnForm() {
  hydratePhotos(document.getElementById('view'));
}

actions['yarnform.chip'] = (el) => {
  const form = document.getElementById('yarn-form');
  const field = el.dataset.field;
  const input = form.elements[field];
  const already = el.getAttribute('aria-pressed') === 'true';
  el.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  if (already) {
    input.value = '';
  } else {
    el.setAttribute('aria-pressed', 'true');
    input.value = el.dataset.value;
  }
};

actions['yarnform.color'] = (el) => {
  const form = document.getElementById('yarn-form');
  const already = el.getAttribute('aria-pressed') === 'true';
  el.parentElement.querySelectorAll('.dot').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  form.elements.colorKey.value = already ? '' : el.dataset.value;
  if (!already) el.setAttribute('aria-pressed', 'true');
};

actions['yarnform.photo'] = async () => {
  const file = await pickFile({ accept: 'image/*' });
  if (!file) return;
  draft.photoFile = await shrinkImage(file);
  if (draft.photoUrl) URL.revokeObjectURL(draft.photoUrl);
  draft.photoUrl = URL.createObjectURL(draft.photoFile);
  const btn = document.getElementById('yarn-photo-btn');
  btn.style.backgroundImage = `url("${draft.photoUrl}")`;
  btn.style.color = '#fff';
};

actions['yarnform.newbox'] = () => {
  promptSheet({
    title: 'Nouvelle boîte',
    label: 'Nom de la boîte',
    hint: 'ex. Boîte bleue, Tiroir du haut',
    onConfirm: async (name) => {
      if (!name) return;
      const box = await store.put('boxes', { name });
      const sel = document.getElementById('f-box');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = box.id;
        opt.textContent = box.name;
        sel.appendChild(opt);
        sel.value = box.id;
      }
    },
  });
};

submits['yarn.save'] = async (form) => {
  const v = readForm(form);
  const name = (v.name || '').trim();
  if (!name) {
    toast('Donne un nom au fil');
    document.getElementById('f-name').focus();
    return;
  }
  const id = form.dataset.id || null;
  const prev = id ? store.get('yarns', id) : null;
  let photoId = prev ? prev.photoId : null;
  if (draft.photoFile) photoId = await store.putBlob(draft.photoFile, 'photo-fil.jpg');
  const doc = {
    ...(prev || { usedGrams: 0, weighedGrams: null, inStock: true }),
    id: id || undefined,
    name,
    weightCategory: v.weightCategory || '',
    material: v.material || '',
    colorKey: v.colorKey || '',
    colorName: (v.colorName || '').trim(),
    brand: (v.brand || '').trim(),
    skeins: toNum(v.skeins) ?? 1,
    gramsPerSkein: toNum(v.gramsPerSkein),
    metersPerSkein: toNum(v.metersPerSkein),
    price: toNum(v.price),
    purchasedAt: v.purchasedAt || '',
    boxId: v.boxId || '',
    url: (v.url || '').trim(),
    notes: (v.notes || '').trim(),
    photoId,
  };
  const saved = await store.put('yarns', doc);
  toast(prev ? 'Fil modifié' : 'Fil ajouté');
  go(`#/fil/${saved.id}`);
};
