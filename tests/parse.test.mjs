import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVariant, parsePattern, parseQuantities, detectWeight, guessColorKey } from '../js/patternParse.js';

const FR = `Mushroom Guy
Amigurumi au crochet
Matériel
- Fil coton worsted blanc : environ 170 g
- Fil coton beige : 70 g
- Fil rouge Honey Bunny : 130 g
- Crochet 2,5 mm
- Yeux de sécurité 10 mm
- Rembourrage polyfill
- Aiguille à laine
Abréviations
mc = magic ring`;

const EN = `Plaid blanket
Materials:
Yarn A: 600 g worsted weight cotton yarn (about 1000 yds)
Yarn B: 3 skeins bulky yarn (100 g / 100 m each)
5.0 mm hook
Tapestry needle
Gauge
10 sts = 4 in`;

test('patron en français', () => {
  const r = parsePattern(FR);
  assert.equal(r.found, true);
  assert.equal(r.title, 'Mushroom Guy');
  const yarns = r.materials.filter((m) => m.kind === 'yarn');
  assert.equal(yarns.length, 3);
  assert.equal(yarns[0].grams, 170);
  assert.equal(yarns[0].label, 'Fil coton worsted blanc');
  assert.equal(yarns[0].weightCategory, 'Worsted');
  assert.equal(yarns[2].grams, 130);
  const hook = r.materials.find((m) => m.kind === 'hook');
  assert.equal(hook.size, 2.5);
  // l'aiguille à laine est un outil : on ne la suit pas dans le matériel
  assert.equal(r.materials.filter((m) => m.kind === 'accessory').length, 2);
});

test('patron en anglais avec yards et pelotes', () => {
  const r = parsePattern(EN);
  const yarns = r.materials.filter((m) => m.kind === 'yarn');
  assert.equal(yarns.length, 2);
  assert.equal(yarns[0].grams, 600);
  assert.equal(yarns[1].skeins, 3);
  assert.equal(yarns[1].skeinGrams, 100);
  assert.equal(yarns[1].skeinMeters, 100);
  assert.equal(yarns[1].weightCategory, 'Bulky');
  assert.equal(r.materials.find((m) => m.kind === 'hook').size, 5);
});

test('quantités isolées', () => {
  assert.deepEqual(parseQuantities('250 g'), { grams: 250 });
  assert.equal(parseQuantities('1 000 yds').meters, 914);
  assert.equal(parseQuantities('340 m').meters, 340);
  assert.equal(detectWeight('fil super bulky'), 'Super bulky');
  assert.equal(detectWeight('texte sans épaisseur'), '');
});

test('texte vide ou sans section matériel', () => {
  assert.deepEqual(parsePattern('').materials, []);
  const r = parsePattern('Un joli patron\nRang 1 : 6 ms dans le cercle magique');
  assert.equal(r.found, false);
});


test('patron à plusieurs tailles : versions, crochet, yeux, titre, pas de phrases', () => {
  const text = [
    '1', '© 2024 Auteur. This pattern is copyrighted and is for personal use only. This',
    'pattern cannot be copied or sold.', 'reference the author.', 'Petit Champi',
    'Things to know', 'Items used:', ' Crochet hook 2.00mm', ' Cotton fingering (4 ply) yarn (up to 3 colours)',
    ' Stuffing', ' Black safety eyes (10mm)', ' Stitch markers/scrap yarn for stitch count', ' Pointy yarn needle',
    ' Scissors', ' Craft glue - Optional', 'Abbreviations:', 'sc : single crochet',
    'Chunky mushroom: 50cm (20 inches)', 'Big Yarn with 5mm hook', 'Eyes: 24mm', 'Colour A: 170g Colour B: 70g Colour C: 130g',
    'Pocket mushroom: 13cm (5 inches)', 'Tiny Yarn with 0.90mm hook', 'Eyes: 6mm', 'Colour A: 16g Colour B: 7g Colour C: 10g',
    'Tips and Tricks', ' You can use different weight yarn to make him larger or smaller, just be sure to use the',
    'Yarn and colours:', 'Natura 100% cotton yarn', '• Colour A (Body): 25 g', '• Colour B (Cap): 16 g',
    '• Colour D (cheeks): scrap - optional', '• 4 strands of black yarn or embroidery thread;', 'scrap (for mouth)',
    'Note: The colour section is set up this way to give you creative freedom.',
    'IMPORTANT: Do not use plastic eyes if intended for children under 3; this is a choking hazard.',
  ];
  const r = parsePattern(text.join('\n'));
  assert.equal(r.title, 'Petit Champi');
  assert.equal(r.variants.length, 3);
  assert.deepEqual(r.variants.map((v) => v.name), ['Chunky mushroom (50 cm)', 'Pocket mushroom (13 cm)', 'Fils indiqués dans le patron']);
  // la première version est appliquée : fils 170/70, crochet 5 mm, yeux 24 mm
  const yarns = r.materials.filter((m) => m.kind === 'yarn');
  assert.deepEqual(yarns.map((y) => y.grams), [170, 70, 130]);
  assert.equal(yarns[0].label, 'Colour A (Body)');
  assert.equal(r.materials.find((m) => m.kind === 'hook').size, 5);
  const acc = r.materials.filter((m) => m.kind === 'accessory').map((m) => m.label);
  assert.deepEqual(acc, ['Stuffing', 'Black safety eyes (24 mm)']);
  // version standard : épaisseur Fingering reprise de « Cotton fingering »
  const std = r.variants[2];
  assert.deepEqual(std.yarns.map((y) => [y.grams, y.weightCategory]), [[25, 'Fingering'], [16, 'Fingering']]);
  // changer de version
  const small = applyVariant(r.materials, r.variants[1]);
  assert.deepEqual(small.filter((m) => m.kind === 'yarn').map((y) => y.grams), [16, 7, 10]);
  assert.equal(small.find((m) => m.kind === 'hook').size, 0.9);
});

test('patron français sur captures : marques, coloris et crochets', () => {
  const text = `MATÉRIEL

Ricorumi (pour la base)
001 blanc

052 brun clair

Avec un crochet 3

Scheepjes Catona
(pour le personnage)
105 blanc (= B)

504 brique rouge (= R)
507 chocolat (= C)
Avec un crochet 2,5

Fil à broder noir ou marron
Anneau marqueur

Ouate de rembourrage
Ciseaux

Aiguille à laine

Système de fixation : bande
scratch, boutons à pression
ou aimants à coudre

(optionnel, seulement si vous

souhaitez pouvoir fixer et
interchanger les

personnages sur différentes

bases)

ABREVIATION SE

Ch : chaînette

ml: maille en lair`;
  const r = parsePattern(text);
  const yarns = r.materials.filter((m) => m.kind === 'yarn');
  assert.equal(yarns.length, 5);
  assert.equal(yarns[0].label, 'Ricorumi (pour la base)');
  assert.equal(yarns[0].colorName, '001 blanc');
  assert.equal(yarns[0].colorKey, 'blanc');
  assert.equal(yarns[1].colorName, '052 brun clair');
  assert.equal(yarns[1].colorKey, 'marron');
  assert.equal(yarns[2].label, 'Scheepjes Catona (pour le personnage)');
  assert.equal(yarns[2].colorName, '105 blanc (B)');
  assert.equal(yarns[3].colorKey, 'rouge');
  assert.equal(yarns[4].colorKey, 'marron');
  assert.deepEqual(r.materials.filter((m) => m.kind === 'hook').map((h) => h.size), [3, 2.5]);
  const acc = r.materials.filter((m) => m.kind === 'accessory').map((a) => a.label);
  assert.equal(acc.length, 2);
  assert.ok(acc.some((a) => /broder/i.test(a)) && acc.some((a) => /rembourrage/i.test(a)));
  assert.ok(!r.materials.some((m) => /chaînette|maille/i.test(m.label)));
});

test('famille de couleur devinée depuis le nom du coloris', () => {
  assert.equal(guessColorKey('Rose Water'), 'rose');
  assert.equal(guessColorKey('Taupe'), 'marron');
  assert.equal(guessColorKey('Zzz'), '');
});
