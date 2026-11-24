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
export async function renderPdf(blob, container, { onProgress } = {}) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const width = Math.max(280, container.clientWidth || 360);
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
    canvas.style.width = width + 'px';
    canvas.style.height = Math.floor(vp.height / dpr) + 'px';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Page ${i} sur ${doc.numPages}`);
    container.appendChild(canvas);
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
      const { data } = await worker.recognize(blobs[i]);
      out.push(data.text || '');
    }
    return out.join('\n');
  } finally {
    await worker.terminate();
  }
}
