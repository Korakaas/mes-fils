import * as store from '../store.js';
import * as L from '../logic.js';
import { parsePattern, applyVariant } from '../patternParse.js';
import { extractPdfText, renderPdf, shrinkImage, trimScreenshot, ocrImages } from '../media.js';
import {
  ui, actions, inputs, submits, esc, icons, topbar, data, go, toast, confirmSheet, pickFile, pickFiles, patternFiles, toastHold, toNum, numStr, yarnTitle, emptyState, photoAttrs, hydratePhotos, rerender,
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
    ${topbar('Mes patrons', { backHref: '#/projets' })}
    <p class="hint" style="margin-top:0">Un patron s’enregistre tout seul quand tu crées un projet. Ouvre-en un pour en démarrer un nouveau projet.</p>
    ${list.length ? `<div class="stack">${rows}</div>` : emptyState(icons.doc, 'Aucun patron pour l’instant. Il apparaîtra ici dès que tu auras créé un projet avec un patron.', '<a class="btn primary" href="#/projet/nouveau">Nouveau projet</a>')}`;
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
      files: [{ id: fileId, name: file.name, type: 'pdf' }],
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
  const picked = await pickFiles({ accept: 'image/*' });
  if (!picked.length) return;
  setBusy(true, 'Enregistrement des photos…');
  try {
    const { files, blobs } = await storeImages(picked);
    const draft = { title: '', files, materials: [], readNote: '', fromRead: false };
    await readPhotosInto(draft, blobs, (i, n) => setBusy(true, `Lecture de la photo ${i} sur ${n}…`));
    ui.draftPattern = draft;
    go('#/patron/brouillon');
  } finally {
    setBusy(false);
  }
};

async function storeImages(list) {
  const files = [];
  const blobs = [];
  for (const f of list) {
    const blob = await shrinkImage(await trimScreenshot(f), 2200, 0.85);
    blobs.push(blob);
    files.push({ id: await store.putBlob(blob, f.name), name: f.name, type: 'image' });
  }
  return { files, blobs };
}

/** Lit le matériel sur des photos (OCR sur l'appareil) et remplit le patron. Ne lève jamais d'erreur. */
async function readPhotosInto(cur, blobs, onProgress) {
  try {
    const text = await ocrImages(blobs, { onProgress });
    const parsed = parsePattern(text);
    if (parsed.materials.length) {
      cur.materials = parsed.materials.map(withId);
      cur.variants = parsed.variants || [];
      cur.variantIdx = 0;
      cur.fromRead = true;
      cur.readNote = '';
    } else {
      cur.readNote = 'Aucun matériel reconnu sur les photos : ajoute les lignes à la main.';
    }
  } catch (e) {
    cur.readNote = 'Lecture des photos impossible : saisis le matériel à la main.';
  }
  return cur;
}

actions['pattern.manual'] = () => {
  ui.draftPattern = { title: '', files: [], materials: [], readNote: '', fromRead: false };
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
  const files = patternFiles(p);
  const hasFile = files.length > 0 || !!p.link;
  return `
    ${topbar(isDraft ? 'Nouveau projet' : 'Patron', { backHref: isDraft ? '#/projet/nouveau' : ui.patternBack || '#/patrons' })}
    <form id="pattern-form" data-submit="pattern.save" data-id="${isDraft ? '' : esc(p.id)}" novalidate>
      <div class="field"><label for="p-title">${isDraft ? 'Nom du projet' : 'Titre du patron'}</label><input id="p-title" name="title" type="text" value="${esc(p.title || '')}" placeholder="ex. Mushroom Guy" autocomplete="off"></div>
      ${filesSection(files, isDraft ? 'brouillon' : p.id)}
      <div class="field"><label for="p-link">Lien du patron (facultatif)</label><input id="p-link" name="link" type="url" value="${esc(p.link || '')}" placeholder="https://"></div>
      ${!isDraft && ui.patternBack ? `<div class="banner info" style="margin-bottom:12px">${icons.info}<span>Les fils déjà dans ton projet ne changent pas<span class="sub">Ici tu modifies le patron (pages, matériel). Pour un fil du projet, utilise « Modifier la ligne » dans le projet.</span></span></div>` : ''}
      ${p.readNote ? `<div class="banner warn" style="margin-bottom:12px">${icons.alert}<span>${esc(p.readNote)}</span></div>` : ''}
      ${p.fromRead ? `<div class="banner warn" style="margin-bottom:12px">${icons.alert}<span>À vérifier<span class="sub">L’appli a lu ces lignes dans le patron : vérifie surtout les chiffres.</span></span></div>` : ''}
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
        ${isDraft ? '' : '<button type="submit" class="btn block" data-after="save">Enregistrer</button>'}
        <button type="submit" class="btn primary block" data-after="project">${isDraft ? 'Créer le projet' : 'Nouveau projet avec ce patron'}</button></div>
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

function filesSection(files, id) {
  const n = files.length;
  const rows = files
    .map(
      (f, i) => `<div class="card frow" data-fidx="${i}">
        <span class="grip" data-grip aria-label="Glisser pour changer l’ordre" role="img" title="Glisser pour changer l’ordre">⠿</span>
        <span class="fnum">${i + 1}</span>
        <span class="thumb fthumb" ${f.type === 'image' ? photoAttrs(f.id, '') : ''}>${f.type === 'image' ? '' : 'PDF'}</span>
        <span class="fname">${esc(f.name || 'Fichier')}</span>
        <span class="fbtns">
          <button type="button" class="iconbtn ghost" data-act="pattern.moveFile" data-from="${i}" data-to="${i - 1}" aria-label="Monter ${esc(f.name || 'ce fichier')}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="iconbtn ghost" data-act="pattern.moveFile" data-from="${i}" data-to="${i + 1}" aria-label="Descendre ${esc(f.name || 'ce fichier')}" ${i === n - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="linkbtn" style="color:var(--bad)" data-act="pattern.removeFile" data-idx="${i}" aria-label="Retirer ${esc(f.name || 'ce fichier')}">Retirer</button></span></div>`,
    )
    .join('');
  return `<div class="section" style="margin-top:0"><h2>Instructions${n ? `<small>${n} fichier${n > 1 ? 's' : ''}</small>` : ''}</h2>
    ${n > 1 ? '<p class="hint" style="margin:-4px 0 8px">Remets les pages dans l’ordre où tu les suivras : glisse ⠿ ou utilise les flèches.</p>' : ''}
    <div class="stack" data-filelist>${rows || '<p class="hint">Ajoute le PDF du patron et des photos (pages, schémas, résultat) pour tout garder ici et le suivre pendant que tu crochètes.</p>'}</div>
    <div class="row" style="margin:10px 0 16px"><button type="button" class="btn small" data-act="pattern.addPdf">+ PDF</button>
      <button type="button" class="btn small" data-act="pattern.addPhotos">+ Photos</button>
      ${n ? `<button type="button" class="btn small primary" data-act="pattern.read" data-id="${esc(id)}">Lire les instructions</button>` : ''}</div>
    ${files.some((f) => f.type === 'image') ? '<button type="button" class="linkbtn" style="margin:-6px 0 14px" data-act="pattern.ocr">Lire le matériel sur les photos</button>' : ''}</div>`;
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
      ${field('Description', 'label', m.label, { ph: 'ex. Coton worsted, ou marque du fil' })}
      ${field('Coloris', 'colorName', m.colorName, { ph: 'ex. 001 blanc' })}
      <input type="hidden" name="colorKey" value="${esc(m.colorKey || '')}">
      <div class="colors" role="group" aria-label="Famille de couleur">${L.COLORS.map(
        (c) => `<button type="button" class="dot" aria-label="${esc(c.label)}" aria-pressed="${m.colorKey === c.key}" data-act="pattern.color" data-value="${c.key}" style="${c.hex.startsWith('linear') ? `background:${c.hex}` : `background-color:${c.hex}`}"></button>`,
      ).join('')}</div>
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
      m.colorName = get('colorName').trim();
      m.colorKey = get('colorKey');
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

actions['pattern.color'] = (el) => {
  const row = el.closest('[data-row]');
  const hidden = row.querySelector('[name="colorKey"]');
  const already = el.getAttribute('aria-pressed') === 'true';
  el.parentElement.querySelectorAll('.dot').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  hidden.value = already ? '' : el.dataset.value;
  if (!already) el.setAttribute('aria-pressed', 'true');
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

/** Applique un changement de fichiers au patron en cours (brouillon ou enregistré). */
async function changeFiles(change) {
  const form = document.getElementById('pattern-form');
  if (!form) return;
  const id = form.dataset.id;
  const cur = id ? currentPatternFromForm(form, store.get('patterns', id)) : keepDraft(form);
  const next = await change({ ...cur, files: [...patternFiles(cur)] });
  if (!next) return;
  if (id) {
    const { fileId, fileName, fileType, ...rest } = next;
    await store.put('patterns', { ...rest, photoId: (rest.files.find((f) => f.type === 'image') || {}).id || null });
  } else ui.draftPattern = next;
  rerender();
}

actions['pattern.addPdf'] = async () => {
  const file = await pickFile({ accept: 'application/pdf,.pdf' });
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    toast('Ce PDF dépasse 50 Mo : choisis un fichier plus léger');
    return;
  }
  await changeFiles(async (cur) => {
    const fileId = await store.putBlob(file, file.name);
    cur.files.push({ id: fileId, name: file.name, type: 'pdf' });
    // Patron sans matériel : on lit le PDF pour pré-remplir
    if (!(cur.materials || []).length) {
      try {
        const { text, hasText } = await extractPdfText(file);
        if (hasText) {
          const parsed = parsePattern(text);
          if (parsed.materials.length) {
            cur.materials = parsed.materials.map(withId);
            cur.variants = parsed.variants || [];
            cur.variantIdx = 0;
            cur.fromRead = true;
            if (!cur.title && parsed.title) cur.title = parsed.title;
          }
        }
      } catch (e) {
        /* la lecture automatique est facultative */
      }
    }
    return cur;
  });
};

actions['pattern.addPhotos'] = async () => {
  const picked = await pickFiles({ accept: 'image/*' });
  if (!picked.length) return;
  const stop = toastHold('Enregistrement des photos…');
  try {
    await changeFiles(async (cur) => {
      const { files, blobs } = await storeImages(picked);
      cur.files.push(...files);
      // Patron sans matériel : on lit les photos pour pré-remplir
      if (!(cur.materials || []).length) {
        await readPhotosInto(cur, blobs, (i, n) => toastHold(`Lecture de la photo ${i} sur ${n}…`));
      }
      return cur;
    });
  } finally {
    stop();
  }
};

/** Relit le matériel sur les photos déjà ajoutées. */
actions['pattern.ocr'] = () => {
  const run = async () => {
    const stop = toastHold('Lecture des photos…');
    try {
      await changeFiles(async (cur) => {
        const blobs = [];
        for (const f of cur.files.filter((x) => x.type === 'image')) {
          const rec = await store.loadBlob(f.id);
          if (rec) blobs.push(rec.blob);
        }
        if (!blobs.length) {
          toast('Photos indisponibles sur cet appareil');
          return null;
        }
        return readPhotosInto(cur, blobs, (i, n) => toastHold(`Lecture de la photo ${i} sur ${n}…`));
      });
    } finally {
      stop();
    }
  };
  const form = document.getElementById('pattern-form');
  const hasRows = form && form.querySelector('[data-row]');
  if (!hasRows) return run();
  confirmSheet({
    title: 'Relire le matériel sur les photos ?',
    text: 'Le matériel actuel sera remplacé par ce que l’appli lit sur les photos.',
    confirmLabel: 'Relire',
    onConfirm: run,
  });
};

function moveFile(from, to) {
  if (from === to || to < 0) return;
  changeFiles(async (cur) => {
    if (to >= cur.files.length) return null;
    const [f] = cur.files.splice(from, 1);
    cur.files.splice(to, 0, f);
    return cur;
  });
}

actions['pattern.moveFile'] = (el) => moveFile(Number(el.dataset.from), Number(el.dataset.to));

/** Glisser-déposer des fichiers par la poignée (souris ou doigt), avec défilement automatique près des bords. */
function bindFileDrag() {
  const list = document.querySelector('[data-filelist]');
  if (!list || list.dataset.bound) return;
  list.dataset.bound = '1';
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip) return;
    e.preventDefault();
    const rows = [...list.querySelectorAll('[data-fidx]')];
    const row = grip.closest('[data-fidx]');
    const from = rows.indexOf(row);
    const centers = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + window.scrollY + b.height / 2;
    });
    const step = rows.length > 1 ? centers[1] - centers[0] : 0;
    const startY = e.clientY;
    const startScroll = window.scrollY;
    let lastY = startY;
    let to = from;
    grip.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    const update = () => {
      const dy = lastY - startY + (window.scrollY - startScroll);
      row.style.transform = `translateY(${dy}px)`;
      const y = centers[from] + dy;
      let best = 0;
      centers.forEach((c, i) => {
        if (Math.abs(c - y) < Math.abs(centers[best] - y)) best = i;
      });
      to = best;
      rows.forEach((r, i) => {
        if (r === row) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -step;
        if (from > to && i < from && i >= to) shift = step;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const timer = setInterval(() => {
      const edge = 90;
      if (lastY > window.innerHeight - edge) window.scrollBy(0, 12);
      else if (lastY < edge + 60) window.scrollBy(0, -12);
      update();
    }, 16);
    const move = (ev) => {
      lastY = ev.clientY;
      update();
    };
    const end = () => {
      clearInterval(timer);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      rows.forEach((r) => (r.style.transform = ''));
      row.classList.remove('dragging');
      moveFile(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });
}

actions['pattern.removeFile'] = (el) => {
  const idx = Number(el.dataset.idx);
  changeFiles(async (cur) => {
    cur.files.splice(idx, 1);
    return cur;
  });
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
      colorName: m.colorName || '',
      colorKey: m.colorKey || '',
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
    toast(id ? 'Donne un titre au patron' : 'Donne un nom au projet');
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
    files: patternFiles(base),
    photoId: (patternFiles(base).find((f) => f.type === 'image') || {}).id || null,
    createdAt: base.createdAt,
  };
  const saved = await store.put('patterns', doc);
  ui.draftPattern = null;
  if (!id || lastSubmitter === 'project') {
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
    const back = ui.patternBack;
    ui.patternBack = null;
    go(back || `#/patron/${saved.id}`);
  }
  lastSubmitter = 'save';
};

// ---------- Lecture du patron ----------

const readerPref = {
  get() {
    try {
      return localStorage.getItem('mesfils.reader') === 'scroll' ? 'scroll' : 'book';
    } catch (e) {
      return 'book';
    }
  },
  set(v) {
    try {
      localStorage.setItem('mesfils.reader', v);
    } catch (e) {
      /* préférence facultative */
    }
  },
  getPos(id) {
    try {
      return Number(localStorage.getItem('mesfils.pos.' + id)) || 0;
    } catch (e) {
      return 0;
    }
  },
  setPos(id, n) {
    try {
      localStorage.setItem('mesfils.pos.' + id, String(n));
    } catch (e) {
      /* facultatif */
    }
  },
};

const rd = { id: '', cur: 0, total: 0 };

export function renderReader(id, projectId) {
  const p = patternFromId(id);
  if (!p) return `${topbar('Patron introuvable', { backHref: '#/patrons' })}`;
  const back = projectId ? `#/projet/${projectId}` : id === 'brouillon' ? '#/patron/brouillon' : `#/patron/${id}`;
  const files = patternFiles(p);
  const mode = readerPref.get();
  const open = p.link ? `<a class="btn small" href="${esc(p.link)}" target="_blank" rel="noopener">Ouvrir le lien</a>` : '';
  const body = files.length
    ? files
        .map(
          (f, i) => `<section class="rfile" data-fid="${esc(f.id)}" data-type="${esc(f.type || '')}">
            ${files.length > 1 ? `<h2 class="rtitle">${esc(f.name || `Fichier ${i + 1}`)}<small>${i + 1} / ${files.length}</small></h2>` : ''}
            <div class="rbody"><div class="spinner">Ouverture…</div></div></section>`,
        )
        .join('')
    : `<p class="hint">Ce patron n’a pas de fichier. Ajoute un PDF ou des photos depuis la fiche du patron.</p>${open}`;
  const seg = (m, label) => `<button type="button" aria-pressed="${mode === m}" data-act="reader.mode" data-mode="${m}">${label}</button>`;
  const bar = files.length
    ? `<div class="rbar"><div class="seg" role="group" aria-label="Affichage">${seg('book', 'Livret')}${seg('scroll', 'Défilement')}</div></div>`
    : '';
  const nav = files.length
    ? `<div class="rnav" id="rnav"><button type="button" class="iconbtn" data-act="reader.prev" aria-label="Page précédente">‹</button><span id="rcount" aria-live="polite">Page 1</span><button type="button" class="iconbtn" data-act="reader.next" aria-label="Page suivante">›</button></div>`
    : '';
  return `${topbar(p.title || 'Patron', { backHref: back })}
    <div class="reader ${mode}" id="reader" data-pid="${esc(id)}">${bar}<div class="pages" id="pages">${body}</div>${nav}${files.length ? `<p class="hint rhint" style="margin:6px 0 0">L’écran reste allumé pendant la lecture. Pince l’écran pour zoomer.</p>` : ''}${files.length ? open : ''}</div>`;
}

function rpages() {
  return [...document.querySelectorAll('#pages .rpage')];
}

function showPage(idx, smooth = true) {
  const pages = rpages();
  if (!pages.length) return;
  const i = Math.max(0, Math.min(pages.length - 1, idx));
  const box = document.getElementById('pages');
  const book = document.getElementById('reader').classList.contains('book');
  if (book) box.scrollTo({ left: i * box.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  else pages[i].scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  setCurrent(i);
}

function setCurrent(i) {
  rd.cur = i;
  rd.total = rpages().length;
  const c = document.getElementById('rcount');
  if (c) c.textContent = `Page ${i + 1} / ${rd.total}`;
  if (rd.id) readerPref.setPos(rd.id, i);
}

function bindReaderScroll() {
  const box = document.getElementById('pages');
  let raf = 0;
  const update = () => {
    raf = 0;
    const book = document.getElementById('reader')?.classList.contains('book');
    const pages = rpages();
    if (!pages.length) return;
    if (book) setCurrent(Math.round(box.scrollLeft / Math.max(1, box.clientWidth)));
    else {
      const first = pages.findIndex((pg) => pg.getBoundingClientRect().bottom > 140);
      setCurrent(first < 0 ? pages.length - 1 : first);
    }
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  box.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
}

document.addEventListener('keydown', (e) => {
  if (!/^#\/lire\//.test(location.hash) || /input|textarea|select/i.test(e.target.tagName)) return;
  if (!document.getElementById('reader')?.classList.contains('book')) return;
  if (e.key === 'ArrowRight') showPage(rd.cur + 1);
  if (e.key === 'ArrowLeft') showPage(rd.cur - 1);
});

actions['reader.mode'] = (el) => {
  const mode = el.dataset.mode;
  readerPref.set(mode);
  const box = document.getElementById('reader');
  box.classList.toggle('book', mode === 'book');
  box.classList.toggle('scroll', mode === 'scroll');
  box.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  const keep = rd.cur;
  requestAnimationFrame(() => showPage(keep, false));
};
actions['reader.prev'] = () => showPage(rd.cur - 1);
actions['reader.next'] = () => showPage(rd.cur + 1);

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch (e) {
    wakeLock = null; // pas bloquant : l'écran se mettra simplement en veille
  }
}
function releaseAwake() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
window.addEventListener('hashchange', () => {
  if (!/^#\/lire\//.test(location.hash)) releaseAwake();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && /^#\/lire\//.test(location.hash)) keepAwake();
});

export async function afterReader() {
  const box = document.getElementById('reader');
  if (!box) return;
  rd.id = box.dataset.pid || '';
  keepAwake();
  const pagesBox = document.getElementById('pages');
  const width = Math.max(280, pagesBox.clientWidth || 360);
  for (const sec of box.querySelectorAll('.rfile')) {
    const body = sec.querySelector('.rbody');
    const rec = await store.loadBlob(sec.dataset.fid);
    if (!body.isConnected) return; // on a quitté l'écran entre-temps
    if (!rec) {
      body.innerHTML = '<div class="rpage"><p class="hint">Ce fichier n’est pas encore disponible sur cet appareil. Connecte-toi à la synchro puis réessaie.</p></div>';
      continue;
    }
    if (sec.dataset.type === 'image' || (rec.type || '').startsWith('image/')) {
      const url = await store.blobUrl(rec.id);
      body.innerHTML = `<div class="rpage"><img alt="Page du patron" src="${url}"></div>`;
      continue;
    }
    try {
      await renderPdf(rec.blob, body, { perPage: true, width });
    } catch (e) {
      const url = await store.blobUrl(rec.id);
      body.innerHTML = `<div class="rpage"><p class="hint">Impossible d’afficher ce PDF ici.</p><a class="btn" href="${url}" target="_blank" rel="noopener">Ouvrir dans une autre appli</a></div>`;
    }
  }
  if (!rpages().length) return;
  const saved = readerPref.getPos(rd.id);
  bindReaderScroll();
  setCurrent(0);
  if (saved > 0 && saved < rpages().length) setTimeout(() => showPage(saved, false), 60);
  else if (rd.id) readerPref.setPos(rd.id, 0);
}

export function afterPatterns() {
  hydratePhotos(document.getElementById('view'));
  bindFileDrag();
}

