import * as store from '../store.js';
import * as L from '../logic.js';
import { shrinkImage } from '../media.js';
import { slotsFromPattern } from './patterns.js';
import {
  ui, actions, inputs, submits, esc, icons, topbar, data, go, toast, confirmSheet, promptSheet, optionsSheet, openSheet, closeSheet, pickFile, patternFiles, toNum, numStr,
  yarnTitle, emptyState, photoAttrs, hydratePhotos, rerender, switchRow, paintOverlay,
} from '../ctx.js';

const STATUS_KIND = { envie: 'soft', en_cours: 'info', en_pause: 'warn', abandonne: 'bad', termine: 'good', offert: 'good' };
const FILTERS = [{ key: 'tous', label: 'Tous' }, ...L.STATUSES.map((s) => ({ key: s.key, label: s.label }))];

function statusPill(p) {
  return `<span class="pill ${STATUS_KIND[p.status] || 'soft'}">${esc(L.statusLabel(p.status))}</span>`;
}

function yarnSummary(p, d) {
  const ps = L.projectStatus(p, d.yarnsById, d.projects, d.settings.margin);
  if (!ps.count) return { kind: 'info', text: 'Aucun fil choisi' };
  if (ps.all) return { kind: 'good', text: 'Assez de fil' };
  if (ps.missing) return { kind: 'bad', text: `Il manque du fil (${ps.missing})` };
  if (ps.pending) return { kind: 'info', text: `${ps.pending} fil${ps.pending > 1 ? 's' : ''} à choisir` };
  return { kind: 'warn', text: 'À préciser' };
}

// ---------- Liste ----------

export function renderProjects() {
  const d = data();
  const list = d.projects
    .filter((p) => ui.projectFilter === 'tous' || p.status === ui.projectFilter)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const count = (k) => (k === 'tous' ? d.projects.length : d.projects.filter((p) => p.status === k).length);
  const chips = FILTERS.map((f) => `<button type="button" class="chip" aria-pressed="${ui.projectFilter === f.key}" data-act="projects.filter" data-key="${f.key}">${f.label} (${count(f.key)})</button>`).join('');
  const rows = list
    .map((p) => {
      const sum = yarnSummary(p, d);
      const pattern = d.patterns.find((x) => x.id === p.patternId);
      const photo = (p.photos || [])[0] || (pattern && pattern.photoId) || '';
      return `<a class="listrow" href="#/projet/${esc(p.id)}"><span class="thumb" ${photo ? photoAttrs(photo, '') : ''}>${photo ? '' : icons.folder}</span>
        <span class="grow"><span class="t">${esc(p.name)}</span><span class="s">${statusPill(p)} <span style="margin-left:4px">${esc(sum.text)}</span></span></span><span class="chev">${icons.chev}</span></a>`;
    })
    .join('');
  return `
    <div class="topbar"><h1>Mes projets</h1></div>
    <div class="chips" role="group" aria-label="Filtrer par statut">${chips}</div>
    ${list.length ? `<div class="stack">${rows}</div>` : emptyState(icons.folder, d.projects.length ? 'Aucun projet avec ce statut.' : 'Pas encore de projet. Importe un patron (PDF ou photos) pour en démarrer un.', '<a class="btn primary" href="#/projet/nouveau">Nouveau projet</a>')}
    ${d.patterns.length ? `<p style="text-align:center;margin:18px 0 0"><a class="linkbtn" href="#/patrons">Mes patrons enregistrés (${d.patterns.length})</a></p>` : ''}
    <a class="fab" href="#/projet/nouveau">${icons.plus}Nouveau projet</a>`;
}

export function afterList() {
  hydratePhotos(document.getElementById('view'));
}

actions['projects.filter'] = (el) => {
  ui.projectFilter = el.dataset.key;
  rerender();
};

// ---------- Nouveau projet ----------

export function renderProjectNew() {
  const d = data();
  const pats = [...d.patterns].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const again = pats.length
    ? `<div class="section"><h2>Refaire un patron déjà utilisé</h2><div class="stack">${pats
        .map(
          (pt) => `<button type="button" class="listrow" style="width:100%;text-align:left;font:inherit;color:inherit" data-act="project.fromPattern" data-id="${esc(pt.id)}"><span class="thumb" ${pt.photoId ? photoAttrs(pt.photoId, '') : ''}>${pt.photoId ? '' : icons.doc}</span>
          <span class="grow"><span class="t">${esc(pt.title || 'Patron sans titre')}</span><span class="s">Mêmes instructions et même matériel</span></span><span class="chev">${icons.chev}</span></button>`,
        )
        .join('')}</div></div>`
    : '';
  return `
    ${topbar('Nouveau projet', { backHref: '#/projets' })}
    <div class="stack">
      <button type="button" class="btn primary block" style="min-height:64px" data-act="pattern.pickPdf">${icons.doc}Importer un PDF</button>
      <p class="hint">L’appli lit le texte du PDF et en tire le matériel : fils, crochets, accessoires. Tu relis et tu corriges avant de créer le projet.</p>
      <button type="button" class="btn block" data-act="pattern.pickImage">${icons.camera}Photos ou captures du patron</button>
      <p class="hint">Plusieurs images possibles : l’appli lit le matériel dessus et tu pourras remettre les pages dans l’ordre.</p>
      <button type="button" class="btn block" data-act="pattern.manual">Saisir le patron à la main</button>
    </div>
    <div id="pattern-busy" class="spinner" hidden>Lecture du patron…</div>
    ${again}
    <div class="section"><h2>Sans patron</h2>
      <form data-submit="project.create" class="stack">
        <div class="field"><label for="np-name">Nom du projet</label><input id="np-name" name="name" type="text" autocomplete="off" placeholder="ex. Plaid du salon"></div>
        <button class="btn block" type="submit">Créer le projet sans patron</button>
      </form></div>`;
}

actions['project.fromPattern'] = async (el) => {
  const pattern = store.get('patterns', el.dataset.id);
  if (!pattern) return;
  const p = await store.put('projects', {
    name: pattern.title || 'Projet',
    status: 'envie',
    patternId: pattern.id,
    keepReservedOnPause: true,
    slots: slotsFromPattern(pattern),
    photos: [],
  });
  toast('Projet créé');
  go(`#/projet/${p.id}`);
};

actions['project.editPattern'] = (el) => {
  ui.patternBack = `#/projet/${el.dataset.pid}`;
  go(`#/patron/${el.dataset.id}`);
};

submits['project.create'] = async (form) => {
  const v = Object.fromEntries(new FormData(form));
  const pattern = v.patternId ? store.get('patterns', v.patternId) : null;
  const name = (v.name || '').trim() || (pattern ? pattern.title : '');
  if (!name) {
    toast('Donne un nom au projet');
    document.getElementById('np-name').focus();
    return;
  }
  const p = await store.put('projects', {
    name,
    status: 'envie',
    patternId: pattern ? pattern.id : '',
    keepReservedOnPause: true,
    slots: pattern ? slotsFromPattern(pattern) : [],
    photos: [],
  });
  go(`#/projet/${p.id}`);
};

// ---------- Fiche d'un projet ----------

function allocRow(slotId, a, d, projectId) {
  const y = d.yarnsById[a.yarnId];
  if (!y) return `<div class="alloc"><span class="grow" style="color:var(--bad)">Fil supprimé</span><button type="button" class="linkbtn" data-act="project.unalloc" data-slot="${esc(slotId)}" data-yarn="${esc(a.yarnId)}">Retirer</button></div>`;
  const avail = L.availableGrams(y, d.projects, projectId);
  const over = Number(a.grams) > avail + 0.0001;
  return `<div class="alloc"><span class="sw" ${photoAttrs(y.photoId, y.colorKey, y.colorHex)}></span>
    <span class="grow">${esc(yarnTitle(y))}${over ? `<br><span style="color:var(--bad);font-weight:600;font-size:12px">Seulement ${esc(L.fmtGrams(avail))} disponibles</span>` : ''}</span>
    <input type="text" inputmode="decimal" value="${esc(numStr(a.grams))}" aria-label="Grammes pris dans ${esc(yarnTitle(y))}" data-change="project.alloc" data-slot="${esc(slotId)}" data-yarn="${esc(a.yarnId)}"><span aria-hidden="true">g</span>
    <button type="button" class="iconbtn ghost" style="width:36px;height:36px" aria-label="Retirer ce fil" data-act="project.unalloc" data-slot="${esc(slotId)}" data-yarn="${esc(a.yarnId)}">${icons.close}</button></div>`;
}

const slotTitle = (s) => `${s.label || 'Fil'}${s.colorName ? ` · ${s.colorName}` : ''}`;

function slotCard(s, d, p) {
  const st = L.slotStatus(s, d.yarnsById, d.projects, p, d.settings.margin);
  let pillHtml;
  if (st.unknown) pillHtml = '<span class="pill info">Besoin à préciser</span>';
  else if (st.ok) pillHtml = `<span class="pill good">${st.scraps ? 'Restes' : 'Assez'}</span>`;
  else if (!st.hasYarn) pillHtml = '<span class="pill info">À choisir</span>';
  else if (st.conflict) pillHtml = '<span class="pill bad">Déjà réservé</span>';
  else pillHtml = `<span class="pill bad">Il manque ${esc(L.fmtGrams(st.shortfall))}</span>`;
  const need = st.scraps ? 'Petite quantité : un reste de pelote suffit' : st.needMargin !== null ? `Besoin ${L.fmtGrams(st.need)}, soit ${L.fmtGrams(st.needMargin)} avec marge` : 'Ajoute un poids ou des mètres pour comparer';
  return `<div class="card slot"><div class="head"><div><div class="label">${esc(slotTitle(s))}</div><div class="need">${esc(need)}${s.weightCategory ? ` · ${esc(s.weightCategory)}` : ''}</div></div>${pillHtml}</div>
    ${(s.allocations || []).map((a) => allocRow(s.id, a, d, p.id)).join('')}
    <div class="row"><a class="btn small" href="#/projet/${esc(p.id)}/choisir/${esc(s.id)}">${(s.allocations || []).length ? 'Changer de fil' : 'Choisir un fil'}</a>
    <button type="button" class="btn small" data-act="project.slotMenu" data-slot="${esc(s.id)}">Modifier la ligne</button></div></div>`;
}

export function renderProject(id) {
  const d = data();
  const p = store.get('projects', id);
  if (!p) return `${topbar('Projet introuvable', { backHref: '#/projets' })}<p class="hint">Ce projet n’existe plus.</p>`;
  const pattern = d.patterns.find((x) => x.id === p.patternId);
  const ps = L.projectStatus(p, d.yarnsById, d.projects, d.settings.margin);
  let banner;
  if (!ps.count) banner = `<div class="banner info">${icons.info}<span>Ajoute les fils du projet<span class="sub">Choisis-les dans ton stock : l’appli vérifie les quantités.</span></span></div>`;
  else if (ps.all) banner = `<div class="banner good">${icons.check}<span>Assez de fil pour tout le projet</span></div>`;
  else if (ps.missing) banner = `<div class="banner bad">${icons.alert}<span>Il manque du fil pour ${ps.missing} ligne${ps.missing > 1 ? 's' : ''}${ps.pending ? `<span class="sub">${ps.pending} autre${ps.pending > 1 ? 's' : ''} à choisir</span>` : ''}</span></div>`;
  else if (ps.pending) banner = `<div class="banner info">${icons.info}<span>${ps.pending} fil${ps.pending > 1 ? 's' : ''} à choisir<span class="sub">Choisis-les dans ton stock : l’appli vérifie les quantités.</span></span></div>`;
  else banner = `<div class="banner warn">${icons.info}<span>${ps.unknown} ligne${ps.unknown > 1 ? 's' : ''} à préciser<span class="sub">Indique un poids ou des mètres pour comparer.</span></span></div>`;
  const cost = L.projectCost(p, d.yarnsById);
  const photos = (p.photos || []).map((ph, i) => `<button type="button" class="ph" aria-label="Voir la photo ${i + 1}" data-act="project.photoOpen" data-idx="${i}" ${photoAttrs(ph, '')}></button>`).join('');
  const patternCard = pattern
    ? `<a class="listrow" href="#/lire/${esc(pattern.id)}/${esc(p.id)}" aria-label="Ouvrir les instructions du patron ${esc(pattern.title)}"><span class="thumb">${icons.doc}</span>
        <span class="grow"><span class="t">Instructions · ${esc(pattern.title)}</span><span class="s">${(() => { const n = patternFiles(pattern).length; return n ? `${n} fichier${n > 1 ? 's' : ''} · ` : ''; })()}ouvrir les instructions</span></span><span class="chev">${icons.chev}</span></a>
      <div class="row" style="margin-top:8px"><button type="button" class="btn small" data-act="project.editPattern" data-id="${esc(pattern.id)}" data-pid="${esc(p.id)}">Pages et matériel</button>
      <button type="button" class="btn small" data-act="project.fromPattern" data-id="${esc(pattern.id)}">Refaire ce patron</button></div>`
    : `<button type="button" class="btn block" data-act="project.linkPattern">Lier un patron</button>`;
  return `
    ${topbar(p.name, { backHref: '#/projets', right: `<button type="button" class="linkbtn" data-act="project.rename">Renommer</button>` })}
    <div class="chips" role="group" aria-label="Statut du projet">${L.STATUSES.map((s) => `<button type="button" class="chip" aria-pressed="${p.status === s.key}" data-act="project.status" data-key="${s.key}">${s.label}</button>`).join('')}</div>
    ${switchRow('pause-sw', 'Garder les fils réservés si le projet est en pause', p.keepReservedOnPause !== false, 'project.togglePause')}
    ${banner}
    <div style="margin-top:12px">${patternCard}</div>
    <div class="section"><h2>Fils du projet<small>Marge de ${Math.round(d.settings.margin * 100)} % comprise</small></h2>
      <div class="stack">${(p.slots || []).map((s) => slotCard(s, d, p)).join('')}
      <button type="button" class="btn block" style="border-style:dashed;color:var(--accent)" data-act="project.addSlot">+ Ajouter un fil au projet</button></div></div>
    <div class="section"><h2>Photos</h2>
      <div class="photos"><button type="button" class="add" data-act="project.photoAdd">${icons.camera}Ajouter</button>${photos}</div>
      <p class="hint" style="margin-top:6px">Photos d’avancement et de résultat.</p></div>
    <div class="section"><h2>Détails</h2><div class="card">
      <div class="kv"><span>Coût estimé</span><span>${ps.count ? (cost.total > 0 ? `${esc(L.fmtEuro(cost.total))}${cost.complete ? '' : ' (prix manquants)'}` : 'Prix des fils à renseigner') : '—'}</span></div>
      ${switchRow('gift-sw', 'C’est un cadeau', !!p.isGift, 'project.toggleGift')}
      ${
        p.isGift
          ? `<form data-submit="project.saveGift" id="gift-form" class="stack" style="margin-top:6px"><div class="field"><label for="g-to">Pour qui</label><input id="g-to" name="giftTo" type="text" value="${esc(p.giftTo || '')}"></div>
          <div class="field"><label for="g-date">Date limite</label><input id="g-date" name="giftDeadline" type="date" value="${esc(p.giftDeadline || '')}"></div>
          <button type="submit" class="btn small">Enregistrer</button></form>`
          : ''
      }
    </div></div>
    <div class="field section"><label for="pr-notes">Notes</label><textarea id="pr-notes" data-change="project.notes">${esc(p.notes || '')}</textarea></div>
    <button type="button" class="linkbtn" style="color:var(--bad)" data-act="project.delete">Supprimer ce projet</button>`;
}

export function afterProject() {
  hydratePhotos(document.getElementById('view'));
}

function currentProject() {
  const m = /^#\/projet\/([^/]+)/.exec(location.hash);
  return m ? store.get('projects', m[1]) : null;
}

async function saveProject(patch) {
  const p = currentProject();
  if (!p) return null;
  return store.put('projects', { ...p, ...patch });
}

actions['project.rename'] = () => {
  const p = currentProject();
  promptSheet({
    title: 'Renommer le projet',
    label: 'Nom',
    value: p.name,
    onConfirm: async (v) => {
      if (!v) return;
      await saveProject({ name: v });
      rerender();
    },
  });
};

actions['project.togglePause'] = async () => {
  const p = currentProject();
  await saveProject({ keepReservedOnPause: !(p.keepReservedOnPause !== false) });
  rerender();
};

actions['project.toggleGift'] = async () => {
  const p = currentProject();
  await saveProject({ isGift: !p.isGift });
  rerender();
};

submits['project.saveGift'] = async (form) => {
  const v = Object.fromEntries(new FormData(form));
  await saveProject({ giftTo: (v.giftTo || '').trim(), giftDeadline: v.giftDeadline || '' });
  toast('Cadeau enregistré');
};


export const changes = {
  'project.notes': async (el) => {
    await saveProject({ notes: el.value.trim() });
  },
  'project.alloc': async (el) => {
    const p = currentProject();
    const g = Math.max(0, toNum(el.value) ?? 0);
    const slots = (p.slots || []).map((s) =>
      s.id === el.dataset.slot ? { ...s, allocations: (s.allocations || []).map((a) => (a.yarnId === el.dataset.yarn ? { ...a, grams: g } : a)) } : s,
    );
    await saveProject({ slots });
    rerender();
  },
};

actions['project.unalloc'] = async (el) => {
  const p = currentProject();
  const slots = (p.slots || []).map((s) => (s.id === el.dataset.slot ? { ...s, allocations: (s.allocations || []).filter((a) => a.yarnId !== el.dataset.yarn) } : s));
  await saveProject({ slots });
  rerender();
};

actions['project.addSlot'] = () => {
  promptSheet({
    title: 'Ajouter un fil',
    label: 'À quoi sert ce fil ?',
    hint: 'ex. Fil beige pour le corps',
    onConfirm: async (label) => {
      const p = currentProject();
      const slot = { id: L.uid(), kind: 'yarn', label: label || 'Fil', weightCategory: '', grams: null, meters: null, skeins: null, skeinGrams: null, skeinMeters: null, allocations: [] };
      await saveProject({ slots: [...(p.slots || []), slot] });
      go(`#/projet/${p.id}/choisir/${slot.id}`);
    },
  });
};

actions['project.slotMenu'] = (el) => {
  const p = currentProject();
  const s = (p.slots || []).find((x) => x.id === el.dataset.slot);
  openSheet({
    type: 'html',
    title: 'Modifier la ligne',
    html: `<h2>Modifier la ligne</h2>
      <form data-submit="project.saveSlot" data-slot="${esc(s.id)}" class="stack">
        <div class="field"><label for="s-label">Description</label><input id="s-label" name="label" type="text" value="${esc(s.label || '')}"></div>
        <div class="field"><label for="s-colorname">Coloris</label><input id="s-colorname" name="colorName" type="text" value="${esc(s.colorName || '')}" placeholder="ex. 001 blanc"></div>
        <div class="field"><label for="s-weight">Épaisseur</label><select id="s-weight" name="weightCategory"><option value="">Peu importe</option>${L.WEIGHTS.map((w) => `<option ${s.weightCategory === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
        <label class="chk"><input type="checkbox" name="scraps" ${s.scraps ? 'checked' : ''}><span>Petite quantité : un reste de pelote suffit</span></label>
        <div class="row"><div class="field"><label for="s-grams">Besoin (g)</label><input id="s-grams" name="grams" type="text" inputmode="decimal" value="${esc(numStr(s.grams))}"></div>
        <div class="field"><label for="s-meters">Besoin (m)</label><input id="s-meters" name="meters" type="text" inputmode="decimal" value="${esc(numStr(s.meters))}"></div></div>
        <div class="actions"><button type="button" class="btn danger" data-act="project.removeSlot" data-slot="${esc(s.id)}">Retirer</button><button type="submit" class="btn primary">Enregistrer</button></div>
      </form>`,
  });
};

submits['project.saveSlot'] = async (form) => {
  const v = Object.fromEntries(new FormData(form));
  const p = currentProject();
  const slots = (p.slots || []).map((s) =>
    s.id === form.dataset.slot ? { ...s, label: (v.label || '').trim() || 'Fil', colorName: (v.colorName || '').trim(), scraps: v.scraps === 'on', weightCategory: v.weightCategory || '', grams: toNum(v.grams), meters: toNum(v.meters), skeins: null } : s,
  );
  closeSheet();
  await saveProject({ slots });
  rerender();
};

actions['project.removeSlot'] = async (el) => {
  const p = currentProject();
  closeSheet();
  await saveProject({ slots: (p.slots || []).filter((s) => s.id !== el.dataset.slot) });
  rerender();
};

actions['project.linkPattern'] = () => {
  const d = data();
  if (!d.patterns.length) {
    toast('Importe d’abord un patron');
    return;
  }
  optionsSheet({
    title: 'Lier un patron',
    options: d.patterns.map((p) => ({ value: p.id, label: p.title })),
    selected: [],
    multi: false,
    onChange: async ([id]) => {
      const pat = store.get('patterns', id);
      const p = currentProject();
      if (!pat || !p) return;
      const extra = (p.slots || []).length ? [] : slotsFromPattern(pat);
      closeSheet();
      await saveProject({ patternId: id, slots: [...(p.slots || []), ...extra] });
      rerender();
    },
  });
};

actions['project.delete'] = () => {
  const p = currentProject();
  confirmSheet({
    title: 'Supprimer ce projet ?',
    text: 'Les fils réservés sont libérés. Le stock n’est pas modifié.',
    confirmLabel: 'Supprimer',
    danger: true,
    onConfirm: async () => {
      await store.remove('projects', p.id);
      toast('Projet supprimé');
      go('#/projets');
    },
  });
};

// ---------- Statut ----------

actions['project.status'] = async (el) => {
  const p = currentProject();
  const next = el.dataset.key;
  if (next === p.status) return;
  const d = data();
  const hasAlloc = (p.slots || []).some((s) => (s.allocations || []).length);
  if ((next === 'termine' || next === 'offert') && hasAlloc && !p.consumed) {
    openFinishSheet(p, next, d);
    return;
  }
  await saveProject({ status: next });
  if (next === 'en_cours') {
    const ps = L.projectStatus({ ...p, status: 'en_cours' }, d.yarnsById, d.projects, d.settings.margin);
    if (ps.states.some((s) => s.conflict)) toast('Attention : certains fils sont déjà réservés par un autre projet');
  }
  rerender();
};

function allocatedByYarn(p) {
  const out = new Map();
  for (const s of p.slots || []) for (const a of s.allocations || []) out.set(a.yarnId, (out.get(a.yarnId) || 0) + (Number(a.grams) || 0));
  return out;
}

function openFinishSheet(p, next, d) {
  const alloc = allocatedByYarn(p);
  const rows = [...alloc.entries()]
    .map(([yarnId, g]) => {
      const y = d.yarnsById[yarnId];
      if (!y) return '';
      return `<div class="field"><label for="w-${esc(yarnId)}">${esc(yarnTitle(y))} · prévu ${esc(L.fmtGrams(g))}</label>
        <input id="w-${esc(yarnId)}" name="w_${esc(yarnId)}" type="text" inputmode="decimal" placeholder="Poids restant (g)"></div>`;
    })
    .join('');
  openSheet({
    type: 'html',
    title: 'Mettre à jour le stock',
    html: `<h2>Mettre à jour le stock</h2>
      <p class="hint">Pèse ce qui reste de chaque fil. Si tu laisses vide, l’appli retire la quantité prévue. Un reste de moins de ${d.settings.restThreshold} g sort du stock.</p>
      <form data-submit="project.finish" data-next="${esc(next)}" class="stack">${rows}
        <div class="actions"><button type="button" class="btn" data-act="sheet.close">Annuler</button><button type="submit" class="btn primary">Terminer le projet</button></div></form>`,
  });
}

submits['project.finish'] = async (form) => {
  const p = currentProject();
  const next = form.dataset.next;
  const v = Object.fromEntries(new FormData(form));
  const d = data();
  closeSheet();
  const alloc = allocatedByYarn(p);
  for (const [yarnId, g] of alloc.entries()) {
    const y = store.get('yarns', yarnId);
    if (!y) continue;
    const w = toNum(v[`w_${yarnId}`]);
    await store.put('yarns', L.finishConsumption(y, g, w, d.settings.restThreshold));
  }
  await saveProject({ status: next, consumed: true });
  toast('Stock mis à jour');
  rerender();
};

// ---------- Photos ----------

actions['project.photoAdd'] = async () => {
  const file = await pickFile({ accept: 'image/*' });
  if (!file) return;
  const blob = await shrinkImage(file);
  const id = await store.putBlob(blob, file.name);
  const p = currentProject();
  await saveProject({ photos: [...(p.photos || []), id] });
  rerender();
};

actions['project.photoOpen'] = async (el) => {
  const p = currentProject();
  const idx = Number(el.dataset.idx);
  const photoId = (p.photos || [])[idx];
  const url = await store.blobUrl(photoId);
  if (!url) return;
  ui.lightbox = {
    url,
    onDelete: async () => {
      const cur = currentProject();
      await saveProject({ photos: (cur.photos || []).filter((x) => x !== photoId) });
      rerender();
    },
  };
  paintOverlay();
};

// ---------- Choisir un fil ----------

export function renderChoose(projectId, slotId) {
  const d = data();
  const p = store.get('projects', projectId);
  const slot = p && (p.slots || []).find((s) => s.id === slotId);
  if (!p || !slot) return `${topbar('Introuvable', { backHref: '#/projets' })}`;
  const f = ui.chooseFilters;
  if (slot.scraps && L.needGrams(slot, null) === null) return renderChooseScraps(d, p, slot);
  const res = L.candidatesForSlot(slot, d.yarns, d.projects, { margin: d.settings.margin, projectId: p.id, filters: f });
  const refNeed = L.needGrams(slot, null);
  const needM = L.withMargin(refNeed, d.settings.margin);
  const needLine = needM !== null ? `Besoin ${L.fmtGrams(refNeed)}, soit ${L.fmtGrams(needM)} avec marge` : 'Besoin à préciser : indique un poids ou un métrage sur la ligne';
  const sel = ui.chooseSel;
  const label = (r) => yarnTitle(r.yarn);
  const nFilter = f.weights.length + f.materials.length + f.colors.length;
  const pickRow = (ids, title, sub, pillHtml) => {
    const on = ids.every((i) => sel.has(i));
    return `<button type="button" class="pick" aria-pressed="${on}" data-act="choose.toggle" data-ids="${esc(ids.join(','))}"><span class="box"></span><span class="grow"><span class="t">${title}</span><span class="s">${sub}</span></span>${pillHtml || ''}</button>`;
  };
  const enough = res.enough.map((r) =>
    pickRow([r.yarn.id], esc(label(r)), `${esc(L.fmtGrams(r.available))} disponibles · ${esc(r.sameWeight ? 'Même épaisseur' : r.yarn.weightCategory ? `Autre épaisseur (${r.yarn.weightCategory})` : 'Épaisseur non précisée')}${r.sameColor ? ' · Même couleur' : ''} · reste ${esc(L.fmtGrams(r.leftover))}`),
  );
  const combine = res.combine.map((c) =>
    pickRow(c.yarns.map((r) => r.yarn.id), c.yarns.map((r) => esc(label(r))).join(' + '), `${c.yarns.map((r) => esc(L.fmtGrams(r.available))).join(' + ')} = ${esc(L.fmtGrams(c.sum))} · reste ${esc(L.fmtGrams(c.leftover))}`),
  );
  const insuff = res.insufficient.map((r) => {
    let pillHtml = '';
    let sub = `${esc(L.fmtGrams(r.available))} disponibles`;
    if (r.reason === 'reserved') {
      const who = L.reservingProjects(r.yarn.id, d.projects, p.id)[0];
      pillHtml = `<span class="pill info">Réservé${who ? ` · ${esc(who.name)}` : ''}</span>`;
    } else if (r.reason === 'short') pillHtml = `<span class="pill bad">Il manque ${esc(L.fmtGrams(r.short))}</span>`;
    else sub = 'Besoin à préciser pour comparer';
    return pickRow([r.yarn.id], esc(label(r)), sub, pillHtml);
  });
  const section = (title, count, rows) => (rows.length ? `<div class="section"><h2>${title}${count ? ` (${count})` : ''}</h2><div class="stack">${rows.join('')}</div></div>` : '');
  const chosen = [...sel].map((id) => d.yarnsById[id]).filter(Boolean);
  const total = chosen.reduce((s, y) => s + L.availableGrams(y, d.projects, p.id), 0);
  const chip = (key, text, n) => `<button type="button" class="chip" aria-pressed="${n > 0}" data-act="choose.filter" data-key="${key}">${text}${n ? ` · ${n}` : ''}</button>`;
  return `
    ${topbar('Choisir un fil', { backHref: `#/projet/${p.id}` })}
    <div class="card"><div style="font-weight:800">${esc(slotTitle(slot))}${slot.weightCategory ? ` · ${esc(slot.weightCategory)}` : ''}</div><div class="hint">${esc(needLine)}</div></div>
    <div class="chips" style="margin-top:10px" role="group" aria-label="Filtres">${chip('weights', 'Épaisseur', f.weights.length)}${chip('materials', 'Matière', f.materials.length)}${chip('colors', 'Couleur', f.colors.length)}
      ${nFilter ? '<button type="button" class="chip" data-act="choose.clear">Effacer</button>' : ''}</div>
    <p class="hint" style="margin-top:-4px">Aucun filtre n’est obligatoire.</p>
    ${section('Assez de fil', res.enough.length, enough)}${section('À combiner', res.combine.length, combine)}${section('Pas assez ou déjà réservé', res.insufficient.length, insuff)}
    ${!res.enough.length && !res.combine.length && !res.insufficient.length ? emptyState(icons.ball, 'Aucun fil en stock ne correspond.') : ''}
    <div class="footer-actions">
      ${chosen.length ? `<p class="hint">${chosen.length} fil${chosen.length > 1 ? 's' : ''} choisi${chosen.length > 1 ? 's' : ''} · ${esc(L.fmtGrams(total))} disponibles${needM !== null ? ` pour ${esc(L.fmtGrams(needM))} demandés` : ''}</p>` : ''}
      <button type="button" class="btn primary block" data-act="choose.validate" ${chosen.length ? '' : 'disabled'}>Valider</button>
    </div>`;
}

/** Choix d'un fil pour une petite quantité : on propose d'abord les restes qui ressemblent à ce qu'il faut. */
function renderChooseScraps(d, p, slot) {
  const f = ui.chooseFilters;
  const sel = ui.chooseSel;
  const rows = L.scrapsCandidates(slot, d.yarns, d.projects, { projectId: p.id, filters: f });
  const nFilter = f.weights.length + f.materials.length + f.colors.length;
  const chip = (key, text, n) => `<button type="button" class="chip" aria-pressed="${n > 0}" data-act="choose.filter" data-key="${key}">${text}${n ? ` · ${n}` : ''}</button>`;
  const list = rows
    .map((r) => {
      const tags = [r.sameColor ? 'Même couleur' : '', r.sameWeight ? 'Même épaisseur' : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="pick" aria-pressed="${sel.has(r.yarn.id)}" data-act="choose.toggle" data-ids="${esc(r.yarn.id)}"><span class="box"></span><span class="grow"><span class="t">${esc(yarnTitle(r.yarn))}</span><span class="s">${esc(L.fmtGrams(r.available))} disponibles${tags ? ` · ${esc(tags)}` : ''}</span></span></button>`;
    })
    .join('');
  const n = [...sel].filter((id) => d.yarnsById[id]).length;
  return `
    ${topbar('Choisir un reste', { backHref: `#/projet/${p.id}` })}
    <div class="card"><div style="font-weight:800">${esc(slotTitle(slot))}${slot.weightCategory ? ` · ${esc(slot.weightCategory)}` : ''}</div>
      <div class="hint">Petite quantité : un reste de pelote suffit. Les plus petits restes sont en premier. Tu pourras corriger les grammes dans le projet, et peser ce qui reste à la fin.</div></div>
    <div class="chips" style="margin-top:10px" role="group" aria-label="Filtres">${chip('weights', 'Épaisseur', f.weights.length)}${chip('materials', 'Matière', f.materials.length)}${chip('colors', 'Couleur', f.colors.length)}
      ${nFilter ? '<button type="button" class="chip" data-act="choose.clear">Effacer</button>' : ''}</div>
    <div class="section"><h2>Restes de ton stock (${rows.length})</h2><div class="stack">${list || emptyState(icons.ball, 'Aucun fil en stock ne correspond.')}</div></div>
    <div class="footer-actions"><button type="button" class="btn primary block" data-act="choose.validate" ${n ? '' : 'disabled'}>Valider</button></div>`;
}

export function initChoose(projectId, slotId) {
  const key = `${projectId}/${slotId}`;
  if (ui.chooseKey !== key) {
    ui.chooseKey = key;
    ui.chooseFilters = { weights: [], materials: [], colors: [] };
    const p = store.get('projects', projectId);
    const slot = p && (p.slots || []).find((s) => s.id === slotId);
    ui.chooseSel = new Set(((slot && slot.allocations) || []).map((a) => a.yarnId));
  }
}

actions['choose.toggle'] = (el) => {
  const ids = el.dataset.ids.split(',');
  const on = ids.every((i) => ui.chooseSel.has(i));
  for (const i of ids) {
    if (on) ui.chooseSel.delete(i);
    else ui.chooseSel.add(i);
  }
  rerender();
};

actions['choose.clear'] = () => {
  ui.chooseFilters = { weights: [], materials: [], colors: [] };
  rerender();
};

actions['choose.filter'] = (el) => {
  const key = el.dataset.key;
  const opts = {
    weights: L.WEIGHTS.map((w) => ({ value: w, label: w })),
    materials: L.MATERIALS.map((m) => ({ value: m, label: m })),
    colors: L.COLORS.map((c) => ({ value: c.key, label: c.label })),
  };
  optionsSheet({
    title: { weights: 'Épaisseur', materials: 'Matière', colors: 'Couleur' }[key],
    options: opts[key],
    selected: ui.chooseFilters[key],
    onChange: (vals) => {
      ui.chooseFilters[key] = vals;
    },
    onReset: () => {
      ui.chooseFilters[key] = [];
    },
  });
};

actions['choose.validate'] = async () => {
  const m = /^#\/projet\/([^/]+)\/choisir\/([^/]+)/.exec(location.hash);
  if (!m) return;
  const d = data();
  const p = store.get('projects', m[1]);
  const slot = (p.slots || []).find((s) => s.id === m[2]);
  const chosen = [...ui.chooseSel].map((id) => d.yarnsById[id]).filter(Boolean);
  const rows = chosen.map((y) => ({ yarn: y, available: L.availableGrams(y, d.projects, p.id) }));
  const need = L.withMargin(L.needGrams(slot, chosen[0] || null), d.settings.margin);
  let allocations;
  if (need === null && slot.scraps) allocations = rows.map((r) => ({ yarnId: r.yarn.id, grams: Math.min(10, Math.floor(r.available)) }));
  else if (need === null) allocations = rows.slice(0, 1).map((r) => ({ yarnId: r.yarn.id, grams: 0 }));
  else {
    // Les fils les plus fournis d'abord, pour limiter le nombre de pelotes entamées.
    rows.sort((a, b) => b.available - a.available);
    allocations = L.allocateAcross(rows, need);
    if (!allocations.length && rows.length) allocations = [{ yarnId: rows[0].yarn.id, grams: 0 }];
  }
  const slots = p.slots.map((s) => (s.id === slot.id ? { ...s, allocations } : s));
  await store.put('projects', { ...p, slots });
  ui.chooseKey = '';
  toast('Fils ajoutés au projet');
  go(`#/projet/${p.id}`);
};

