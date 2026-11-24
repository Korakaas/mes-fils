// Lecture du matériel dans le texte d'un patron (français ou anglais).
// Heuristique : le résultat est toujours relu et corrigé par l'utilisatrice avant d'être enregistré.

import { WEIGHTS } from './logic.js';

const SECTION_START = /^(mat[ée]riel|mat[ée]riaux|fournitures|ce qu'il vous faut|vous aurez besoin|materials?|supplies|you(?:'ll| will) need|what you need|items? (?:used|needed)|notions|yarn(?: and colou?rs?)?)\b/i;
const SECTION_END = /^(important|attention|astuce|tips?|level|niveau|abr[ée]viations?|abbreviations?|explications?|instructions?|consignes?|[ée]chantillon|gauge|tension|dimensions?|taille|finished size|notes?|patron|pattern|montage|tête|head|body|corps|rang|rnd|round|row|étape|step|partie|part)\b/i;

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

// Ce qui n'est pas du matériel à suivre en stock : outils, restes, éléments facultatifs
const SKIP_LINE = /\b(scraps?|chutes?|restes? de|strands? of|brins? de)\b|optional|facultatif|optionnel|(ciseaux|scissors|stitch markers?|marqueurs?|pins?|[ée]pingles?|aiguille [àa] laine|tapestry needle|yarn needle|pointy)/i;
const COLOUR_QTY = /(colou?r|couleur|coloris)\s*([A-Z])\s*[:\-]\s*(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|grammes?|grams?)\b/gi;

// Format français fréquent : une marque (« Scheepjes Catona »), puis une ligne par coloris (« 105 blanc (= B) »),
// puis « Avec un crochet 2,5 » (taille sans « mm »).
const COLOUR_CODE = /^(\d{2,4})\s+([\p{L}][\p{L}' -]{1,40}?)\s*(?:\(\s*=?\s*([A-Za-z])\s*\))?\s*$/u;
const HOOK_FR = /^(?:avec\s+)?(?:un\s+)?crochet\s*(?:n[°o]\s*)?(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*$/i;

// Listes à puces françaises : « une pelote de marron », « un peu de bleu et de noir »
const NB_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };
const SKEIN_LINE = /^(\d+|une?|deux|trois|quatre|cinq)\s+(?:pelotes?|boules?|skeins?)\s+(?:de\s+|d['’]\s*|en\s+)(.+)$/i;
const SCRAPS_LINE = /^(?:un\s+peu|un\s+reste|des\s+restes?|quelques\s+restes?|un\s+fond|une\s+chute|des\s+chutes?)\s+(?:de\s+|d['’]\s*|en\s+)(.+)$/i;
// Phrase d'introduction : « crocheté avec du coton Natura de chez DMC »
const YARN_HINT = /(?:crochet[ée]e?s?|r[ée]alis[ée]e?s?|faite?s?|tricot[ée]e?s?)\s+(?:avec|en)\s+(?:(?:du|de la|de l['’]|des|le|la|l['’])\s*)?(.+?)\s+(?:de chez|chez|de la marque)\s+(\p{Lu}[\p{L}&.'-]*(?:\s+\p{Lu}[\p{L}&.'-]*)?)/u;
const FIBRE_WORD = /^(coton|laine|acrylique|fil|polyester|lin|bambou|viscose|soie)$/i;
const BULLET = /^[●•▪■◦‣·*\-–—]\s/;

const HOOK_AFTER = /(?:crochet|hook|aiguille)[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*mm/i;
const HOOK_BEFORE = /(\d+(?:[.,]\d+)?)\s*mm\s*(?:\(|\[)?[^\n]{0,12}(?:crochet|hook)/i;

function num(s) {
  return parseFloat(String(s).replace(',', '.'));
}

const COLOUR_WORDS = [
  [/\b(multi|multicolor|multicolore|arc-en-ciel|rainbow)\b/i, 'multi'],
  [/\b(blanc|blanche|white|ecru|écru|cr[èe]me|cream|ivoire|ivory)\b/i, 'blanc'],
  [/\b(beige|sable|sand|lin|naturel|natural|nude|camel)\b/i, 'beige'],
  [/\b(jaune|yellow|moutarde|mustard|citron|lemon|miel|honey)\b/i, 'jaune'],
  [/\b(orange|abricot|apricot|corail|coral|p[êe]che|peach|mandarine)\b/i, 'orange'],
  [/\b(rouge|red|brique|bordeaux|burgundy|tomate|tomato|cerise|cherry)\b/i, 'rouge'],
  [/\b(rose|pink|fuchsia|framboise|raspberry|blush)\b/i, 'rose'],
  [/\b(violet|purple|mauve|lilas|lilac|lavande|lavender|prune|plum)\b/i, 'violet'],
  [/\b(bleu|blue|marine|navy|turquoise|ciel|denim|cobalt)\b/i, 'bleu'],
  [/\b(vert|green|menthe|mint|sauge|sage|olive|kaki|khaki|ivy|fir)\b/i, 'vert'],
  [/\b(marron|brun|brown|chocolat|chocolate|caf[ée]|coffee|taupe|caramel|noisette|chestnut|ch[âa]taigne|cannelle)\b/i, 'marron'],
  [/\b(gris|gray|grey|anthracite|argent|silver|souris)\b/i, 'gris'],
  [/\b(noir|black)\b/i, 'noir'],
];

/** Devine la famille de couleur (clé de L.COLORS) d'un nom de coloris ; '' si incertain. */
export function guessColorKey(text) {
  const t = String(text || '');
  for (const [re, key] of COLOUR_WORDS) if (re.test(t)) return key;
  return '';
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
  return line.replace(/^[^\p{L}\p{N}(]+/u, '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Une ligne de phrase (consigne, avertissement) n'est pas une ligne de matériel. */
function looksLikeProse(line, hasQuantity, bullet = false) {
  if (hasQuantity) return false;
  if (!bullet && /^[a-zà-ÿ]/.test(line)) return true; // suite d'une phrase coupée
  if (line.length > 75) return true;
  if (line.split(/\s+/).length >= 10) return true; // phrase d'introduction
  if (/\s(?:et|ou|de|du|des|la|le|un|une|avec|en)$/i.test(line)) return true; // phrase coupée en fin de ligne
  if (/[.;]$/.test(line) && line.split(/\s+/).length > 6) return true;
  return false;
}

function readRegion(lines, startIdx) {
  const idx = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 40); i++) {
    const l = lines[i];
    if (i > startIdx && SECTION_END.test(l) && (l.length < 40 || /^\S+\s*:/.test(l))) break;
    idx.push(i);
  }
  return idx;
}

function readMaterial(raw, bullet = false) {
  const line = cleanLabel(raw);
  if (line.length < 3) return null;
  if (SECTION_START.test(line) && line.length < 28) return null;
  if (SKIP_LINE.test(line)) return null;
  const q = parseQuantities(line);
  const hasQuantity = !!(q.grams || q.meters || q.skeins);
  if (looksLikeProse(line, hasQuantity, bullet)) return null;
  const hook = line.match(HOOK_AFTER) || line.match(HOOK_BEFORE);
  if (hook) return { kind: 'hook', label: line, size: num(hook[1]) };
  if (ALWAYS_ACCESSORY.test(line) || (ACCESSORY_WORDS.test(line) && !hasQuantity)) {
    const label = line.replace(/^(?:du|de la|des|de l['’]|un|une)\s+/i, '');
    return { kind: 'accessory', label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  const weight = detectWeight(line);
  const looksLikeYarn = /(fil|yarn|laine|wool|coton|cotton|acrylique|acrylic|pelote|skein|mohair|bambou|lin)\b/i.test(line);
  if (looksLikeYarn || hasQuantity) {
    if (!looksLikeYarn && !weight && !q.grams && !q.skeins) return null;
    const cut = line.match(/^(.{3,}?)\s*[:–]\s*(?:environ|about|approx\.?|env\.?|~)?\s*\d/i);
    return { kind: 'yarn', label: cut ? cut[1].trim() : line, weightCategory: weight, ...q };
  }
  return null;
}

/**
 * Versions de taille : « Colour A: 170g Colour B: 70g Colour C: 130g » sur une même ligne,
 * précédé du nom de la version, du fil et du crochet utilisés.
 */
function readVariants(lines, baseLabels) {
  const found = [];
  const colourLines = [];
  lines.forEach((l, i) => {
    const hits = [...l.matchAll(COLOUR_QTY)];
    if (hits.length >= 2) colourLines.push({ i, hits });
  });
  colourLines.forEach(({ i, hits }, n) => {
    const floor = n > 0 ? colourLines[n - 1].i : Math.max(0, i - 5);
    let name = '';
    let yarnName = '';
    let hook = null;
    let eyes = null;
    for (let j = i - 1; j > floor && j >= i - 5; j--) {
      const l = lines[j];
      const size = l.match(/^(.{3,50}?)\s*:\s*(\d+(?:[.,]\d+)?)\s*(cm|in|inch(?:es)?|po|mm)\b/i);
      const yarn = l.match(/^(.+?)\s+(?:with|avec)\s+(?:an?\s+)?(\d+(?:[.,]\d+)?)\s*mm\s*(?:hook|crochet)/i);
      const eye = l.match(/^(?:eyes|yeux)\s*:\s*(\d+(?:[.,]\d+)?)\s*mm/i);
      if (yarn && !yarnName) {
        yarnName = yarn[1].trim();
        hook = num(yarn[2]);
      } else if (eye && !eyes) eyes = num(eye[1]);
      else if (size && !name) name = `${size[1].trim()} (${size[2].replace(',', '.')} ${size[3]})`;
    }
    const yarns = hits.map((h) => {
      const letter = h[2].toUpperCase();
      return {
        kind: 'yarn',
        label: baseLabels[letter] || `Couleur ${letter}`,
        weightCategory: '',
        grams: num(h[3]),
      };
    });
    found.push({ at: i, name: name || `Version ${n + 1}`, sub: yarnName, hook, eyes, yarns });
  });
  return found;
}

/** « une pelote de marron », « un peu de bleu et de noir » → lignes de fil (une par coloris). */
function yarnFromList(line, hint) {
  const sk = line.match(SKEIN_LINE);
  const sc = !sk && line.match(SCRAPS_LINE);
  const m = sk || sc;
  if (!m) return null;
  const phrase = (sk ? sk[2] : sc[1])
    .replace(/\s*\(.*$/, '')
    .replace(/\s*[:–-]\s*\d.*$/, '')
    .replace(/[.;]+$/, '')
    .trim();
  const colours = phrase
    .split(/\s*(?:,|\bet\b)\s*(?:de\s+|d['’]\s*)?/i)
    .map((c) => c.trim())
    .filter(Boolean);
  if (!colours.length || colours.some((c) => c.split(/\s+/).length > 3 || /\d/.test(c))) return null;
  const q = sk ? parseQuantities(line) : {};
  if (sk) {
    const w = sk[1].toLowerCase();
    q.skeins = /^\d+$/.test(w) ? parseInt(w, 10) : NB_WORDS[w];
  }
  const label = hint ? hint.label : 'Fil';
  return colours.map((c) => ({
    kind: 'yarn',
    label,
    colorName: c,
    colorKey: guessColorKey(c),
    weightCategory: detectWeight(label),
    ...q,
    ...(sc ? { scraps: true } : {}),
  }));
}

/** Fil cité dans une phrase d'introduction : « coton Natura de chez DMC » → « DMC Natura (coton) ». */
function yarnHintFrom(line) {
  const m = line.match(YARN_HINT);
  if (!m) return null;
  const words = m[1].trim().split(/\s+/);
  const fibre = FIBRE_WORD.test(words[0]) ? words.shift() : '';
  const rest = words.join(' ');
  const label = `${m[2]} ${rest}`.trim() + (fibre && rest ? ` (${fibre})` : fibre ? ` ${fibre}` : '');
  return { label };
}

/** Lit les lignes d'une zone « matériel », en gardant la marque courante pour les lignes de coloris. */
function readRows(lines, idxs) {
  const out = [];
  let brand = '';
  let hint = null; // fil cité dans la phrase d'introduction
  let fresh = false; // la ligne précédente était la marque : une parenthèse à la suite la complète
  for (const i of idxs) {
    const l = cleanLabel(lines[i]);
    if (l.length < 2) continue;
    const bullet = BULLET.test(lines[i]);
    if (!bullet) hint = yarnHintFrom(l) || hint;
    const code = brand && l.match(COLOUR_CODE);
    if (code) {
      const letter = code[3] ? ` (${code[3].toUpperCase()})` : '';
      const colorName = `${code[1]} ${code[2].trim()}${letter}`;
      out.push({ kind: 'yarn', label: brand, colorName, colorKey: guessColorKey(code[2]), weightCategory: detectWeight(brand) });
      fresh = false;
      continue;
    }
    const hk = l.match(HOOK_FR);
    if (hk) {
      out.push({ kind: 'hook', label: `Crochet ${hk[1].replace('.', ',')} mm${brand ? ` (${brand.replace(/\s*\(.*$/, '')})` : ''}`, size: num(hk[1]) });
      fresh = false;
      continue;
    }
    const listed = yarnFromList(l, hint);
    if (listed) {
      out.push(...listed);
      fresh = false;
      continue;
    }
    if (fresh && /^\(/.test(l) && brand.length < 60) {
      brand += ' ' + l;
      continue;
    }
    const m = readMaterial(lines[i], bullet);
    if (m) {
      out.push(m);
      fresh = false;
    } else if (/^\p{Lu}/u.test(l) && l.length <= 45 && !/\d/.test(l) && !SECTION_START.test(l) && !SKIP_LINE.test(l)) {
      brand = l;
      fresh = true;
    } else fresh = false;
  }
  return out;
}

const fmtMm = (n) => String(n).replace('.', ',');

/** Applique une version au matériel : remplace les fils, ajuste crochet et yeux. */
export function applyVariant(materials, v) {
  const rest = materials
    .filter((m) => m.kind !== 'yarn')
    .map((m) => {
      if (m.kind === 'hook' && v.hook) {
        return { ...m, size: v.hook, label: /\d\s*mm/i.test(m.label) ? m.label.replace(/\d+(?:[.,]\d+)?\s*mm/i, `${fmtMm(v.hook)} mm`) : m.label };
      }
      if (m.kind === 'accessory' && v.eyes && /\b(eyes|yeux)\b/i.test(m.label)) {
        return { ...m, label: m.label.replace(/\d+(?:[.,]\d+)?\s*mm/i, `${fmtMm(v.eyes)} mm`) };
      }
      return m;
    });
  return [...v.yarns.map((y) => ({ ...y })), ...rest];
}

/**
 * @param {string} text texte brut du patron (pages séparées par des sauts de ligne)
 * @returns {{materials: Array, variants: Array, title: string, found: boolean}}
 */
export function parsePattern(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const title = guessTitle(lines);
  const starts = [];
  lines.forEach((l, i) => {
    if (SECTION_START.test(l) && l.length <= 45 && !/[.;]$/.test(l)) starts.push(i);
  });
  const found = starts.length > 0;
  const used = new Set();
  const regionLines = [];
  if (!found) {
    lines.slice(0, 120).forEach((l, i) => regionLines.push(i));
  } else {
    for (const s of starts) for (const i of readRegion(lines, s)) if (!used.has(i)) (used.add(i), regionLines.push(i));
  }
  let materials = readRows(lines, regionLines);
  // Taille du crochet donnée sur la couverture (« Taille du crochet : 2 ») si le matériel n'en cite aucun
  if (!materials.some((m) => m.kind === 'hook')) {
    const cover = lines.slice(0, 40).join('\n').match(/taille du crochet\s*:?\s*(\d+(?:[.,]\d+)?)/i);
    if (cover) materials.unshift({ kind: 'hook', label: `Crochet ${cover[1].replace('.', ',')} mm`, size: num(cover[1]) });
  }

  // Lignes de fil sans quantité (« Cotton fingering yarn ») : simple description, on garde l'épaisseur
  const hasQty = (y) => y.grams || y.meters || y.skeins || y.scraps;
  const yarns = materials.filter((m) => m.kind === 'yarn');
  const sized = yarns.filter(hasQty);
  let baseName = '';
  if (sized.length && yarns.length > sized.length) {
    const generic = yarns.filter((y) => !hasQty(y));
    const w = generic.map((g) => g.weightCategory).find(Boolean);
    if (w) sized.forEach((y) => { if (!y.weightCategory) y.weightCategory = w; });
    baseName = generic[generic.length - 1].label;
    materials = materials.filter((m) => m.kind !== 'yarn' || hasQty(m));
  }
  materials = dedupe(materials);

  // Plusieurs tailles dans le patron : une version par taille, plus celle de la section « fils »
  const baseLabels = {};
  for (const y of materials) {
    const m = y.kind === 'yarn' && y.label.match(/^(?:colou?r|couleur|coloris)\s*([A-Z])\b/i);
    if (m) baseLabels[m[1].toUpperCase()] = y.label;
  }
  const variants = readVariants(lines, baseLabels);
  const baseYarns = materials.filter((m) => m.kind === 'yarn');
  if (variants.length && baseYarns.length) {
    const at = lines.findIndex((l) => baseYarns[0].label && l.includes(baseYarns[0].label));
    variants.push({ at: at < 0 ? 1e9 : at, name: 'Fils indiqués dans le patron', sub: baseName, hook: null, eyes: null, yarns: baseYarns });
  }
  variants.sort((a, b) => a.at - b.at);
  const out = variants.map(({ at, ...v }) => v);
  if (out.length) materials = applyVariant(materials, out[0]);
  return { materials, variants: out.length > 1 || (out.length === 1 && !baseYarns.length) ? out : [], title, found };
}

function guessTitle(lines) {
  for (const l of lines.slice(0, 25)) {
    if (l.length < 4 || l.length > 60) continue;
    if (/^\d+$/.test(l)) continue;
    if (/^(page|www|http|©|copyright)/i.test(l)) continue;
    if (/copyright|all rights|©|\bpattern\b/i.test(l)) continue;
    if (/^[a-zà-ÿ]/.test(l) || /[.;,]$/.test(l)) continue;
    if (SECTION_START.test(l)) continue;
    return l;
  }
  return '';
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((m) => {
    const key = m.kind + '|' + m.label.toLowerCase() + '|' + String(m.colorName || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function emptyYarnSlot() {
  return { kind: 'yarn', label: '', weightCategory: '', grams: null, skeins: null, meters: null, skeinGrams: null, skeinMeters: null };
}

export const WEIGHT_LIST = WEIGHTS;
