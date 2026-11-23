// Stockage local (IndexedDB) : les données vivent d'abord sur l'appareil, la synchro (sync.js) les copie en ligne.

import { uid } from './logic.js';

const COLLS = ['yarns', 'boxes', 'patterns', 'projects', 'settings'];
const listeners = new Set();
const cache = Object.fromEntries(COLLS.map((c) => [c, new Map()]));
const blobCache = new Map(); // id -> object URL
let db = null;
let memoryOnly = false;
const memBlobs = new Map();
const memMeta = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open('crochet', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('docs', { keyPath: ['coll', 'id'] });
      d.createObjectStore('blobs', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function init() {
  try {
    db = await openDb();
    const all = await tx('docs', 'readonly', (s) => s.getAll());
    for (const d of all || []) {
      if (cache[d.coll]) cache[d.coll].set(d.id, d.doc);
    }
  } catch (e) {
    memoryOnly = true;
  }
  return { memoryOnly };
}

export function isMemoryOnly() {
  return memoryOnly;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(info) {
  for (const fn of listeners) {
    try {
      fn(info);
    } catch (e) {
      console.error(e);
    }
  }
}

async function persist(coll, doc) {
  if (memoryOnly) return;
  await tx('docs', 'readwrite', (s) => s.put({ coll, id: doc.id, doc }));
}

// ---------- Documents ----------

export function list(coll, { includeDeleted = false } = {}) {
  const all = [...cache[coll].values()];
  return includeDeleted ? all : all.filter((d) => !d.deleted);
}

export function get(coll, id) {
  const d = cache[coll].get(id);
  return d && !d.deleted ? d : null;
}

export async function put(coll, doc, { silent = false } = {}) {
  const next = { ...doc, id: doc.id || uid(), updatedAt: Date.now(), _dirty: true };
  if (!next.createdAt) next.createdAt = next.updatedAt;
  cache[coll].set(next.id, next);
  await persist(coll, next);
  if (!silent) emit({ type: 'put', coll, id: next.id, local: true });
  return next;
}

export async function remove(coll, id) {
  const cur = cache[coll].get(id);
  if (!cur) return;
  const next = { ...cur, deleted: true, updatedAt: Date.now(), _dirty: true };
  cache[coll].set(id, next);
  await persist(coll, next);
  emit({ type: 'remove', coll, id, local: true });
}

/** Utilisé par la synchro : fusionne des documents distants. */
export async function applyRemote(rows) {
  let changed = 0;
  for (const r of rows) {
    if (!cache[r.coll]) continue;
    const local = cache[r.coll].get(r.id);
    const remote = { ...r.data, id: r.id, deleted: !!r.deleted || !!r.data.deleted };
    const rUpdated = Number(remote.updatedAt) || 0;
    if (local && (Number(local.updatedAt) || 0) >= rUpdated) continue;
    remote._dirty = false;
    cache[r.coll].set(r.id, remote);
    await persist(r.coll, remote);
    changed++;
  }
  if (changed) emit({ type: 'remote', local: false });
  return changed;
}

export function dirtyDocs() {
  const out = [];
  for (const coll of COLLS) {
    for (const d of cache[coll].values()) if (d._dirty) out.push({ coll, doc: d });
  }
  return out;
}

export async function markClean(coll, id, updatedAt) {
  const cur = cache[coll].get(id);
  if (!cur || cur.updatedAt !== updatedAt) return;
  const next = { ...cur, _dirty: false };
  cache[coll].set(id, next);
  await persist(coll, next);
}

export function stripLocal(doc) {
  const { _dirty, ...rest } = doc;
  return rest;
}

// ---------- Réglages (stockés comme un document, donc synchronisés) ----------

export function getSettings() {
  const s = cache.settings.get('main');
  return { margin: 0.1, restThreshold: 20, ...(s || {}) };
}

export async function saveSettings(patch) {
  const cur = cache.settings.get('main') || { id: 'main' };
  return put('settings', { ...cur, ...patch, id: 'main' });
}

// ---------- Métadonnées locales (jamais synchronisées) ----------

export async function getMeta(key) {
  if (memoryOnly) return memMeta.get(key);
  const row = await tx('meta', 'readonly', (s) => s.get(key));
  return row ? row.value : undefined;
}

export async function setMeta(key, value) {
  if (memoryOnly) {
    memMeta.set(key, value);
    return;
  }
  await tx('meta', 'readwrite', (s) => s.put({ key, value }));
}

// ---------- Fichiers (photos, PDF) ----------

export async function putBlob(blob, name = '') {
  const id = uid();
  const rec = { id, blob, type: blob.type || '', name, uploaded: false, size: blob.size };
  if (memoryOnly) memBlobs.set(id, rec);
  else await tx('blobs', 'readwrite', (s) => s.put(rec));
  return id;
}

export async function getBlobRecord(id) {
  if (memoryOnly) return memBlobs.get(id) || null;
  return (await tx('blobs', 'readonly', (s) => s.get(id))) || null;
}

export async function saveBlobRecord(rec) {
  if (memoryOnly) memBlobs.set(rec.id, rec);
  else await tx('blobs', 'readwrite', (s) => s.put(rec));
}

export async function pendingBlobs() {
  if (memoryOnly) return [...memBlobs.values()].filter((r) => !r.uploaded);
  const all = await tx('blobs', 'readonly', (s) => s.getAll());
  return (all || []).filter((r) => !r.uploaded);
}

export async function deleteBlob(id) {
  if (blobCache.has(id)) {
    URL.revokeObjectURL(blobCache.get(id));
    blobCache.delete(id);
  }
  if (memoryOnly) memBlobs.delete(id);
  else await tx('blobs', 'readwrite', (s) => s.delete(id));
}

let remoteBlobFetcher = null;
export function setRemoteBlobFetcher(fn) {
  remoteBlobFetcher = fn;
}

const inflight = new Map();

/** Renvoie l'enregistrement local du fichier, ou le télécharge depuis la synchro (une seule requête à la fois par fichier). */
export function loadBlob(id) {
  if (!id) return Promise.resolve(null);
  if (inflight.has(id)) return inflight.get(id);
  const job = (async () => {
    let rec = await getBlobRecord(id);
    if (!rec && remoteBlobFetcher) {
      const blob = await remoteBlobFetcher(id).catch(() => null);
      if (blob) {
        rec = { id, blob, type: blob.type, name: '', uploaded: true, size: blob.size };
        await saveBlobRecord(rec);
      }
    }
    return rec;
  })().finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}

export async function blobUrl(id) {
  if (!id) return null;
  if (blobCache.has(id)) return blobCache.get(id);
  const rec = await loadBlob(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  blobCache.set(id, url);
  return url;
}

// ---------- Sauvegarde complète ----------

export function exportAll() {
  const out = { app: 'crochet', version: 1, exportedAt: new Date().toISOString() };
  for (const c of COLLS) out[c] = [...cache[c].values()].map(stripLocal);
  return out;
}

export async function importAll(data) {
  let n = 0;
  for (const c of COLLS) {
    for (const d of data[c] || []) {
      if (!d || !d.id) continue;
      await put(c, d, { silent: true });
      n++;
    }
  }
  emit({ type: 'import', local: true });
  return n;
}

export async function wipeAll() {
  for (const c of COLLS) {
    for (const d of [...cache[c].values()]) {
      await remove(c, d.id);
    }
  }
}
