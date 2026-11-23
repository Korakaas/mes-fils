import * as store from '../store.js';
import * as L from '../logic.js';
import { parsePattern, applyVariant } from '../patternParse.js';
import { extractPdfText, renderPdf, shrinkImage } from '../media.js';
import {
  ui, actions, inputs, submits, esc, icons, topbar, data, go, toast, confirmSheet, pickFile, toNum, numStr, yarnTitle, emptyState, photoAttrs, hydratePhotos, rerender,
} from '../ctx.js';

// ---------- Liste ----------

export function renderPatterns() {
  const d = data();
  const list = [...d.patterns].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const rows = list
    .map((p) => {
      const mats = p.materials || [];
      const nYarn = mats.filter((m) => m.kind === 'yarn').length;
      const nProj = d.projects.filter((pr) => pr.patternId === p.id).length;
      const bits = [p.fileType === 'pdf' ? 'PDF' : p.fileType === 'image' ? 'Image' : p.link ? 'Lien' : '', nYarn ? `${nYarn} fil${nYarn > 1 ? 's' : ''}` : '', nProj ? `${nProj} projet${nProj > 1 ? 's' : ''}` : ''].filter(Boolean);
      return `<a class="listrow" href="#/patron/${esc(p.id)}"><span class="thumb" ${p.photoId ? photoAttrs(p.photoId, '') : ''}>${p.photoId ? '' : icons.doc}</span>
        <span class="grow"><span class="t">${esc(p.title || 'Patron sans titre')}</span><span class="s">${esc(bits.join(' · '))}</span></span><span class="chev">${icons.chev}</span></a>`;
    })
    .join('');
  return `
    <div class="topbar"><h1>Mes patrons</h1></div>
    ${list.length ? `<div class="stack">${rows}</div>` : emptyState(icons.doc, 'Aucun patron pour l’instant. Importe un PDF : l’appli lit le matériel et le compare à ton stock.', '<a class="btn primary" href="#/patron/nouveau">Importer un patron</a>')}
    <a class="fab" href="#/patron/nouveau">${icons.plus}Importer un patron</a>`;
}

// ---------- Import ----------

export function renderPatternNew() {
  return `
    ${topbar('Nouveau patron', { backHref: '#/patrons' })}
    <div class="stack">
      <button type="button" class="btn primary block" style="min-height:64px" data-act="pattern.pickPdf">${icons.doc}Choisir un PDF</button>
      <p class="hint">L’appli lit le texte du PDF et en tire le matériel : fils, crochets, accessoires. Tu relis et tu corriges avant d’enregistrer.</p>
      <button type="button" class="btn block" data-act="pattern.pickImage">${icons.camera}Photo ou image du patron</button>
      <p class="hint">Pour une photo ou un scan, tu saisis le matériel à la main.</p>
      <button type="button" class="btn block" data-act="pattern.manual">Saisir le patron à la main</button>
    </div>
    <div id="pattern-busy" class="spinner" hidden>Lecture du patron…</div>`;
}

function setBusy(on, text = 'Lecture du patron…') {
  const el = document.getElementById('pattern-busy');
  if (el) {
    el.hidden = !on;
    el.textContent = text;
  }
}

actions['pattern.pickPdf'] = async () => {
  const file = await pickFile({ accept: 'application/pdf,.pdf' });
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    toast('Ce PDF dépasse 50 Mo : choisis un fichier plus léger');
    return;
  }
  setBusy(true);
  try {
    const fileId = await store.putBlob(file, file.name);
    let parsed = { materials: [], title: '', found: false };
    let readNote = '';
    try {
      const { text, hasText } = await extractPdfText(file);
      if (hasText) parsed = parsePattern(text);
      else readNote = 'Ce PDF est une image : saisis le matériel à la main.';
    } catch (e) {
      readNote = 'Lecture impossible : saisis le matériel à la main.';
    }
    ui.draftPattern = {
      title: parsed.title || file.name.replace(/\.pdf$/i, ''),
      fileId,
      fileName: file.name,
      fileType: 'pdf',
      materials: parsed.materials.map(withId),
      variants: parsed.variants || [],
      variantIdx: 0,
      readNote: readNote || (parsed.materials.length ? '' : 'Aucun matériel reconnu : ajoute les lignes à la main.'),
      fromRead: parsed.materials.length > 0,
    };
    go('#/patron/brouillon');
  } finally {
    setBusy(false);
  }
};

actions['pattern.pickImage'] = async () => {
  const file = await pickFile({ accept: 'image/*' });
  if (!file) return;
  const blob = await shrinkImage(file, 2200, 0.85);
  const fileId = await store.putBlob(blob, file.name);
  ui.draftPattern = { title: '', fileId, fileName: file.name, fileType: 'image', materials: [], readNote: '', fromRead: false };
  go('#/patron/brouillon');
};

actions['pattern.manual'] = () => {
  ui.draftPattern = { title: '', fileId: null, fileName: '', fileType: '', materials: [], readNote: '', fromRead: false };
  go('#/patron/brouillon');
};

function withId(m) {
  return { ...m, id: L.uid() };
}

// ---------- Éditeur (nouveau brouillon ou patron existant) ----------

function patternFromId(id) {
  if (id === 'brouillon') return ui.draftPattern ? { ...ui.draftPattern, id: null } : null;
  return store.get('patterns', id);
}

export function renderPatternEditor(id) {
  const p = patternFromId(id);
  if (!p) return `${topbar('Patron introuvable', { backHref: '#/patrons' })}<p class="hint">Ce patron n’existe plus.</p>`;
  const isDraft = id === 'brouillon';
  const d = data();
  const mats = p.materials || [];
  const yarnRows = mats.filter((m) => m.kind === 'yarn');
  const covered = yarnRows.filter((m) => bestSuggestion(m, d).state === 'ok').length;
  const hasFile = !!p.fileId || !!p.link;
  return `
    ${topbar(isDraft ? 'Nouveau patron' : 'Patron', { backHref: '#/patrons' })}
    <form id="pattern-form" data-submit="pattern.save" data-id="${isDraft ? '' : esc(p.id)}" novalidate>
      <div class="field"><label for="p-title">Titre</label><input id="p-title" name="title" type="text" value="${esc(p.title || '')}" placeholder="ex. Mushroom Guy" autocomplete="off"></div>
      ${p.fileType ? `<div class="card" style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><span class="tag">${p.fileType === 'pdf' ? 'PDF' : 'Image'}</span><span class="grow" style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:13.5px">${esc(p.fileName || 'Fichier du patron')}</span><button type="button" class="btn small" data-act="pattern.read" data-id="${esc(isDraft ? 'brouillon' : p.id)}">Lire</button></div>` : ''}
      <div class="field"><label for="p-link">Lien du patron (facultatif)</label><input id="p-link" name="link" type="url" value="${esc(p.link || '')}" placeholder="https://"></div>
      ${p.readNote ? `<div class="banner warn" style="margin-bottom:12px">${icons.alert}<span>${esc(p.readNote)}</span></div>` : ''}
      ${p.fromRead ? `<div class="banner warn" style="margin-bottom:12px">${icons.alert}<span>À vérifier<span class="sub">L’appli a lu ces lignes dans le PDF : corrige ce qui est faux.</span></span></div>` : ''}
      ${variantChips(p)}
      <div class="section" style="margin-top:6px"><h2>Matériel${yarnRows.length ? `<small>${covered} fil${covered > 1 ? 's' : ''} sur ${yarnRows.length} couvert${covered > 1 ? 's' : ''} par ton stock</small>` : ''}</h2>
        <div class="stack" id="mat-list">${mats.map((m, i) => materialRow(m, i, d)).join('') || '<p class="hint">Aucune ligne pour l’instant. Ajoute les fils, le crochet et les accessoires.</p>'}</div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn small" data-act="pattern.addRow" data-kind="yarn">+ Fil</button>
        <button type="button" class="btn small" data-act="pattern.addRow" data-kind="hook">+ Crochet</button>
        <button type="button" class="btn small" data-act="pattern.addRow" data-kind="accessory">+ Accessoire</button></div>
      </div>
      <div class="field section"><label for="p-notes">Notes</label><textarea id="p-notes" name="notes">${esc(p.notes || '')}</textarea></div>
      ${!isDraft ? `<button type="button" class="linkbtn" style="color:var(--bad)" data-act="pattern.delete" data-id="${esc(p.id)}">Supprimer ce patron</button>` : ''}
      <div class="footer-actions"><div class="row">
        <button type="submit" class="btn block" data-after="save">Enregistrer le patron</button>
        <button type="submit" class="btn primary block" data-after="project">Créer le projet</button></div>
        ${hasFile ? '' : '<p class="hint">Un patron sans fichier ni lien reste utile pour comparer le matériel à ton stock.</p>'}</div>
    </form>`;
}

function slotFromRow(m) {
  return {
    kind: 'yarn',
    weightCategory: m.weightCategory || '',
    grams: toNum(m.grams),
    meters: toNum(m.meters),
    skeins: toNum(m.skeins),
    skeinGrams: toNum(m.skeinGrams),
    skeinMeters: toNum(m.skeinMeters),
  };
}

export function bestSuggestion(m, d) {
  const slot = slotFromRow(m);
  const hasInfo = slot.grams || slot.meters || (slot.skeins && slot.skeinGrams);
  if (!hasInfo) return { state: 'unknown', html: 'Ajoute un poids ou un métrage pour comparer à ton stock.' };
  const res = L.candidatesForSlot(slot, d.yarns, d.projects, { margin: d.settings.margin });
  if (res.enough.length) {
    const r = res.enough[0];
    return { state: 'ok', html: `<b>${esc(yarnTitle(r.yarn))}</b> · ${esc(L.fmtGrams(r.available))} disponibles`, pill: ['good', 'Assez de fil'] };
  }
  if (res.combine.length) {
    const c = res.combine[0];
    return { state: 'combine', html: `<b>${c.yarns.map((r) => esc(yarnTitle(r.yarn))).join(' + ')}</b> · ${esc(L.fmtGrams(c.sum))} ensemble`, pill: ['warn', 'À combiner'] };
  }
  const near = res.insufficient.find((r) => r.reason !== 'unknown') || null;
  if (near) {
    return { state: 'short', html: `<b>${esc(yarnTitle(near.yarn))}</b> · ${esc(L.fmtGrams(near.available))} disponibles`, pill: ['bad', `Il manque ${L.fmtGrams(near.short)}`] };
  }
  return { state: 'none', html: 'Aucun fil en stock.', pill: ['bad', 'Il manque du fil'] };
}

function suggestHtml(m, d) {
  const s = bestSuggestion(m, d);
  const mt = needHint(m);
  return `${s.pill ? `<span class="pill ${s.pill[0]}">${esc(s.pill[1])}</span>` : ''}<span class="grow">${s.html}${mt}</span>`;
}

function needHint(m) {
  const g = L.needGrams(slotFromRow(m));
  if (g === null) return '';
  return `<br><span style="color:var(--muted)">Besoin ${esc(L.fmtGrams(g))}, soit ${esc(L.fmtGrams(L.withMargin(g, data().settings.margin)))} avec marge</span>`;
}

function field(label, name, value, { type = 'text', ph = '', unit = '' } = {}) {
  return `<div class="field" style="margin:0"><label>${label}<input name="${name}" type="text" inputmode="${type === 'num' ? 'decimal' : 'text'}" value="${esc(type === 'num' ? numStr(value) : value || '')}" placeholder="${esc(ph)}" data-input="pattern.row" style="margin-top:4px"></label></div>`;
}

function variantChips(p) {
  const vs = p.variants || [];
  if (vs.length < 2) return '';
  const cur = Math.min(p.variantIdx || 0, vs.length - 1);
  const v = vs[cur];
  const g = (v.yarns || []).map((y) => y.grams).filter(Boolean);
  return `<div class="section" style="margin-top:6px"><h2>Taille du patron</h2>
    <div class="chips wrap">${vs.map((x, i) => `<button type="button" class="chip" aria-pressed="${i === cur}" data-act="pattern.variant" data-idx="${i}">${esc(x.name)}</button>`).join('')}</div>
    <p class="hint">${v.sub ? `${esc(v.sub)}. ` : ''}${g.length ? `Fils : ${esc(g.join(' g, '))} g.` : ''} Le patron indique plusieurs tailles : choisis celle que tu crochètes.</p></div>`;
}

function materialRow(m, i, d) {
  const kindLabel = { yarn: 'Fil', hook: 'Crochet', accessory: 'Accessoire' }[m.kind] || 'Ligne';
  const head = `<div class="head"><span class="pill soft">${kindLabel}</span><button type="button" class="linkbtn" data-act="pattern.delRow" data-idx="${i}" aria-label="Supprimer cette ligne">Retirer</button></div>`;
  const base = `<input type="hidden" name="kind" value="${esc(m.kind)}"><input type="hidden" name="id" value="${esc(m.id || '')}">`;
  if (m.kind === 'yarn') {
    const wOpts = ['<option value="">Épaisseur ?</option>', ...L.WEIGHTS.map((w) => `<option ${m.weightCategory === w ? 'selected' : ''}>${w}</option>`)].join('');
    return `<div class="card mat" data-row="${i}">${base}${head}
      ${field('Description', 'label', m.label, { ph: 'ex. Coton worsted blanc' })}
      <div class="field" style="margin:0"><label>Épaisseur<select name="weightCategory" data-input="pattern.row" style="margin-top:4px">${wOpts}</select></label></div>
      <div class="row">${field('Poids total (g)', 'grams', m.grams, { type: 'num' })}${field('Mètres total', 'meters', m.meters, { type: 'num' })}</div>
      <div class="row">${field('Pelotes', 'skeins', m.skeins, { type: 'num' })}${field('g / pelote', 'skeinGrams', m.skeinGrams, { type: 'num' })}${field('m / pelote', 'skeinMeters', m.skeinMeters, { type: 'num' })}</div>
      <div class="suggest" data-suggest>${suggestHtml(m, d)}</div></div>`;
  }
  if (m.kind === 'hook') {
    return `<div class="card mat" data-row="${i}">${base}${head}${field('Description', 'label', m.label, { ph: 'ex. Crochet 2,5 mm' })}${field('Taille (mm)', 'size', m.size, { type: 'num' })}</div>`;
  }
  return `<div class="card mat" data-row="${i}">${base}${head}${field('Description', 'label', m.label, { ph: 'ex. Yeux de sécurité 10 mm' })}</div>`;
}

function collectRows(form) {
  return [...form.querySelectorAll('[data-row]')].map((row) => {
    const get = (n) => (row.querySelector(`[name="${n}"]`) || {}).value || '';
    const kind = get('kind');
    const m = { id: get('id') || L.uid(), kind, label: get('label').trim() };
    if (kind === 'yarn') {
      m.weightCategory = get('weightCategory');
      for (const k of ['grams', 'meters', 'skeins', 'skeinGrams', 'skeinMeters']) m[k] = toNum(get(k));
    }
    if (kind === 'hook') m.size = toNum(get('size'));
    return m;
  });
}

function currentPatternFromForm(form, base) {
  return {
    ...base,
    title: form.elements.title.value.trim(),
    link: form.elements.link.value.trim(),
    notes: form.elements.notes.value.trim(),
    materials: collectRows(form),
  };
}

inputs['pattern.row'] = (el) => {
  const row = el.closest('[data-row]');
  if (!row) return;
  const m = collectRows({ querySelectorAll: () => [row] })[0];
  const box = row.querySelector('[data-suggest]');
  if (box && m.kind === 'yarn') box.innerHTML = suggestHtml(m, data());
};

function keepDraft(form) {
  const id = form.dataset.id;
  if (id) return null;
  ui.draftPattern = currentPatternFromForm(form, ui.draftPattern || {});
  return ui.draftPattern;
}

actions['pattern.addRow'] = (el) => {
  const form = document.getElementById('pattern-form');
  const id = form.dataset.id;
  const kind = el.dataset.kind;
  const blank = { id: L.uid(), kind, label: '' };
  if (id) {
    const cur = currentPatternFromForm(form, store.get('patterns', id));
    cur.materials.push(blank);
    store.put('patterns', cur).then(rerender);
  } else {
    const cur = keepDraft(form);
    cur.materials.push(blank);
    rerender();
  }
};

actions['pattern.delRow'] = (el) => {
  const form = document.getElementById('pattern-form');
  const idx = Number(el.dataset.idx);
  const id = form.dataset.id;
  if (id) {
    const cur = currentPatternFromForm(form, store.get('patterns', id));
    cur.materials.splice(idx, 1);
    store.put('patterns', cur).then(rerender);
  } else {
    const cur = keepDraft(form);
    cur.materials.splice(idx, 1);
    rerender();
  }
};

actions['pattern.variant'] = (el) => {
  const form = document.getElementById('pattern-form');
  const id = form.dataset.id;
  const idx = Number(el.dataset.idx);
  const cur = id ? currentPatternFromForm(form, store.get('patterns', id)) : keepDraft(form);
  const v = (cur.variants || [])[idx];
  if (!v) return;
  cur.materials = applyVariant(cur.materials, v).map(withId);
  cur.variantIdx = idx;
  if (id) store.put('patterns', cur).then(rerender);
  else rerender();
};

actions['pattern.read'] = (el) => {
  const form = document.getElementById('pattern-form');
  if (form && !form.dataset.id) keepDraft(form);
  go(`#/lire/${el.dataset.id}`);
};

actions['pattern.delete'] = (el) => {
  const id = el.dataset.id;
  confirmSheet({
    title: 'Supprimer ce patron ?',
    text: 'Les projets créés avec ce patron sont conservés.',
    confirmLabel: 'Supprimer',
    danger: true,
    onConfirm: async () => {
      await store.remove('patterns', id);
      toast('Patron supprimé');
      go('#/patrons');
    },
  });
};

let lastSubmitter = 'save';
document.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest && e.target.closest('button[type="submit"][data-after]');
    if (b) lastSubmitter = b.dataset.after;
  },
  true,
);

/** Crée les lignes de fils d'un projet à partir du matériel d'un patron. */
export function slotsFromPattern(p) {
  return (p.materials || [])
    .filter((m) => m.kind === 'yarn')
    .map((m) => ({
      id: L.uid(),
      kind: 'yarn',
      label: m.label || 'Fil',
      weightCategory: m.weightCategory || '',
      grams: m.grams ?? null,
      meters: m.meters ?? null,
      skeins: m.skeins ?? null,
      skeinGrams: m.skeinGrams ?? null,
      skeinMeters: m.skeinMeters ?? null,
      allocations: [],
    }));
}

submits['pattern.save'] = async (form) => {
  const id = form.dataset.id || null;
  const base = id ? store.get('patterns', id) : ui.draftPattern || {};
  const cur = currentPatternFromForm(form, base);
  if (!cur.title) {
    toast('Donne un titre au patron');
    document.getElementById('p-title').focus();
    return;
  }
  const doc = {
    id: id || undefined,
    title: cur.title,
    link: cur.link,
    notes: cur.notes,
    materials: cur.materials,
    variants: base.variants || [],
    variantIdx: base.variantIdx || 0,
    fileId: base.fileId || null,
    fileName: base.fileName || '',
    fileType: base.fileType || '',
    photoId: base.photoId || (base.fileType === 'image' ? base.fileId : null),
    createdAt: base.createdAt,
  };
  const saved = await store.put('patterns', doc);
  ui.draftPattern = null;
  if (lastSubmitter === 'project') {
    const project = await store.put('projects', {
      name: saved.title,
      status: 'envie',
      patternId: saved.id,
      keepReservedOnPause: true,
      slots: slotsFromPattern(saved),
      photos: [],
    });
    toast('Projet créé');
    go(`#/projet/${project.id}`);
  } else {
    toast('Patron enregistré');
    go(`#/patron/${saved.id}`);
  }
  lastSubmitter = 'save';
};

// ---------- Lecture du patron ----------

export function renderReader(id) {
  const p = patternFromId(id);
  if (!p) return `${topbar('Patron introuvable', { backHref: '#/patrons' })}`;
  const back = id === 'brouillon' ? '#/patron/brouillon' : `#/patron/${id}`;
  const open = p.link ? `<a class="btn small" href="${esc(p.link)}" target="_blank" rel="noopener">Ouvrir le lien</a>` : '';
  return `${topbar(p.title || 'Patron', { backHref: back })}
    <div class="reader" id="reader" data-file="${esc(p.fileId || '')}" data-type="${esc(p.fileType || '')}">
      ${p.fileId ? '<div class="spinner">Ouverture du patron…</div>' : `<p class="hint">Ce patron n’a pas de fichier.</p>${open}`}
    </div>`;
}

export async function afterReader() {
  const box = document.getElementById('reader');
  if (!box || !box.dataset.file) return;
  const rec = await store.loadBlob(box.dataset.file);
  if (!rec) {
    box.innerHTML = '<p class="hint">Le fichier n’est pas encore disponible sur cet appareil. Connecte-toi à la synchro puis réessaie.</p>';
    return;
  }
  if (box.dataset.type === 'image' || (rec.type || '').startsWith('image/')) {
    const url = await store.blobUrl(rec.id);
    box.innerHTML = `<img alt="Patron" src="${url}">`;
    return;
  }
  try {
    await renderPdf(rec.blob, box);
  } catch (e) {
    const url = await store.blobUrl(rec.id);
    box.innerHTML = `<p class="hint">Impossible d’afficher ce PDF ici.</p><a class="btn" href="${url}" target="_blank" rel="noopener">Ouvrir dans une autre appli</a>`;
  }
}

export function afterPatterns() {
  hydratePhotos(document.getElementById('view'));
}

