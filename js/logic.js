// Règles de calcul du cahier des charges. Aucune dépendance : testable avec Node.

export const DEFAULTS = { margin: 0.1, restThreshold: 20 };

export const WEIGHTS = ['Dentelle', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super bulky'];

export const MATERIALS = ['Coton', 'Acrylique', 'Laine', 'Mohair', 'Mélange', 'Bambou', 'Lin', 'Soie', 'Polyester', 'Autre'];

export const COLORS = [
  { key: 'blanc', label: 'Blanc', hex: '#F4F1EE' },
  { key: 'beige', label: 'Beige', hex: '#E7D5BC' },
  { key: 'jaune', label: 'Jaune', hex: '#F1CE6B' },
  { key: 'orange', label: 'Orange', hex: '#EBA467' },
  { key: 'rouge', label: 'Rouge', hex: '#E98A7A' },
  { key: 'rose', label: 'Rose', hex: '#F0B7C4' },
  { key: 'violet', label: 'Violet', hex: '#B9A5D6' },
  { key: 'bleu', label: 'Bleu', hex: '#9DBFE0' },
  { key: 'vert', label: 'Vert', hex: '#A9CDA5' },
  { key: 'marron', label: 'Marron', hex: '#B08C74' },
  { key: 'gris', label: 'Gris', hex: '#B9B5B6' },
  { key: 'noir', label: 'Noir', hex: '#4A4246' },
  { key: 'multi', label: 'Multicolore', hex: 'linear-gradient(135deg,#F0B7C4,#F1CE6B,#9DBFE0)' },
];

export const STATUSES = [
  { key: 'envie', label: 'Envie' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'en_pause', label: 'En pause' },
  { key: 'abandonne', label: 'Abandonné' },
  { key: 'termine', label: 'Terminé' },
  { key: 'offert', label: 'Offert' },
];

export function statusLabel(key) {
  return (STATUSES.find((s) => s.key === key) || STATUSES[0]).label;
}

export function colorOf(key) {
  return COLORS.find((c) => c.key === key) || null;
}

const n = (v) => {
  const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return typeof x === 'number' && isFinite(x) ? x : 0;
};

export const toNumber = n;

// ---------- Fils ----------

export function totalGrams(y) {
  return n(y.skeins) * n(y.gramsPerSkein);
}

/** Restant en grammes : le poids pesé remplace le calcul. */
export function remainingGrams(y) {
  if (y.weighedGrams !== null && y.weighedGrams !== undefined && y.weighedGrams !== '') {
    return Math.max(0, n(y.weighedGrams));
  }
  return Math.max(0, totalGrams(y) - n(y.usedGrams));
}

export function metersFromGrams(y, grams) {
  const g = n(y.gramsPerSkein);
  const m = n(y.metersPerSkein);
  return g > 0 && m > 0 ? (grams * m) / g : null;
}

export function gramsFromMeters(y, meters) {
  const g = n(y.gramsPerSkein);
  const m = n(y.metersPerSkein);
  return g > 0 && m > 0 ? (meters * g) / m : null;
}

export function skeinsFromGrams(y, grams) {
  const g = n(y.gramsPerSkein);
  return g > 0 ? grams / g : null;
}

/** Niveau de stock, aligné sur la formule « Quantité » de Notion. */
export function stockLevel(grams) {
  if (grams >= 500) return { key: 'gros', label: 'Gros stock' };
  if (grams >= 200) return { key: 'moyen', label: 'Moyen' };
  if (grams >= 100) return { key: 'petit', label: 'Petit' };
  return { key: 'fini', label: 'Quasi fini' };
}

// ---------- Réservations ----------

/** Un projet réserve ses fils quand il est en cours, ou en pause si l'interrupteur est activé. */
export function reservesYarns(project) {
  if (project.status === 'en_cours') return true;
  if (project.status === 'en_pause') return project.keepReservedOnPause !== false;
  return false;
}

export function reservedGrams(yarnId, projects, excludeProjectId = null) {
  let total = 0;
  for (const p of projects) {
    if (p.deleted || p.id === excludeProjectId || !reservesYarns(p)) continue;
    for (const slot of p.slots || []) {
      for (const a of slot.allocations || []) {
        if (a.yarnId === yarnId) total += n(a.grams);
      }
    }
  }
  return total;
}

export function reservingProjects(yarnId, projects, excludeProjectId = null) {
  return projects.filter(
    (p) =>
      !p.deleted &&
      p.id !== excludeProjectId &&
      reservesYarns(p) &&
      (p.slots || []).some((s) => (s.allocations || []).some((a) => a.yarnId === yarnId && n(a.grams) > 0)),
  );
}

export function availableGrams(y, projects, excludeProjectId = null) {
  return Math.max(0, remainingGrams(y) - reservedGrams(y.id, projects, excludeProjectId));
}

// ---------- Besoin ----------

/**
 * Besoin d'une ligne de matériel en grammes. `slot` porte : grams, skeins, skeinGrams, meters, skeinMeters.
 * Si seul un métrage est connu, il faut un fil de référence pour convertir.
 */
export function needGrams(slot, yarn = null) {
  if (n(slot.grams) > 0) return n(slot.grams);
  if (n(slot.skeins) > 0 && n(slot.skeinGrams) > 0) return n(slot.skeins) * n(slot.skeinGrams);
  if (n(slot.meters) > 0) {
    if (n(slot.skeinGrams) > 0 && n(slot.skeinMeters) > 0) {
      return (n(slot.meters) * n(slot.skeinGrams)) / n(slot.skeinMeters);
    }
    if (yarn) return gramsFromMeters(yarn, n(slot.meters));
  }
  return null;
}

export function withMargin(grams, margin = DEFAULTS.margin) {
  if (grams === null || grams === undefined) return null;
  return Math.ceil(grams * (1 + margin) - 1e-9);
}

/** État d'une ligne de matériel dans un projet. */
export function slotStatus(slot, yarnsById, projects, project, margin = DEFAULTS.margin) {
  const allocations = slot.allocations || [];
  const refYarn = allocations.map((a) => yarnsById[a.yarnId]).find(Boolean) || null;
  const need = needGrams(slot, refYarn);
  const needMargin = withMargin(need, margin);
  const allocated = allocations.reduce((s, a) => s + n(a.grams), 0);
  let conflict = false;
  for (const a of allocations) {
    const y = yarnsById[a.yarnId];
    if (!y) {
      conflict = true;
      continue;
    }
    if (n(a.grams) > availableGrams(y, projects, project ? project.id : null) + 0.0001) conflict = true;
  }
  const known = needMargin !== null;
  // Petite quantité (restes de pelotes) sans besoin chiffré : une ligne est « assez » dès qu'un fil est choisi.
  const scraps = !!slot.scraps && !known;
  if (scraps) {
    return { need: null, needMargin: null, allocated, shortfall: 0, conflict, ok: allocations.length > 0 ? !conflict : null, unknown: false, scraps: true, hasYarn: allocations.length > 0 };
  }
  const ok = known ? allocated >= needMargin && !conflict : null;
  return {
    need,
    needMargin,
    allocated,
    shortfall: known ? Math.max(0, needMargin - allocated) : null,
    conflict,
    ok,
    unknown: !known,
    hasYarn: allocations.length > 0,
  };
}

export function projectStatus(project, yarnsById, projects, margin = DEFAULTS.margin) {
  const slots = (project.slots || []).filter((s) => (s.kind || 'yarn') === 'yarn');
  const states = slots.map((s) => slotStatus(s, yarnsById, projects, project, margin));
  const all = states.length > 0 && states.every((s) => s.ok === true);
  // « manque » : un fil est choisi mais n'en fournit pas assez. « pending » : aucun fil choisi pour la ligne.
  const missing = states.filter((s) => s.hasYarn && s.ok === false).length;
  const pending = states.filter((s) => !s.hasYarn).length;
  const unknown = states.filter((s) => s.hasYarn && s.ok === null).length;
  return { states, all, missing, pending, unknown, count: states.length };
}

export function projectCost(project, yarnsById) {
  let total = 0;
  let known = true;
  for (const slot of project.slots || []) {
    for (const a of slot.allocations || []) {
      const y = yarnsById[a.yarnId];
      if (!y) continue;
      const skeins = skeinsFromGrams(y, n(a.grams));
      if (skeins === null || y.price === '' || y.price === null || y.price === undefined) {
        known = false;
        continue;
      }
      total += skeins * n(y.price);
    }
  }
  return { total, complete: known };
}

// ---------- Choisir un fil ----------

export function matchesFilters(y, f = {}) {
  if (f.weights && f.weights.length && !f.weights.includes(y.weightCategory)) return false;
  if (f.materials && f.materials.length && !f.materials.includes(y.material)) return false;
  if (f.colors && f.colors.length && !f.colors.includes(y.colorKey)) return false;
  return true;
}

/** Fils à proposer pour une petite quantité : mêmes couleur et épaisseur d'abord, puis les plus petits restes. */
export function scrapsCandidates(slot, yarns, projects, opts = {}) {
  const filters = opts.filters || {};
  const projectId = opts.projectId ?? null;
  return yarns
    .filter((y) => !y.deleted && y.inStock !== false && matchesFilters(y, filters))
    .map((y) => ({
      yarn: y,
      available: availableGrams(y, projects, projectId),
      sameWeight: !!slot.weightCategory && slot.weightCategory === y.weightCategory,
      sameColor: !!slot.colorKey && slot.colorKey === y.colorKey,
    }))
    .filter((r) => r.available > 0)
    .sort((a, b) => Number(b.sameColor) - Number(a.sameColor) || Number(b.sameWeight) - Number(a.sameWeight) || a.available - b.available);
}

/**
 * Classe les fils du stock pour une ligne de matériel :
 * enough (assez seul), combine (assez à deux), insufficient (pas assez ou réservé).
 */
export function candidatesForSlot(slot, yarns, projects, opts = {}) {
  const margin = opts.margin ?? DEFAULTS.margin;
  const projectId = opts.projectId ?? null;
  const filters = opts.filters || {};
  const pool = yarns.filter((y) => !y.deleted && y.inStock !== false && matchesFilters(y, filters));
  const rows = pool.map((y) => {
    const need = needGrams(slot, y);
    const needM = withMargin(need, margin);
    const remaining = remainingGrams(y);
    const available = availableGrams(y, projects, projectId);
    const sameWeight = !!slot.weightCategory && slot.weightCategory === y.weightCategory;
    const sameColor = !!slot.colorKey && slot.colorKey === y.colorKey;
    return { yarn: y, need, needM, remaining, available, sameWeight, sameColor };
  });
  const enough = [];
  const insufficient = [];
  for (const r of rows) {
    if (r.needM === null) {
      insufficient.push({ ...r, reason: 'unknown', short: null });
    } else if (r.available >= r.needM) {
      enough.push({ ...r, leftover: r.available - r.needM });
    } else if (r.remaining >= r.needM) {
      insufficient.push({ ...r, reason: 'reserved', short: r.needM - r.available });
    } else {
      insufficient.push({ ...r, reason: 'short', short: r.needM - r.available });
    }
  }
  enough.sort((a, b) => Number(b.sameWeight) - Number(a.sameWeight) || Number(b.sameColor) - Number(a.sameColor) || a.leftover - b.leftover);
  insufficient.sort((a, b) => (a.short ?? 1e9) - (b.short ?? 1e9));

  const combine = [];
  const partial = insufficient.filter((r) => r.reason !== 'unknown' && r.available > 0);
  for (let i = 0; i < partial.length; i++) {
    for (let j = i + 1; j < partial.length; j++) {
      const a = partial[i];
      const b = partial[j];
      const needM = a.needM;
      if (needM === null) continue;
      // On ne combine que des fils de même épaisseur : mélanger deux épaisseurs donne un ouvrage irrégulier.
      if (a.yarn.weightCategory !== b.yarn.weightCategory) continue;
      const sum = a.available + b.available;
      if (sum >= needM) {
        combine.push({ yarns: [a, b], sum, needM, leftover: sum - needM, sameWeight: a.sameWeight && b.sameWeight });
      }
    }
  }
  combine.sort((a, b) => Number(b.sameWeight) - Number(a.sameWeight) || a.leftover - b.leftover);
  return { enough, combine: combine.slice(0, 5), insufficient };
}

/** Répartit le besoin sur les fils choisis, dans l'ordre. */
export function allocateAcross(chosen, needM) {
  let remaining = needM;
  const out = [];
  for (const c of chosen) {
    if (remaining <= 0) break;
    const g = Math.min(c.available, remaining);
    if (g > 0) {
      out.push({ yarnId: c.yarn.id, grams: Math.ceil(g) });
      remaining -= g;
    }
  }
  return out;
}

// ---------- Fin de projet ----------

/** Applique la consommation d'un projet terminé et retire du stock les restes sous le seuil. */
export function finishConsumption(yarn, allocatedGrams, weighedAfter, threshold = DEFAULTS.restThreshold) {
  const next = { ...yarn };
  if (weighedAfter !== null && weighedAfter !== undefined && weighedAfter !== '') {
    next.weighedGrams = Math.max(0, n(weighedAfter));
  } else if (next.weighedGrams !== null && next.weighedGrams !== undefined && next.weighedGrams !== '') {
    next.weighedGrams = Math.max(0, n(next.weighedGrams) - n(allocatedGrams));
  } else {
    next.usedGrams = n(next.usedGrams) + n(allocatedGrams);
  }
  next.inStock = remainingGrams(next) >= threshold;
  return next;
}

// ---------- Formats ----------

export function fmtGrams(g) {
  const r = Math.round(g);
  return `${r.toLocaleString('fr-FR')} g`;
}

export function fmtMeters(m) {
  if (m === null || m === undefined) return '';
  return `${Math.round(m).toLocaleString('fr-FR')} m`;
}

export function fmtEuro(v) {
  return `${(Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Un lien saisi (ou reçu de la synchro) n'est ouvrable que s'il commence par http:// ou https:// (jamais javascript:). */
export function safeHttpUrl(u) {
  const s = String(u || '').trim();
  try {
    const x = new URL(s);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch {
    return '';
  }
}

/** Adresse d'un projet Supabase : https obligatoire (http seulement en local). Renvoie l'origine, ou '' si invalide. */
export function safeServerUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    const local = x.hostname === 'localhost' || x.hostname === '127.0.0.1';
    return x.protocol === 'https:' || (x.protocol === 'http:' && local) ? x.origin : '';
  } catch {
    return '';
  }
}

/** Seuls les PDF et les images courantes gardent leur type ; tout le reste devient un simple fichier à télécharger. */
export function safeBlobType(t) {
  const s = String(t || '').toLowerCase().split(';')[0].trim();
  return /^(application\/pdf|image\/(jpeg|png|webp|gif|avif|heic|heif))$/.test(s) ? s : 'application/octet-stream';
}

/** « Mettre à jour l'appli » : ne retire que le service et les caches de mes-fils. D'autres applis partagent la même adresse. */
export async function resetAppShell({ serviceWorker, cacheStorage, scope }) {
  if (serviceWorker) {
    const regs = await serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => r.scope === scope).map((r) => r.unregister()));
  }
  if (cacheStorage) {
    const keys = await cacheStorage.keys();
    await Promise.all(keys.filter((k) => k.startsWith('mes-fils-')).map((k) => cacheStorage.delete(k)));
  }
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- Dates et temps (calendrier des projets) ----------

const pad2 = (x) => String(x).padStart(2, '0');

/** Date locale du jour au format AAAA-MM-JJ. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** AAAA-MM-JJ → Date locale à midi (évite les décalages d'heure d'été). */
export function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Nombre de jours entre deux dates, premier et dernier jour compris (début = fin → 1 jour). */
export function daysBetween(fromISO, toISO) {
  const a = parseISO(fromISO);
  const b = parseISO(toISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000) + 1;
}

/** 150 → « 2 h 30 », 45 → « 45 min », 0 → « 0 min ». */
export function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(n(minutes)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${pad2(r)}` : `${h} h`;
}

/** Date limite d'un projet : champ « deadline », ou l'ancienne date limite de cadeau. */
export function projectDeadline(p) {
  return p.deadline || p.giftDeadline || '';
}

/** Événements d'un projet pour le calendrier : début, fin, date limite. */
export function projectEvents(projects) {
  const out = [];
  for (const p of projects) {
    if (p.deleted) continue;
    if (p.startedAt) out.push({ date: p.startedAt, type: 'start', projectId: p.id, name: p.name });
    if (p.finishedAt) out.push({ date: p.finishedAt, type: 'end', projectId: p.id, name: p.name });
    const dl = projectDeadline(p);
    if (dl) out.push({ date: dl, type: 'deadline', projectId: p.id, name: p.name, done: ['termine', 'offert'].includes(p.status) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Période d'un projet : du début à la fin, ou jusqu'à aujourd'hui s'il est en cours. */
export function projectSpan(p, today = todayISO()) {
  if (!p.startedAt) return null;
  const end = p.finishedAt || (p.status === 'en_cours' ? today : null);
  return end && end >= p.startedAt ? [p.startedAt, end] : [p.startedAt, p.startedAt];
}

/** Semaines (lundi en premier) d'un mois : tableaux de 7 dates AAAA-MM-JJ, avec les jours voisins du mois. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = new Date(year, month, 1 - offset, 12);
  const weeks = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(todayISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
    if (w >= 4 && week[0].slice(0, 7) > `${year}-${pad2(month + 1)}`) break;
    weeks.push(week);
  }
  return weeks;
}
