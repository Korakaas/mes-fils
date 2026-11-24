// Calendrier : début, fin et date limite de chaque projet, sur un mois.
import * as L from '../logic.js';
import { ui, actions, esc, icons, data, rerender, emptyState } from '../ctx.js';

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const TYPE_LABEL = { start: 'Début', end: 'Fin', deadline: 'Date limite' };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function monthState() {
  if (!ui.calMonth) {
    const now = new Date();
    ui.calMonth = { y: now.getFullYear(), m: now.getMonth() };
  }
  return ui.calMonth;
}

const fmtDay = (iso) => cap(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(L.parseISO(iso)));
const fmtShort = (iso) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(L.parseISO(iso));

function eventRow(e, today) {
  const dl = e.type === 'deadline';
  const late = dl && !e.done && e.date < today;
  const when = dl && !e.done ? (e.date === today ? 'aujourd’hui' : e.date > today ? `dans ${L.daysBetween(today, e.date) - 1} j` : `en retard de ${L.daysBetween(e.date, today) - 1} j`) : '';
  return `<a class="listrow" href="#/projet/${esc(e.projectId)}"><span class="evdot ${e.type}" aria-hidden="true"></span>
    <span class="grow"><span class="t">${esc(e.name)}</span><span class="s">${TYPE_LABEL[e.type]}${e.done ? ' · fait' : ''} · ${esc(fmtShort(e.date))}${when ? ` · <span style="${late ? 'color:var(--bad);font-weight:700' : ''}">${esc(when)}</span>` : ''}</span></span><span class="chev">${icons.chev}</span></a>`;
}

export function renderCalendar() {
  const d = data();
  const today = L.todayISO();
  const { y, m } = monthState();
  const projects = d.projects.filter((p) => !p.deleted);
  const events = L.projectEvents(projects);
  const byDay = new Map();
  for (const e of events) {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(e);
  }
  const spans = projects.filter((p) => p.status !== 'abandonne').map((p) => ({ p, span: L.projectSpan(p, today) })).filter((x) => x.span);
  const inProgress = (iso) => spans.filter((x) => iso >= x.span[0] && iso <= x.span[1]);
  const weeks = L.monthGrid(y, m);
  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
  const title = cap(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m, 1, 12)));
  const sel = ui.calDay && ui.calDay.startsWith(monthKey) ? ui.calDay : today.startsWith(monthKey) ? today : '';

  const cells = weeks
    .flat()
    .map((iso) => {
      const evs = byDay.get(iso) || [];
      const types = [...new Set(evs.map((e) => e.type))];
      const busy = inProgress(iso).length > 0;
      const cls = ['cal-day', iso.startsWith(monthKey) ? '' : 'other', iso === today ? 'today' : '', iso === sel ? 'sel' : '', busy ? 'busy' : ''].filter(Boolean).join(' ');
      const label = `${fmtDay(iso)}${evs.length ? `, ${evs.length} événement${evs.length > 1 ? 's' : ''}` : ''}`;
      return `<button type="button" class="${cls}" data-act="cal.day" data-date="${iso}" aria-label="${esc(label)}" aria-pressed="${iso === sel}"><span class="num">${Number(iso.slice(8))}</span><span class="dots">${types.map((t) => `<i class="evdot ${t}"></i>`).join('')}</span></button>`;
    })
    .join('');

  let detail;
  if (sel) {
    const evs = byDay.get(sel) || [];
    const active = inProgress(sel).filter((x) => !evs.some((e) => e.projectId === x.p.id));
    detail = `<div class="section"><h2>${esc(fmtDay(sel))}</h2><div class="stack">${evs.map((e) => eventRow(e, today)).join('')}${active
      .map((x) => `<a class="listrow" href="#/projet/${esc(x.p.id)}"><span class="evdot busy" aria-hidden="true"></span><span class="grow"><span class="t">${esc(x.p.name)}</span><span class="s">Projet en cours ce jour-là</span></span><span class="chev">${icons.chev}</span></a>`)
      .join('')}${!evs.length && !active.length ? '<p class="hint">Rien de prévu ce jour-là.</p>' : ''}</div></div>`;
  } else detail = '';

  const upcoming = events.filter((e) => e.type === 'deadline' && !e.done && e.date >= today).slice(0, 6);
  const late = events.filter((e) => e.type === 'deadline' && !e.done && e.date < today && projects.find((p) => p.id === e.projectId && p.status !== 'abandonne'));
  const hasAny = events.length > 0;
  return `
    <div class="topbar"><h1>Calendrier</h1></div>
    <div class="calnav"><button type="button" class="iconbtn" data-act="cal.prev" aria-label="Mois précédent">‹</button>
      <div class="calmonth" aria-live="polite">${esc(title)}</div>
      <button type="button" class="iconbtn" data-act="cal.next" aria-label="Mois suivant">›</button></div>
    <div class="calgrid" role="group" aria-label="${esc(title)}">${WEEK.map((w) => `<span class="calwk" aria-hidden="true">${w}</span>`).join('')}${cells}</div>
    <p class="callegend"><span><i class="evdot start"></i>Début</span><span><i class="evdot end"></i>Fin</span><span><i class="evdot deadline"></i>Date limite</span><span><i class="evbar"></i>Projet en cours</span></p>
    <p style="text-align:center;margin:0"><button type="button" class="linkbtn" data-act="cal.today">Aujourd’hui</button></p>
    ${detail}
    ${late.length ? `<div class="section"><h2>En retard</h2><div class="stack">${late.map((e) => eventRow(e, today)).join('')}</div></div>` : ''}
    ${upcoming.length ? `<div class="section"><h2>Prochaines dates limites</h2><div class="stack">${upcoming.map((e) => eventRow(e, today)).join('')}</div></div>` : ''}
    ${!hasAny ? emptyState(icons.folder, 'Rien encore au calendrier. Ajoute un début ou une date limite dans la fiche d’un projet.', '<a class="btn primary" href="#/projets">Voir mes projets</a>') : ''}`;
}

function shift(delta) {
  const s = monthState();
  const d = new Date(s.y, s.m + delta, 1, 12);
  ui.calMonth = { y: d.getFullYear(), m: d.getMonth() };
  ui.calDay = '';
  rerender();
}
actions['cal.prev'] = () => shift(-1);
actions['cal.next'] = () => shift(1);
actions['cal.today'] = () => {
  const now = new Date();
  ui.calMonth = { y: now.getFullYear(), m: now.getMonth() };
  ui.calDay = L.todayISO();
  rerender();
};
actions['cal.day'] = (el) => {
  ui.calDay = el.dataset.date;
  const s = monthState();
  if (!ui.calDay.startsWith(`${s.y}-${String(s.m + 1).padStart(2, '0')}`)) ui.calMonth = { y: Number(ui.calDay.slice(0, 4)), m: Number(ui.calDay.slice(5, 7)) - 1 };
  rerender();
};
