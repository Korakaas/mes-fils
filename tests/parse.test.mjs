import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern, parseQuantities, detectWeight } from '../js/patternParse.js';

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
  assert.equal(r.materials.filter((m) => m.kind === 'accessory').length, 3);
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
