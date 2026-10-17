// On-device OCR for card photos (tesseract.js, WebAssembly). The engine and language data are served from
// /ocr on this site (scripts/copy-ocr.mjs). One worker is reused and jobs run one at a time, so a batch of
// 10 cards is read in the background while the user keeps shooting. Image prep and number patterns follow
// Card Pool's src/lib/ocr.ts and shared/rules/ocr.ts.
'use client';
import type { Worker } from 'tesseract.js';

export type OcrLangs = 'eng' | 'eng+chi_tra' | 'eng+jpn';
export interface OcrResult { text: string; confidence: number; lines: string[]; numbers: string[] }

const MAX_SIDE = 1800;

/** Greyscale + contrast stretch: small, sharp, black-on-white text reads best. */
async function prepare(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = y;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = ((d[i] - lo) * 255) / span; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  return c;
}

let cached: { langs: OcrLangs; worker: Promise<Worker> } | null = null;
function worker(langs: OcrLangs) {
  if (cached?.langs === langs) return cached.worker;
  cached?.worker.then((w) => w.terminate()).catch(() => undefined);
  const w = import('tesseract.js').then(({ createWorker }) => createWorker(langs.split('+'), 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr/lang',
  }));
  cached = { langs, worker: w };
  w.catch(() => { if (cached?.worker === w) cached = null; });
  return w;
}

// One job at a time on the shared worker.
let queue: Promise<unknown> = Promise.resolve();

/** Read the text on one photo. The first call loads the engine (a few MB, then cached by the browser). */
export function readText(blob: Blob, langs: OcrLangs): Promise<OcrResult> {
  const job = queue.then(async () => {
    const canvas = await prepare(blob);
    const { data } = await (await worker(langs)).recognize(canvas);
    const text = (data.text ?? '').trim();
    return { text, confidence: Math.round(data.confidence ?? 0), ...hints(text) };
  });
  queue = job.catch(() => undefined);
  return job;
}

const NUMBER_PATTERNS = [
  /\b[A-Z]{2,5}\d{0,2}-(?:EN|JP|JA|KR|TC|SC|DE|FR|IT|SP|PT)?\d{3}\b/g, // Yu-Gi-Oh LOB-EN001, One Piece OP01-001
  /\b\d{1,3}\s*\/\s*\d{1,3}\b/g, // Pokémon 025/165
  /#\s?\d{1,4}\b/g, // sports cards #123
];
const NOISE = /^(hp|lv|ex|gx|v|vmax|vstar|atk|def|lvl|level|basic|stage\s?\d|trainer|energy|weakness|resistance|retreat|illus.*|©.*|\d+)$/i;

/** Card numbers and plausible text lines (the chips the user picks from). */
export function hints(text: string) {
  const numbers = [...new Set(NUMBER_PATTERNS.flatMap((re) => text.match(re) ?? []).map((n) => n.replace(/\s+/g, '')))];
  const lines = [...new Set(text.split('\n')
    .map((l) => l.replace(/[|_~`^*<>{}[\]=]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => {
      const letters = (l.match(/\p{L}/gu) ?? []).length;
      return letters >= 2 && letters / l.length >= 0.4 && !NOISE.test(l);
    }))].slice(0, 14);
  return { lines, numbers };
}

/** Language guess from the recognised text, for the record's language field. */
export const scriptLanguage = (text: string) =>
  /[぀-ヿ]/.test(text) ? 'ja' : /[가-힯]/.test(text) ? 'ko' : /[一-鿿]/.test(text) ? 'zh' : 'en';
