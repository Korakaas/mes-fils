import * as store from './store.js';
import * as sync from './sync.js';
import { ui, actions, inputs, submits, setRenderer, hydratePhotos, paintOverlay, confirmSheet, toast, icons, esc } from './ctx.js';
import { renderStock } from './views/stock.js';
import { renderYarn, renderYarnForm, afterYarnForm } from './views/yarn.js';
import { renderPatterns, renderPatternNew, renderPatternEditor, renderReader, afterReader, afterPatterns } from './views/patterns.js';
import { renderProjects, renderProjectNew, renderProject, renderChoose, initChoose, afterList, afterProject, changes } from './views/projects.js';
import { renderSettings } from './views/settings.js';
import { renderCalendar } from './views/calendar.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let lastHash = null;

function route() {
  const h = location.hash || '#/';
  let m;
  if (h === '#/' || h === '') return { name: 'stock', nav: 'stock', html: renderStock, after: () => {} };
  if (h === '#/fil/nouveau') return { name: 'yarn-form', nav: null, html: () => renderYarnForm(null), after: afterYarnForm };
  if ((m = /^#\/fil\/([^/]+)\/modifier$/.exec(h))) return { name: 'yarn-form', nav: null, html: () => renderYarnForm(m[1]), after: afterYarnForm };
  if ((m = /^#\/fil\/([^/]+)$/.exec(h))) return { name: 'yarn', nav: 'stock', html: () => renderYarn(m[1]), after: () => {} };
  if (h === '#/patrons') return { name: 'patterns', nav: 'projets', html: renderPatterns, after: afterPatterns };
  if (h === '#/patron/nouveau') return { name: 'pattern-new', nav: null, html: renderPatternNew, after: () => {} };
  if ((m = /^#\/patron\/([^/]+)$/.exec(h))) return { name: 'pattern', nav: null, html: () => renderPatternEditor(m[1]), after: afterPatterns };
  if ((m = /^#\/lire\/([^/]+)(?:\/([^/]+))?$/.exec(h))) return { name: 'reader', nav: null, html: () => renderReader(m[1], m[2]), after: afterReader };
  if (h === '#/projets') return { name: 'projects', nav: 'projets', html: renderProjects, after: afterList };
  if (h === '#/projet/nouveau') return { name: 'project-new', nav: null, html: renderProjectNew, after: () => {} };
  if ((m = /^#\/projet\/([^/]+)\/choisir\/([^/]+)$/.exec(h))) {
    return { name: 'choose', nav: null, html: () => (initChoose(m[1], m[2]), renderChoose(m[1], m[2])), after: () => {} };
  }
  if ((m = /^#\/projet\/([^/]+)$/.exec(h))) return { name: 'project', nav: 'projets', html: () => renderProject(m[1]), after: afterProject };
  if (h === '#/calendrier') return { name: 'calendar', nav: 'calendrier', html: renderCalendar, after: () => {} };
  if (h === '#/reglages') return { name: 'settings', nav: null, html: renderSettings, after: () => {} };
  return { name: 'stock', nav: 'stock', html: renderStock, after: () => {} };
}

let current = route();

function render() {
  const hash = location.hash || '#/';
  if (!/^#\/(patron|lire)\//.test(hash)) ui.patternBack = null;
  current = route();
  const y = window.scrollY;
  try {
    view.innerHTML = current.html();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty">${icons.alert}<p>Un écran n’a pas pu s’afficher : ${esc(e.message)}</p><a class="btn" href="#/">Retour au stock</a></div>`;
  }
  view.classList.toggle('no-nav', !current.nav);
  nav.hidden = !current.nav;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.nav === current.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, hash === lastHash ? y : 0);
  lastHash = hash;
  hydratePhotos(view);
  Promise.resolve(current.after && current.after()).catch((e) => console.error(e));
  document.title = 'Mes fils';
}

setRenderer(render);

// ---------- Événements ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  try {
    await fn(el, e);
  } catch (err) {
    console.error(err);
    toast('Une erreur est survenue : ' + (err.message || err));
  }
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const fn = inputs[el.dataset.input];
  if (fn) fn(el, e);
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = changes[el.dataset.change];
  if (fn) {
    try {
      await fn(el, e);
    } catch (err) {
      console.error(err);
    }
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-submit]');
  if (!form) return;
  e.preventDefault();
  const fn = submits[form.dataset.submit];
  if (!fn) return;
  try {
    await fn(form, e);
  } catch (err) {
    console.error(err);
    toast('Une erreur est survenue : ' + (err.message || err));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (ui.lightbox) {
      ui.lightbox = null;
      paintOverlay();
    } else if (ui.sheet) {
      ui.sheet = null;
      paintOverlay();
    }
  }
});

window.addEventListener('hashchange', () => {
  ui.sheet = null;
  paintOverlay();
  render();
});

// ---------- Démarrage ----------

const SAFE_TO_REFRESH = new Set(['stock', 'patterns', 'projects', 'yarn']);

async function boot() {
  await store.init();
  await sync.loadConfig();
  sync.init();
  store.onChange((info) => {
    if (!info.local && SAFE_TO_REFRESH.has(current.name)) render();
  });
  let prevStatus = '';
  sync.onStatus((st) => {
    const dot = document.querySelector('.sync-dot');
    if (dot) dot.className = `sync-dot ${st.status}`;
    if (st.status !== prevStatus && current.name === 'settings' && ['ok', 'error', 'offline'].includes(st.status)) render();
    prevStatus = st.status;
  });

  const connect = sync.parseConnectHash(location.hash);
  if (connect) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    render();
    confirmSheet({
      title: 'Relier cet appareil ?',
      text: 'Tes fils, patrons et projets de l’autre appareil vont apparaître ici.',
      confirmLabel: 'Relier',
      onConfirm: async () => {
        try {
          await sync.testConnection(connect);
          await sync.saveConfig(connect);
          toast('Appareil relié, synchronisation…');
          await sync.runSync();
          render();
        } catch (err) {
          toast(err.message || 'Connexion impossible', 5000);
        }
      },
    });
  } else {
    render();
  }
  if (sync.getState().config) sync.runSync();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
