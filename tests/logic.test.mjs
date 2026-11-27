import test from 'node:test';
import assert from 'node:assert/strict';
import {
  knownYarn, guessWeightCategory, WEIGHT_GUIDE, WEIGHTS,
  skeinsText,
  safeHttpUrl, safeServerUrl, safeBlobType, resetAppShell,
  remainingGrams, metersFromGrams, stockLevel, reservedGrams, availableGrams, needGrams, withMargin,
  slotStatus, projectStatus, candidatesForSlot, scrapsCandidates, allocateAcross, finishConsumption, projectCost, reservesYarns,
} from '../js/logic.js';

const phil = { id: 'phil', name: 'Phil Coton 4', skeins: 20, gramsPerSkein: 50, metersPerSkein: 85, usedGrams: 233, weightCategory: 'Worsted', material: 'Coton', inStock: true, price: 3.99 };
const rose = { id: 'rose', name: 'Rose Water', skeins: 5, gramsPerSkein: 125, metersPerSkein: 100, weightCategory: 'Bulky', material: 'Coton', inStock: true };
const salt = { id: 'salt', name: 'Salt', skeins: 2, gramsPerSkein: 125, metersPerSkein: 100, weightCategory: 'Bulky', material: 'Coton', inStock: true };
const moutarde = { id: 'mout', name: 'Moutarde', skeins: 1, gramsPerSkein: 125, metersPerSkein: 100, weightCategory: 'Bulky', material: 'Coton', inStock: true };
const mohair = { id: 'moh', name: 'Eglantine', skeins: 8, gramsPerSkein: 25, metersPerSkein: 200, weightCategory: 'Fingering', material: 'Mohair', inStock: true };
const white = { id: 'white', name: 'White', skeins: 2, gramsPerSkein: 100, metersPerSkein: 120, weightCategory: 'Worsted', inStock: true };

test('restant, mètres et niveaux (valeurs de la maquette)', () => {
  assert.equal(remainingGrams(phil), 767);
  assert.equal(Math.round(metersFromGrams(phil, 767)), 1304);
  assert.equal(stockLevel(767).label, 'Gros stock');
  assert.equal(stockLevel(250).label, 'Moyen');
  assert.equal(stockLevel(125).label, 'Petit');
  assert.equal(stockLevel(99).label, 'Quasi fini');
});

test('le poids pesé remplace le calcul', () => {
  assert.equal(remainingGrams({ ...phil, weighedGrams: 600 }), 600);
  assert.equal(remainingGrams({ ...phil, weighedGrams: 0 }), 0);
});

test('besoin et marge de 10 %', () => {
  assert.equal(withMargin(600), 660);
  assert.equal(withMargin(300), 330);
  assert.equal(withMargin(170), 187);
  assert.equal(needGrams({ skeins: 3, skeinGrams: 50 }), 150);
  assert.equal(Math.round(needGrams({ meters: 340, skeinGrams: 50, skeinMeters: 85 })), 200);
  assert.equal(Math.round(needGrams({ meters: 340 }, phil)), 200);
  assert.equal(needGrams({ meters: 340 }), null);
});

test('réservations : en cours oui, en pause selon l\'interrupteur, terminé non', () => {
  const slot = { allocations: [{ yarnId: 'white', grams: 187 }] };
  const base = { id: 'p1', slots: [slot] };
  assert.equal(reservedGrams('white', [{ ...base, status: 'en_cours' }]), 187);
  assert.equal(reservedGrams('white', [{ ...base, status: 'en_pause' }]), 187);
  assert.equal(reservedGrams('white', [{ ...base, status: 'en_pause', keepReservedOnPause: false }]), 0);
  assert.equal(reservedGrams('white', [{ ...base, status: 'envie' }]), 0);
  assert.equal(reservedGrams('white', [{ ...base, status: 'termine' }]), 0);
  assert.equal(reservedGrams('white', [{ ...base, status: 'en_cours' }], 'p1'), 0);
  assert.equal(availableGrams(white, [{ ...base, status: 'en_cours' }]), 13);
  assert.equal(reservesYarns({ status: 'offert' }), false);
});

test('Assez de fil / il manque pour le plaid d\'exemple', () => {
  const byId = { phil, rose, mohair };
  const slotCoton = { kind: 'yarn', grams: 600, weightCategory: 'Worsted', allocations: [{ yarnId: 'phil', grams: 660 }] };
  const slotMohair = { kind: 'yarn', grams: 250, weightCategory: 'Fingering', allocations: [{ yarnId: 'moh', grams: 200 }] };
  const st1 = slotStatus(slotCoton, byId, [], null);
  assert.equal(st1.needMargin, 660);
  assert.equal(st1.ok, true);
  const st2 = slotStatus(slotMohair, byId, [], null);
  assert.equal(st2.needMargin, 275);
  assert.equal(st2.ok, false);
  assert.equal(st2.shortfall, 75);
  const ps = projectStatus({ id: 'x', slots: [slotCoton, slotMohair] }, byId, []);
  assert.equal(ps.all, false);
  assert.equal(ps.missing, 1);
  const none = projectStatus({ id: 'y', slots: [{ kind: 'yarn', grams: 100, allocations: [] }] }, byId, []);
  assert.equal(none.missing, 0);
  assert.equal(none.pending, 1);
});

test('choisir un fil : assez / à combiner / pas assez (écran 5)', () => {
  const yarns = [rose, phil, salt, moutarde, mohair];
  const slot = { kind: 'yarn', grams: 300, weightCategory: 'Bulky' };
  const res = candidatesForSlot(slot, yarns, []);
  assert.deepEqual(res.enough.map((r) => r.yarn.id), ['rose', 'phil']);
  assert.equal(res.enough[0].leftover, 625 - 330);
  assert.equal(res.enough[1].leftover, 437);
  assert.equal(res.combine.length, 1);
  assert.deepEqual(res.combine[0].yarns.map((r) => r.yarn.id).sort(), ['mout', 'salt']);
  assert.equal(res.combine[0].sum, 375);
  const moh = res.insufficient.find((r) => r.yarn.id === 'moh');
  assert.equal(moh.short, 330 - 200);
});

test('un fil réservé ailleurs n\'est plus proposé comme suffisant', () => {
  const other = { id: 'other', status: 'en_cours', slots: [{ allocations: [{ yarnId: 'rose', grams: 500 }] }] };
  const res = candidatesForSlot({ kind: 'yarn', grams: 300 }, [rose], [other]);
  assert.equal(res.enough.length, 0);
  assert.equal(res.insufficient[0].reason, 'reserved');
  const same = candidatesForSlot({ kind: 'yarn', grams: 300 }, [rose], [other], { projectId: 'other' });
  assert.equal(same.enough.length, 1);
});

test('filtres facultatifs', () => {
  const res = candidatesForSlot({ kind: 'yarn', grams: 100 }, [rose, mohair], [], { filters: { materials: ['Mohair'] } });
  const ids = [...res.enough, ...res.insufficient].map((r) => r.yarn.id);
  assert.deepEqual(ids, ['moh']);
});

test('répartition sur plusieurs fils', () => {
  const chosen = [{ yarn: salt, available: 250 }, { yarn: moutarde, available: 125 }];
  assert.deepEqual(allocateAcross(chosen, 330), [{ yarnId: 'salt', grams: 250 }, { yarnId: 'mout', grams: 80 }]);
});

test('fin de projet : consommation et seuil de 20 g', () => {
  const a = finishConsumption(white, 187, null);
  assert.equal(remainingGrams(a), 13);
  assert.equal(a.inStock, false);
  const b = finishConsumption(white, 100, 40);
  assert.equal(remainingGrams(b), 40);
  assert.equal(b.inStock, true);
});

test('coût du projet', () => {
  const project = { slots: [{ allocations: [{ yarnId: 'phil', grams: 100 }] }] };
  const c = projectCost(project, { phil });
  assert.equal(Math.round(c.total * 100) / 100, 7.98);
  assert.equal(c.complete, true);
  const c2 = projectCost({ slots: [{ allocations: [{ yarnId: 'rose', grams: 100 }] }] }, { rose });
  assert.equal(c2.complete, false);
});

test('petite quantité : assez dès qu’un fil est choisi, restes proposés par ordre', () => {
  const slot = { id: 's', kind: 'yarn', scraps: true, weightCategory: 'Bulky', colorKey: 'rouge', allocations: [] };
  const project = { id: 'p', status: 'en_cours', slots: [slot] };
  const byId = { mout: moutarde, salt };
  assert.equal(slotStatus(slot, byId, [project], project).ok, null);
  assert.equal(projectStatus(project, byId, [project]).pending, 1);
  const chosen = { ...slot, allocations: [{ yarnId: 'mout', grams: 10 }] };
  const st = slotStatus(chosen, byId, [{ ...project, slots: [chosen] }], project);
  assert.equal(st.ok, true);
  assert.equal(st.unknown, false);
  const red = { ...mohair, id: 'red', colorKey: 'rouge', weightCategory: 'Fingering', skeins: 1 };
  const list = scrapsCandidates(slot, [salt, moutarde, red], [], {});
  assert.equal(list[0].yarn.id, 'red'); // même couleur d'abord
  assert.equal(list[1].yarn.id, 'mout'); // puis même épaisseur, plus petit reste en premier
  // un besoin chiffré reste prioritaire sur le mode « restes »
  const known = { ...slot, grams: 500 };
  assert.equal(slotStatus(known, byId, [project], project).scraps, undefined);
});

test('dates : durée, formats, grille du mois et événements', async () => {
  const L = await import('../js/logic.js');
  assert.equal(L.daysBetween('2026-11-01', '2026-11-01'), 1);
  assert.equal(L.daysBetween('2026-10-28', '2026-11-03'), 7); // heure d'été comprise
  assert.equal(L.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(L.fmtDuration(150), '2 h 30');
  assert.equal(L.fmtDuration(45), '45 min');
  assert.equal(L.fmtDuration(120), '2 h');
  const weeks = L.monthGrid(2026, 10); // novembre 2026 : le 1er est un dimanche
  assert.equal(weeks[0][0], '2026-10-26');
  assert.equal(weeks[0][6], '2026-11-01');
  assert.ok(weeks.flat().includes('2026-11-30'));
  assert.ok(weeks.every((w) => w.length === 7));
  const ev = L.projectEvents([
    { id: 'a', name: 'Renard', startedAt: '2026-11-02', giftDeadline: '2026-12-20', status: 'en_cours' },
    { id: 'b', name: 'Plaid', startedAt: '2026-10-01', finishedAt: '2026-10-20', deadline: '2026-10-25', status: 'termine' },
  ]);
  assert.deepEqual(ev.map((e) => e.type + e.date), ['start2026-10-01', 'end2026-10-20', 'deadline2026-10-25', 'start2026-11-02', 'deadline2026-12-20']);
  assert.equal(ev.find((e) => e.projectId === 'b' && e.type === 'deadline').done, true);
  assert.deepEqual(L.projectSpan({ startedAt: '2026-11-02', status: 'en_cours' }, '2026-11-05'), ['2026-11-02', '2026-11-05']);
});

test('liens : seulement http(s), jamais javascript:', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('  JaVaScRiPt:alert(1)'), '');
  assert.equal(safeHttpUrl('data:text/html,<script>1</script>'), '');
  assert.equal(safeHttpUrl('vbscript:x'), '');
  assert.equal(safeHttpUrl('pas un lien'), '');
  assert.equal(safeHttpUrl('https://example.com/fil?a=1'), 'https://example.com/fil?a=1');
});

test('adresse du serveur : https obligatoire (http seulement en local)', () => {
  assert.equal(safeServerUrl('https://abc.supabase.co/'), 'https://abc.supabase.co');
  assert.equal(safeServerUrl('http://abc.supabase.co'), '');
  assert.equal(safeServerUrl('http://localhost:54321'), 'http://localhost:54321');
  assert.equal(safeServerUrl('javascript:alert(1)'), '');
  assert.equal(safeServerUrl(''), '');
});

test('fichiers reçus : seuls PDF et images gardent leur type', () => {
  assert.equal(safeBlobType('application/pdf'), 'application/pdf');
  assert.equal(safeBlobType('image/jpeg'), 'image/jpeg');
  assert.equal(safeBlobType('IMAGE/PNG; charset=x'), 'image/png');
  assert.equal(safeBlobType('text/html'), 'application/octet-stream');
  assert.equal(safeBlobType('image/svg+xml'), 'application/octet-stream');
  assert.equal(safeBlobType(''), 'application/octet-stream');
});

test('mise à jour : ne retire que le service et les caches de mes-fils (adresse partagée avec d’autres applis)', async () => {
  const retires = [];
  const scope = 'https://exemple.github.io/mes-fils/';
  const reg = (s) => ({ scope: s, unregister: async () => retires.push(s) });
  const regs = [reg('https://exemple.github.io/nikki-app/'), reg(scope), reg('https://exemple.github.io/')];
  const supprimes = [];
  const cacheStorage = {
    keys: async () => ['mes-fils-v15', 'programme-12s-v4', 'mes-fils-v16', 'workbox-precache-v2-https://exemple.github.io/nikki-app/'],
    delete: async (k) => supprimes.push(k),
  };
  await resetAppShell({ serviceWorker: { getRegistrations: async () => regs }, cacheStorage, scope });
  assert.deepEqual(retires, [scope]);
  assert.deepEqual(supprimes, ['mes-fils-v15', 'mes-fils-v16']);
});

test('mise à jour : fonctionne sans service ni cache (navigateur qui les bloque)', async () => {
  await resetAppShell({ scope: 'https://exemple.github.io/mes-fils/' });
});

test('pelote entamée : s\'ajoute aux pelotes entières', () => {
  const y = { skeins: 1, gramsPerSkein: 50, metersPerSkein: 121, openedGrams: 18, usedGrams: 0 };
  assert.equal(remainingGrams(y), 68);
  assert.equal(remainingGrams({ ...y, usedGrams: 20 }), 48);
  assert.equal(skeinsText(y), '1 pelote + 1 entamée');
  assert.equal(skeinsText({ ...y, skeins: 3 }), '3 pelotes + 1 entamée');
  assert.equal(skeinsText({ ...y, skeins: 0 }), '1 entamée');
  assert.equal(skeinsText({ skeins: 2, gramsPerSkein: 50 }), '2 pelotes');
  assert.equal(remainingGrams({ ...y, weighedGrams: 60 }), 60);
});

test('épaisseur devinée d\'après le nom du fil', () => {
  assert.equal(guessWeightCategory('Phil Coton 3'), 'Sport');
  assert.equal(guessWeightCategory('Phildar Coton 3'), 'Sport');
  assert.equal(guessWeightCategory('Scheepjes Catona'), 'Fingering');
  assert.equal(guessWeightCategory('Ricorumi DK'), 'DK');
  assert.equal(guessWeightCategory('Phil Coton 5'), '');
  assert.equal(guessWeightCategory(''), '');
  assert.deepEqual(WEIGHT_GUIDE.map((r) => r[0]), WEIGHTS);
});

test('fils connus : Phil Coton 4, Phil Irlandais', () => {
  assert.equal(guessWeightCategory('Phil Coton 4'), 'DK');
  assert.deepEqual(knownYarn('Phildar Coton 4'), { weightCategory: 'DK', material: 'Coton', brand: 'Phildar', gramsPerSkein: 50, metersPerSkein: 85 });
  assert.equal(guessWeightCategory('Phil Coton 4,5'), '');
  assert.equal(guessWeightCategory('Phil Coton 4.5'), '');
  const irl = knownYarn('Phil Irlandais');
  assert.equal(irl.weightCategory, 'Aran');
  assert.equal(irl.metersPerSkein, 100);
  assert.equal(knownYarn('fil inconnu'), null);
});
