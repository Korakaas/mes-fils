import * as store from '../store.js';
import * as sync from '../sync.js';
import { loadDemo } from '../demo.js';
import { actions, submits, esc, icons, topbar, data, go, toast, confirmSheet, promptSheet, rerender, numStr, toNum, pickFile } from '../ctx.js';

function syncSummary(st) {
  if (!st.config) return { kind: 'info', text: 'Synchro désactivée : les données restent sur cet appareil.' };
  if (st.status === 'syncing') return { kind: 'warn', text: 'Synchronisation en cours…' };
  if (st.status === 'error') return { kind: 'bad', text: `Erreur de synchro : ${st.error}` };
  if (st.status === 'offline') return { kind: 'warn', text: 'Hors connexion : la synchro reprendra au retour du réseau.' };
  const when = st.lastSync ? new Date(st.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return { kind: 'good', text: when ? `Synchronisé le ${when}` : 'Synchro prête' };
}

export function renderSettings() {
  const d = data();
  const st = sync.getState();
  const sum = syncSummary(st);
  const cfg = st.config || { url: '', key: '', code: '' };
  const boxRows = d.boxes
    .map((b) => {
      const n = d.yarns.filter((y) => y.boxId === b.id).length;
      return `<div class="listrow" style="min-height:56px"><span class="grow"><span class="t">${esc(b.name)}</span><span class="s">${n} fil${n > 1 ? 's' : ''}</span></span>
        <button type="button" class="linkbtn" data-act="settings.renameBox" data-id="${esc(b.id)}">Renommer</button>
        <button type="button" class="linkbtn" style="color:var(--bad)" data-act="settings.deleteBox" data-id="${esc(b.id)}">Retirer</button></div>`;
    })
    .join('');
  return `
    ${topbar('Réglages', { backHref: '#/' })}
    <div class="section"><h2>Calculs</h2>
      <form data-submit="settings.save" class="card stack">
        <div class="row">
          <div class="field" style="margin:0"><label for="s-margin">Marge de sécurité (%)</label><input id="s-margin" name="margin" type="text" inputmode="decimal" value="${esc(numStr(Math.round(d.settings.margin * 1000) / 10))}"></div>
          <div class="field" style="margin:0"><label for="s-rest">Reste gardé dès (g)</label><input id="s-rest" name="restThreshold" type="text" inputmode="decimal" value="${esc(numStr(d.settings.restThreshold))}"></div>
        </div>
        <p class="hint">La marge s’ajoute à la quantité demandée par un patron. Un reste plus léger que le seuil sort du stock à la fin d’un projet.</p>
        <button type="submit" class="btn small">Enregistrer</button>
      </form></div>
    <div class="section"><h2>Boîtes de rangement</h2><div class="stack">${boxRows || '<p class="hint">Aucune boîte pour l’instant.</p>'}
      <button type="button" class="btn small" data-act="settings.addBox">+ Nouvelle boîte</button></div></div>
    <div class="section"><h2>Synchronisation</h2>
      <div class="banner ${sum.kind}" style="margin-bottom:10px"><span>${esc(sum.text)}</span></div>
      <form data-submit="settings.sync" class="card stack" id="sync-form">
        <div class="field" style="margin:0"><label for="sy-url">Adresse du projet Supabase</label><input id="sy-url" name="url" type="url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co" autocomplete="off"></div>
        <div class="field" style="margin:0"><label for="sy-key">Clé « anon public »</label><input id="sy-key" name="key" type="text" value="${esc(cfg.key)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field" style="margin:0"><label for="sy-code">Code secret</label><input id="sy-code" name="code" type="text" value="${esc(cfg.code)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <span class="hint">Il relie tes appareils : garde-le pour toi. Au moins 16 caractères.</span></div>
        <div class="row"><button type="button" class="btn small" data-act="settings.genCode">Générer un code</button><button type="submit" class="btn primary small">${st.config ? 'Mettre à jour' : 'Activer'}</button></div>
        ${st.config ? `<div class="row"><button type="button" class="btn small" data-act="settings.syncNow">Synchroniser</button><button type="button" class="btn small" data-act="settings.copyLink">Copier le lien de connexion</button></div>
        <button type="button" class="linkbtn" style="color:var(--bad)" data-act="settings.syncOff">Désactiver la synchro sur cet appareil</button>` : ''}
      </form>
      <p class="hint" style="margin-top:6px">Ouvre le lien de connexion sur ton autre appareil pour le relier sans rien retaper.</p></div>
    <div class="section"><h2>Sauvegarde</h2><div class="stack">
      <button type="button" class="btn block" data-act="settings.export">Télécharger une sauvegarde</button>
      <button type="button" class="btn block" data-act="settings.import">Restaurer une sauvegarde</button></div></div>
    <div class="section"><h2>Essayer l’appli</h2><div class="stack">
      <button type="button" class="btn block" data-act="settings.demo">Ajouter des fils et projets d’exemple</button>
      <button type="button" class="linkbtn" style="color:var(--bad)" data-act="settings.wipe">Tout effacer sur cet appareil</button></div></div>
    ${store.isMemoryOnly() ? `<div class="banner warn" style="margin-top:14px">${icons.alert}<span>Le stockage de ce navigateur est bloqué : les données seront perdues à la fermeture.</span></div>` : ''}
    <button type="button" class="btn block" style="margin-top:18px" data-act="settings.refresh">Mettre à jour l’appli</button>
    <p class="hint" style="margin:8px 0 0;text-align:center">Recharge les derniers fichiers. Tes fils et projets ne sont pas touchés.</p>
    <p class="hint" style="margin:14px 0 0;text-align:center">Mes fils · version 12</p>`;
}

submits['settings.save'] = async (form) => {
  const v = Object.fromEntries(new FormData(form));
  const margin = toNum(v.margin);
  const rest = toNum(v.restThreshold);
  await store.saveSettings({
    margin: margin === null ? 0.1 : Math.min(1, Math.max(0, margin / 100)),
    restThreshold: rest === null ? 20 : Math.max(0, rest),
  });
  toast('Réglages enregistrés');
};

actions['settings.addBox'] = () => {
  promptSheet({
    title: 'Nouvelle boîte',
    label: 'Nom de la boîte',
    onConfirm: async (name) => {
      if (name) await store.put('boxes', { name });
      rerender();
    },
  });
};

actions['settings.renameBox'] = (el) => {
  const b = store.get('boxes', el.dataset.id);
  promptSheet({
    title: 'Renommer la boîte',
    label: 'Nom',
    value: b.name,
    onConfirm: async (name) => {
      if (name) await store.put('boxes', { ...b, name });
      rerender();
    },
  });
};

actions['settings.deleteBox'] = (el) => {
  const id = el.dataset.id;
  confirmSheet({
    title: 'Retirer cette boîte ?',
    text: 'Les fils qu’elle contient restent dans le stock, sans boîte.',
    confirmLabel: 'Retirer',
    danger: true,
    onConfirm: async () => {
      for (const y of store.list('yarns').filter((x) => x.boxId === id)) await store.put('yarns', { ...y, boxId: '' });
      await store.remove('boxes', id);
      rerender();
    },
  });
};

actions['settings.genCode'] = () => {
  document.getElementById('sy-code').value = sync.generateCode();
};

submits['settings.sync'] = async (form) => {
  const v = Object.fromEntries(new FormData(form));
  try {
    await sync.testConnection(v);
    await sync.saveConfig(v);
    toast('Synchro activée');
    sync.runSync();
    rerender();
  } catch (e) {
    toast(e.message || 'Connexion impossible', 5000);
  }
};

actions['settings.syncNow'] = async () => {
  await sync.runSync();
  rerender();
};

actions['settings.syncOff'] = () => {
  confirmSheet({
    title: 'Désactiver la synchro ?',
    text: 'Les données restent sur cet appareil et en ligne, mais ne se mettent plus à jour.',
    confirmLabel: 'Désactiver',
    danger: true,
    onConfirm: async () => {
      await sync.clearConfig();
      rerender();
    },
  });
};

actions['settings.copyLink'] = async () => {
  const link = sync.connectLink();
  try {
    await navigator.clipboard.writeText(link);
    toast('Lien copié : ouvre-le sur ton autre appareil');
  } catch {
    promptSheet({ title: 'Lien de connexion', label: 'Copie ce lien', value: link, confirmLabel: 'Fermer', onConfirm: () => {} });
  }
};

actions['settings.export'] = () => {
  const json = JSON.stringify(store.exportAll(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mes-fils-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Sauvegarde téléchargée (les photos et PDF restent dans l’appli)');
};

actions['settings.import'] = async () => {
  const file = await pickFile({ accept: 'application/json,.json' });
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'crochet') throw new Error('format');
    const n = await store.importAll(data);
    toast(`${n} éléments restaurés`);
    go('#/');
  } catch {
    toast('Ce fichier n’est pas une sauvegarde de l’appli');
  }
};

actions['settings.refresh'] = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    /* on recharge quand même */
  }
  location.reload();
};

actions['settings.demo'] = async () => {
  await loadDemo();
  toast('Exemples ajoutés');
  go('#/');
};

actions['settings.wipe'] = () => {
  confirmSheet({
    title: 'Tout effacer ?',
    text: 'Fils, patrons et projets de cet appareil sont supprimés. Si la synchro est active, ils disparaissent aussi de tes autres appareils.',
    confirmLabel: 'Tout effacer',
    danger: true,
    onConfirm: async () => {
      await store.wipeAll();
      toast('Tout est effacé');
      go('#/');
    },
  });
};

