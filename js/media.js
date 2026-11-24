// Photos (réduction avant stockage) et PDF (extraction du texte, rendu des pages).

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    });
  }
  return pdfjsPromise;
}

/** Réduit une photo à 1400 px max et la convertit en JPEG pour économiser la place. */
export async function shrinkImage(file, max = 1400, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close && bitmap.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Extrait le texte d'un PDF, page après page. Renvoie aussi le nombre de pages. */
export async function extractPdfText(blob) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY = null;
    const lines = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(line);
        line = '';
      }
      line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
      lastY = y;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
        lastY = null;
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
    if (i >= 30) break; // le matériel est toujours dans les premières pages
  }
  const text = pages.join('\n');
  return { text, pageCount: doc.numPages, hasText: text.replace(/\s/g, '').length > 40 };
}

/** Dessine les pages d'un PDF dans un conteneur, à la largeur disponible. */
export async function renderPdf(blob, container, { onProgress, perPage = false, width: forcedWidth = 0 } = {}) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const width = Math.max(280, forcedWidth || container.clientWidth || 360);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  container.innerHTML = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    if (perPage) {
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
    } else {
      canvas.style.width = width + 'px';
      canvas.style.height = Math.floor(vp.height / dpr) + 'px';
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Page ${i} sur ${doc.numPages}`);
    if (perPage) {
      const wrap = document.createElement('div');
      wrap.className = 'rpage';
      wrap.appendChild(canvas);
      container.appendChild(wrap);
    } else container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    if (onProgress) onProgress(i, doc.numPages);
  }
  return doc.numPages;
}


let tesseractPromise = null;

function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = new URL('../vendor/tesseract/tesseract.min.js', import.meta.url).href;
      el.onload = () => resolve(window.Tesseract);
      el.onerror = () => {
        tesseractPromise = null;
        reject(new Error('ocr-load'));
      };
      document.head.appendChild(el);
    });
  }
  return tesseractPromise;
}

/**
 * Captures d'écran de réseaux sociaux (mode sombre) : la page de patron est la bande claire au milieu,
 * entourée d'une barre sombre en haut (compte, « Suivi(e) ») et en bas (likes, commentaires). On ne lit que cette bande.
 * Sans bandes sombres nettes, l'image est utilisée en entier.
 */
function findPageBand(bm) {
  const W = bm.width, H = bm.height;
  if (H / W < 1.6) return null;
  const sw = 120, sh = Math.round((H / W) * 120);
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bm, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data;
  const bright = [];
  for (let y = 0; y < sh; y++) {
    let sum = 0;
    for (let i = 0; i < sw; i++) {
      const k = (y * sw + i) * 4;
      sum += 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
    }
    bright.push(sum / sw > 75);
  }
  // plus longue série de lignes claires
  let best = [0, 0], start = -1;
  for (let y = 0; y <= sh; y++) {
    if (y < sh && bright[y]) { if (start < 0) start = y; }
    else if (start >= 0) { if (y - start > best[1] - best[0]) best = [start, y]; start = -1; }
  }
  const frac = (best[1] - best[0]) / sh;
  // il faut une vraie barre sombre en haut ET en bas, sinon ce n'est pas une capture de ce type
  if (frac < 0.3 || frac > 0.85 || best[0] < sh * 0.06 || sh - best[1] < sh * 0.06) return null;
  return [Math.round((best[0] / sh) * H), Math.round((best[1] / sh) * H)];
}

async function cropToPage(blob) {
  try {
    const bm = await createImageBitmap(blob);
    const band = findPageBand(bm);
    if (!band) { bm.close?.(); return blob; }
    const [y0, y1] = band;
    const out = document.createElement('canvas');
    out.width = bm.width; out.height = y1 - y0;
    out.getContext('2d').drawImage(bm, 0, y0, bm.width, y1 - y0, 0, 0, bm.width, y1 - y0);
    bm.close?.();
    return out;
  } catch (e) {
    return blob;
  }
}

/** À l'import : retire les barres sombres d'une capture de réseau social, pour que chaque page du livret soit la page du patron. */
export async function trimScreenshot(file) {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const band = findPageBand(bm);
    if (!band) { bm.close?.(); return file; }
    const [y0, y1] = band;
    const out = document.createElement('canvas');
    out.width = bm.width; out.height = y1 - y0;
    out.getContext('2d').drawImage(bm, 0, y0, bm.width, y1 - y0, 0, 0, bm.width, y1 - y0);
    bm.close?.();
    const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.92));
    return blob || file;
  } catch (e) {
    return file;
  }
}

/**
 * Page en deux colonnes (ex. « Matériel » à gauche, « Abréviations » à droite) : l'OCR lirait les lignes
 * en travers. On cherche une bande verticale vide près du milieu et on lit chaque colonne séparément.
 */
async function splitColumns(src) {
  try {
    const bm = await createImageBitmap(src);
    const W = bm.width, H = bm.height;
    const sw = Math.min(W, 540), sh = Math.round((H / W) * sw);
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bm, 0, 0, sw, sh);
    const d = x.getImageData(0, 0, sw, sh).data;
    const lum = new Float32Array(sw * sh);
    const all = [];
    for (let i = 0; i < sw * sh; i++) {
      lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      if (i % 7 === 0) all.push(lum[i]);
    }
    all.sort((a, b) => a - b);
    const bg = all[Math.floor(all.length / 2)];
    const ink = new Int32Array(sw);
    for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) if (lum[yy * sw + xx] < bg - 45) ink[xx]++;
    const total = ink.reduce((a, b) => a + b, 0);
    if (total < 200) { bm.close?.(); return [src]; }
    const limit = sh * 0.02;
    let best = null, st = -1;
    const lo = Math.floor(sw * 0.3), hi = Math.ceil(sw * 0.7);
    for (let xx = lo; xx <= hi; xx++) {
      const empty = xx < hi && ink[xx] <= limit;
      if (empty) { if (st < 0) st = xx; }
      else if (st >= 0) { if (!best || xx - st > best[1] - best[0]) best = [st, xx]; st = -1; }
    }
    if (!best || best[1] - best[0] < sw * 0.025) { bm.close?.(); return [src]; }
    const cut = Math.round(((best[0] + best[1]) / 2 / sw) * W);
    const side = (a, b) => {
      let s = 0; for (let xx = a; xx < b; xx++) s += ink[Math.min(sw - 1, xx)];
      return s;
    };
    const left = side(0, best[0]), right = side(best[1], sw);
    // chaque colonne doit contenir une vraie part du texte
    if (left < total * 0.2 || right < total * 0.2) { bm.close?.(); return [src]; }
    const part = (sx, w) => {
      const o = document.createElement('canvas');
      o.width = w; o.height = H;
      o.getContext('2d').drawImage(bm, sx, 0, w, H, 0, 0, w, H);
      return o;
    };
    const out = [part(0, cut), part(cut, W - cut)];
    bm.close?.();
    return out;
  } catch (e) {
    return [src];
  }
}

/** Lit le texte de photos (français + anglais), sur l'appareil, sans réseau. Renvoie le texte de toutes les photos. */
export async function ocrImages(blobs, { onProgress } = {}) {
  const T = await loadTesseract();
  const base = new URL('../vendor/tesseract/', import.meta.url).href;
  const worker = await T.createWorker(['fra', 'eng'], 1, {
    workerPath: base + 'worker.min.js',
    corePath: base + 'core',
    langPath: base + 'lang',
    gzip: true,
    workerBlobURL: false,
  });
  try {
    const out = [];
    for (let i = 0; i < blobs.length; i++) {
      if (onProgress) onProgress(i + 1, blobs.length);
      for (const part of await splitColumns(await cropToPage(blobs[i]))) {
        const { data } = await worker.recognize(part);
        out.push(data.text || '');
      }
    }
    return out.join('\n');
  } finally {
    await worker.terminate();
  }
}
