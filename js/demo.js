// Données d'exemple (celles des maquettes) pour essayer l'appli. Chargées uniquement à la demande, dans les réglages.

import * as store from './store.js';

export async function loadDemo() {
  const box = await store.put('boxes', { name: 'Boîte bleue' });
  const base = { usedGrams: 0, weighedGrams: null, inStock: true };
  const phil = await store.put('yarns', { ...base, name: 'Phil Coton 4', colorName: 'Taupe', colorKey: 'beige', weightCategory: 'Worsted', material: 'Coton', skeins: 20, gramsPerSkein: 50, metersPerSkein: 85, usedGrams: 233, price: 3.99, purchasedAt: '2022-12-11', boxId: box.id });
  const rose = await store.put('yarns', { ...base, name: 'Hue +Me', colorName: 'Rose Water', colorKey: 'rose', weightCategory: 'Bulky', material: 'Coton', skeins: 5, gramsPerSkein: 125, metersPerSkein: 100, price: 9.5 });
  const mohair = await store.put('yarns', { ...base, name: 'Mohair', colorName: 'Eglantine', colorKey: 'rose', weightCategory: 'Fingering', material: 'Mohair', skeins: 8, gramsPerSkein: 25, metersPerSkein: 200, price: 4.2 });
  await store.put('yarns', { ...base, name: 'Hue +Me', colorName: 'Salt', colorKey: 'blanc', weightCategory: 'Bulky', material: 'Coton', skeins: 2, gramsPerSkein: 125, metersPerSkein: 100, price: 9.5 });
  await store.put('yarns', { ...base, name: 'Hue +Me', colorName: 'Moutarde', colorKey: 'jaune', weightCategory: 'Bulky', material: 'Coton', skeins: 1, gramsPerSkein: 125, metersPerSkein: 100, price: 9.5 });
  const white = await store.put('yarns', { ...base, name: 'Honey Bunny Shine', colorName: 'White (01)', colorKey: 'blanc', weightCategory: 'Worsted', material: 'Acrylique', skeins: 2, gramsPerSkein: 100, metersPerSkein: 120, price: 5.5 });
  const beige = await store.put('yarns', { ...base, name: 'Honey Bunny Shine', colorName: 'Beige (05)', colorKey: 'beige', weightCategory: 'Worsted', material: 'Acrylique', skeins: 1, gramsPerSkein: 100, metersPerSkein: 120, price: 5.5 });
  const tomato = await store.put('yarns', { ...base, name: 'Honey Bunny Shine', colorName: 'Tomato (40)', colorKey: 'rouge', weightCategory: 'Worsted', material: 'Acrylique', skeins: 2, gramsPerSkein: 100, metersPerSkein: 120, price: 5.5 });

  const mushroom = await store.put('patterns', {
    title: 'Mushroom Guy',
    fileType: '',
    materials: [
      { id: 'm1', kind: 'yarn', label: 'Fil blanc', weightCategory: 'Worsted', grams: 170 },
      { id: 'm2', kind: 'yarn', label: 'Fil beige', weightCategory: 'Worsted', grams: 70 },
      { id: 'm3', kind: 'yarn', label: 'Fil rouge', weightCategory: 'Worsted', grams: 130 },
      { id: 'm4', kind: 'hook', label: 'Crochet 2,5 mm', size: 2.5 },
      { id: 'm5', kind: 'accessory', label: 'Yeux de sécurité 10 mm' },
    ],
  });
  await store.put('patterns', {
    title: 'Plaid au crochet (exemple)',
    fileType: '',
    materials: [
      { id: 'p1', kind: 'yarn', label: 'Coton worsted', weightCategory: 'Worsted', grams: 600 },
      { id: 'p2', kind: 'yarn', label: 'Fil bulky', weightCategory: 'Bulky', grams: 300 },
      { id: 'p3', kind: 'yarn', label: 'Mohair fin', weightCategory: 'Fingering', grams: 250 },
      { id: 'p4', kind: 'hook', label: 'Crochet 5 mm', size: 5 },
    ],
  });
  await store.put('projects', {
    name: 'Mushroom Guy',
    status: 'en_cours',
    patternId: mushroom.id,
    keepReservedOnPause: true,
    photos: [],
    slots: [
      { id: 's1', kind: 'yarn', label: 'Fil blanc', weightCategory: 'Worsted', grams: 170, allocations: [{ yarnId: white.id, grams: 187 }] },
      { id: 's2', kind: 'yarn', label: 'Fil beige', weightCategory: 'Worsted', grams: 70, allocations: [{ yarnId: beige.id, grams: 77 }] },
      { id: 's3', kind: 'yarn', label: 'Fil rouge', weightCategory: 'Worsted', grams: 130, allocations: [{ yarnId: tomato.id, grams: 143 }] },
    ],
  });
  return { phil, rose, mohair };
}
