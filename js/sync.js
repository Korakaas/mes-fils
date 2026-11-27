// Synchronisation avec Supabase par code secret. Sans configuration, l'appli reste 100 % locale.

import * as store from './store.js';
import { safeServerUrl, safeBlobType } from './logic.js';

const state = { status: 'off', lastSync: null, error: '', config: null };
const listeners = new Set();
let timer = null;
let running = false;

function emit() {
  for (const fn of listeners) fn({ ...state });
}

export function onStatus(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getState() {
  return { ...state };
}

export async function loadConfig() {
  const cfg = await store.getMeta('sync');
  state.config = cfg && cfg.url && cfg.key && cfg.code ? cfg : null;
  state.status = state.config ? 'idle' : 'off';
  state.lastSync = (await store.getMeta('lastSyncAt')) || null;
  store.setRemoteBlobFetcher(state.config ? fetchRemoteBlob : null);
  emit();
  return state.config;
}

export async function saveConfig(cfg) {
  const clean = {
    url: safeServerUrl(cfg.url),
    key: String(cfg.key || '').trim(),
    code: String(cfg.code || '').trim(),
  };
  if (!clean.url || !clean.key || clean.code.length < 16) {
    throw new Error('Renseigne l’adresse (en https://), la clé et un code d’au moins 16 caractères.');
  }
  await store.setMeta('sync', clean);
  await store.setMeta('lastPull', '1970-01-01T00:00:00Z');
  await loadConfig();
}

export async function clearConfig() {
  await store.setMeta('sync', null);
  await loadConfig();
}

export function generateCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/** Lien à ouvrir sur un autre appareil pour le connecter sans rien retaper. */
export function connectLink() {
  const c = state.config;
  if (!c) return '';
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ u: c.url, k: c.key, c: c.code }))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${location.origin}${location.pathname}#connect=${payload}`;
}

export function parseConnectHash(hash) {
  const m = /^#connect=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const o = JSON.parse(json);
    return { url: o.u, key: o.k, code: o.c };
  } catch {
    return null;
  }
}

function headers(extra = {}) {
  const c = state.config;
  return { apikey: c.key, Authorization: `Bearer ${c.key}`, ...extra };
}

async function rpc(name, body) {
  const res = await fetch(`${state.config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json()).message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${msg}`.trim());
  }
  return res.json();
}

function publicUrl(id) {
  const c = state.config;
  return `${c.url}/storage/v1/object/public/crochet-files/${encodeURIComponent(id)}`;
}

async function fetchRemoteBlob(id) {
  const res = await fetch(publicUrl(id));
  if (!res.ok) throw new Error('fichier introuvable');
  const blob = await res.blob();
  // Le type vient du serveur : on ne garde que PDF et images, pour qu'un fichier ne puisse jamais s'ouvrir comme une page web
  return new Blob([blob], { type: safeBlobType(blob.type) });
}

async function pushBlobs() {
  const c = state.config;
  for (const rec of await store.pendingBlobs()) {
    const res = await fetch(`${c.url}/storage/v1/object/crochet-files/${encodeURIComponent(rec.id)}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': safeBlobType(rec.type) }),
      body: rec.blob,
    });
    // Un fichier n'est jamais modifié après envoi (identifiant unique) : « déjà présent » veut dire « déjà envoyé »
    let duplicate = res.status === 409;
    if (!res.ok && !duplicate) {
      const body = await res.json().catch(() => ({}));
      duplicate = String(body.statusCode) === '409';
    }
    if (!res.ok && !duplicate) {
      throw new Error(`envoi du fichier refusé (${res.status})`);
    }
    await store.saveBlobRecord({ ...rec, uploaded: true });
  }
}

async function pushDocs() {
  const dirty = store.dirtyDocs();
  for (let i = 0; i < dirty.length; i += 50) {
    const batch = dirty.slice(i, i + 50);
    await rpc('crochet_push', {
      p_code: state.config.code,
      p_docs: batch.map(({ coll, doc }) => ({
        coll,
        id: doc.id,
        deleted: !!doc.deleted,
        data: store.stripLocal(doc),
      })),
    });
    for (const { coll, doc } of batch) await store.markClean(coll, doc.id, doc.updatedAt);
  }
}

async function pull() {
  let since = (await store.getMeta('lastPull')) || '1970-01-01T00:00:00Z';
  for (;;) {
    const rows = await rpc('crochet_pull', { p_code: state.config.code, p_since: since });
    if (!rows.length) break;
    await store.applyRemote(rows.map((r) => ({ coll: r.d_coll, id: r.d_id, data: r.d_data, deleted: r.d_deleted })));
    since = rows[rows.length - 1].d_server_at;
    await store.setMeta('lastPull', since);
    if (rows.length < 500) break;
  }
}

export async function runSync() {
  if (!state.config || running) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    state.status = 'offline';
    emit();
    return;
  }
  running = true;
  state.status = 'syncing';
  state.error = '';
  emit();
  try {
    await pushBlobs();
    await pushDocs();
    await pull();
    state.lastSync = Date.now();
    await store.setMeta('lastSyncAt', state.lastSync);
    state.status = 'ok';
  } catch (e) {
    state.status = 'error';
    state.error = e && e.message ? e.message : String(e);
  } finally {
    running = false;
    emit();
  }
}

export function scheduleSync(delay = 1500) {
  if (!state.config) return;
  clearTimeout(timer);
  timer = setTimeout(runSync, delay);
}

export async function testConnection(cfg) {
  const url = safeServerUrl(cfg.url);
  if (!url) throw new Error('L’adresse du projet doit commencer par https://.');
  const res = await fetch(`${url}/rest/v1/rpc/crochet_pull`, {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: cfg.code, p_since: '2999-01-01T00:00:00Z' }),
  });
  if (res.status === 404) throw new Error('Les fonctions de synchro sont absentes : exécute le fichier supabase/setup.sql.');
  if (res.status === 401 || res.status === 403) throw new Error('Clé refusée : vérifie la clé « anon public ».');
  if (!res.ok) throw new Error(`Réponse inattendue (${res.status}).`);
  return true;
}

export function init() {
  store.onChange((info) => {
    if (info.local) scheduleSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300);
  });
  window.addEventListener('online', () => scheduleSync(300));
}
