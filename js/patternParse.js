// Lecture du matériel dans le texte d'un patron (français ou anglais).
// Heuristique : le résultat est toujours relu et corrigé par l'utilisatrice avant d'être enregistré.

import { WEIGHTS } from './logic.js';

const SECTION_START = /^(mat[ée]riel|mat[ée]riaux|fournitures|ce qu'il vous faut|vous aurez besoin|materials?|supplies|you will need|what you need|yarn)\b/i;
const SECTION_END = /^(abr[ée]viations?|abbreviations?|explications?|instructions?|consignes?|[ée]chantillon|gauge|tension|dimensions?|taille|finished size|notes?|patron|pattern|montage|tête|head|body|corps|rang|rnd|round|row|étape|step|partie|part)\b/i;

const WEIGHT_WORDS = [
  [/\b(dentelle|lace)\b/i, 'Dentelle'],
  [/\b(fingering|sock|chaussette)\b/i, 'Fingering'],
  [/\b(sport|baby)\b/i, 'Sport'],
  [/\b(super\s*bulky|super\s*chunky|jumbo|super\s*volumineux)\b/i, 'Super bulky'],
  [/\b(bulky|chunky|volumineux)\b/i, 'Bulky'],
  [/\b(aran)\b/i, 'Aran'],
  [/\b(worsted|medium)\b/i, 'Worsted'],
  [/\b(dk|double knit|light worsted)\b/i, 'DK'],
];

const ACCESSORY_WORDS = /(yeux|eyes|rembourrage|bourre|polyfill|fiberfill|fibre de|marqueurs?|stitch markers?|aiguille [àa] laine|tapestry needle|needle|ciseaux|scissors|boutons?|buttons?|fermeture|zip|feutre|feutrine|felt|ruban|ribbon|perles?|beads?|fil [àa] broder|embroidery|colle|glue|mousse|foam)/i;

const ALWAYS_ACCESSORY = /(rembourrage|polyfill|fiberfill|stuffing|aiguille [àa] laine|tapestry needle|yeux de s[ée]curit|safety eyes)/i;

const HOOK_AFTER = /(?:crochet|hook|aiguille)[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*mm/i;
const HOOK_BEFORE = /(\d+(?:[.,]\d+)?)\s*mm\s*(?:\(|\[)?[^\n]{0,12}(?:crochet|hook)/i;

function num(s) {
  return parseFloat(String(s).replace(',', '.'));
}

export function detectWeight(line) {
  for (const [re, name] of WEIGHT_WORDS) if (re.test(line)) return name;
  return '';
}

export function parseQuantities(rawLine) {
  // « 1 000 yds » : on retire l'espace des milliers avant de lire les nombres
  const line = String(rawLine).replace(/(\d)[ \u00a0\u202f](\d{3})(?!\d)/g, '$1$2');
  const out = {};
  let m = line.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|grammes?|grams?|gm)\b/i);
  if (m) out.grams = num(m[1]);
  m = line.match(/(\d+(?:[.,]\d+)?)\s*(?:m|mètres?|metres?|meters?|metre)\b(?!\s*m)/i);
  if (m) out.meters = num(m[1]);
  m = line.match(/(\d+(?:[.,]\d+)?)\s*(?:yards?|yds?)\b/i);
  if (m && !out.meters) out.meters = Math.round(num(m[1]) * 0.9144);
  m = line.match(/(\d+)\s*(?:pelotes?|skeins?|balls?|boules?)\b/i);
  if (m) out.skeins = parseInt(m[1], 10);
  // « 3 pelotes (100 g / 100 m chacune) » : poids et métrage décrivent une pelote, pas le besoin total
  if (out.skeins) {
    const per = line.match(/(\d+(?:[.,]\d+)?)\s*g\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(m|yards?|yds?)\b/i);
    if (per) {
      out.skeinGrams = num(per[1]);
      out.skeinMeters = /^m$/i.test(per[3]) ? num(per[2]) : Math.round(num(per[2]) * 0.9144);
      if (out.grams === out.skeinGrams) delete out.grams;
      if (out.meters === out.skeinMeters) delete out.meters;
    }
  }
  if (out.meters === 0) delete out.meters;
  return out;
}

function cleanLabel(line) {
  return line.replace(/^[\s•·\-–—*▪●○■□]+/, '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

/**
 * @param {string} text texte brut du patron (pages séparées par des sauts de ligne)
 * @returns {{materials: Array, title: string, found: boolean}}
 */
export function parsePattern(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const title = guessTitle(lines);
  let startIdx = lines.findIndex((l) => SECTION_START.test(l) && l.length < 80);
  let region;
  let found = true;
  if (startIdx === -1) {
    found = false;
    region = lines.slice(0, 120);
  } else {
    region = [];
    for (let i = startIdx; i < Math.min(lines.length, startIdx + 40); i++) {
      if (i > startIdx && SECTION_END.test(lines[i]) && lines[i].length < 40) break;
      region.push(lines[i]);
    }
  }
  const materials = [];
  for (const raw of region) {
    const line = cleanLabel(raw);
    if (line.length < 3) continue;
    if (SECTION_START.test(line) && line.length < 25) continue;
    const hook = line.match(HOOK_AFTER) || line.match(HOOK_BEFORE);
    if (hook) {
      materials.push({ kind: 'hook', label: line, size: num(hook[1]) });
      continue;
    }
    const q = parseQuantities(line);
    const hasQuantity = !!(q.grams || q.meters || q.skeins);
    if (ALWAYS_ACCESSORY.test(line) || (ACCESSORY_WORDS.test(line) && !hasQuantity)) {
      materials.push({ kind: 'accessory', label: line });
      continue;
    }
    const weight = detectWeight(line);
    const looksLikeYarn = /(fil|yarn|laine|wool|coton|cotton|acrylique|acrylic|pelote|skein|mohair|bambou|lin)\b/i.test(line);
    if (looksLikeYarn || q.grams || q.meters || q.skeins) {
      if (!looksLikeYarn && !weight && !q.grams && !q.skeins) continue;
      const cut = line.match(/^(.{3,}?)\s*[:–]\s*(?:environ|about|approx\.?|env\.?|~)?\s*\d/i);
      materials.push({ kind: 'yarn', label: cut ? cut[1].trim() : line, weightCategory: weight, ...q });
    }
  }
  return { materials: dedupe(materials), title, found };
}

function guessTitle(lines) {
  for (const l of lines.slice(0, 8)) {
    if (l.length >= 4 && l.length <= 70 && !/^(page|www|http|©|copyright)/i.test(l) && !SECTION_START.test(l)) return l;
  }
  return '';
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((m) => {
    const key = m.kind + '|' + m.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function emptyYarnSlot() {
  return { kind: 'yarn', label: '', weightCategory: '', grams: null, skeins: null, meters: null, skeinGrams: null, skeinMeters: null };
}

export const WEIGHT_LIST = WEIGHTS;
