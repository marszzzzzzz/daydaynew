// On-device OCR for card photos (tesseract.js, WebAssembly). The engine and language data are served from
// /ocr on this site (scripts/copy-ocr.mjs). Workers are reused and jobs run one at a time, so a batch of
// 10 cards is read in the background while the user keeps shooting. Image prep and number patterns follow
// Card Pool's src/lib/ocr.ts and shared/rules/ocr.ts.
'use client';
import type { Worker } from 'tesseract.js';
import type { CardLanguage } from './types';

/** 'auto' tries one language model at a time until the text it reads is confident and in that model's script. */
export type OcrLangs = 'auto' | 'en' | 'zh' | 'ja' | 'ko';
export const OCR_LANGS: OcrLangs[] = ['auto', 'en', 'zh', 'ja', 'ko'];
export interface OcrResult { text: string; confidence: number; lines: string[]; numbers: string[]; language: CardLanguage; layout: OcrLine[] }
/** One recognised line and where it sits: `y` is its middle and `h` its height, both as a share of the photo's height. */
export interface OcrLine { text: string; y: number; h: number }

// Tesseract reads best at a text height of ~30px: small photos are scaled up, large ones down.
const FULL_SIDE = 2200;
// Tesseract leans hard on the first language of a list, so the card's own script goes first and English
// second (for "HP", attack costs and set codes). One combined list can't tell Japanese or Korean from English.
type Script = Exclude<CardLanguage, 'other'>;
const MODEL: Record<Script, string> = { en: 'eng', zh: 'chi_tra+eng', ja: 'jpn+eng', ko: 'kor+eng' };
const SCRIPTS: Script[] = ['en', 'zh', 'ja', 'ko'];
const CONFIDENT = 70;

/** Greyscale + contrast stretch. The 1st–99th percentile is used, so foil glare doesn't flatten the text. */
async function prepare(blob: Blob, side: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(2, side / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = y;
    hist[y]++;
  }
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
  if (hi - lo < 32) { lo = 0; hi = 255; } // flat image: leave it alone
  const span = hi - lo;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Two workers at most (the last two models used); older ones are shut down to spare the phone's memory.
const workers = new Map<string, Promise<Worker>>();
function worker(langs: string) {
  const hit = workers.get(langs);
  if (hit) { workers.delete(langs); workers.set(langs, hit); return hit; }
  const w = import('tesseract.js').then(async ({ createWorker }) => {
    const wk = await createWorker(langs.split('+'), 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr/lang' });
    // Camera photos carry no DPI; keep the spaces Tesseract finds instead of padding them.
    await wk.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' });
    return wk;
  });
  workers.set(langs, w);
  w.catch(() => { if (workers.get(langs) === w) workers.delete(langs); });
  while (workers.size > 2) {
    const [old, p] = workers.entries().next().value!;
    workers.delete(old);
    p.then((x) => x.terminate()).catch(() => undefined);
  }
  return w;
}

async function recognise(canvas: HTMLCanvasElement, script: Script) {
  const { data } = await (await worker(MODEL[script])).recognize(canvas, {}, { text: true, blocks: true });
  const text = clean(data.text ?? '');
  const layout: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({ text: clean(l.text), y: (l.bbox.y0 + l.bbox.y1) / 2 / canvas.height, h: (l.bbox.y1 - l.bbox.y0) / canvas.height }))
    .filter((l) => l.text);
  // Read in its own script, confidently, or with too little text to be worth another model.
  const fits = scriptLanguage(text) === script;
  return { text, layout, confidence: Math.round(data.confidence ?? 0), language: script, fits, empty: count(text, /[\p{L}\p{N}]/gu) < 4 };
}

// One job at a time on the shared workers.
let queue: Promise<unknown> = Promise.resolve();
// Cards in one batch are usually in one language: the last one found is tried first.
let lastFound: Script | null = null;

/**
 * Read the text on one photo. The first call loads the engine (a few MB, then cached by the browser).
 * 'auto' starts with the last language found (photos are read in order, so a back follows its front),
 * else English, and moves on to the other models only when the read doesn't fit; when none fits, the
 * most confident read wins.
 */
export function readText(blob: Blob, langs: OcrLangs): Promise<OcrResult> {
  const job = queue.then(async () => {
    const canvas = await prepare(blob, FULL_SIDE);
    let best: Awaited<ReturnType<typeof recognise>> | null = null;
    if (langs !== 'auto') best = await recognise(canvas, langs);
    else {
      const first = lastFound ?? 'en';
      for (const script of [first, ...SCRIPTS.filter((x) => x !== first)]) {
        const r = await recognise(canvas, script);
        if (r.empty && !best) { best = r; break; } // a blank side (most card backs): nothing to compare
        if (!best || (r.fits && !best.fits) || (r.fits === best.fits && r.confidence > best.confidence)) best = r;
        if (r.fits && r.confidence >= CONFIDENT) break;
      }
      if (best!.fits && !best!.empty) lastFound = best!.language as Script;
    }
    const r = best!;
    return { text: r.text, layout: r.layout, confidence: r.confidence, ...hints(r.text), language: r.fits ? r.language : scriptLanguage(r.text) };
  });
  queue = job.catch(() => undefined);
  return job;
}

const HAN = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々〆';
const CJK_GAP = new RegExp(`(?<=[${HAN}])[ \\t]+(?=[${HAN}])`, 'gu');

/** Full-width letters and digits to plain ones (０２５／１６５ → 025/165), and no stray spaces inside CJK words. */
export function clean(text: string) {
  return text.normalize('NFKC').replace(CJK_GAP, '').replace(/[ \t]+\n/g, '\n').trim();
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

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * The card's language from the recognised text, by how much of each script it holds. A few stray CJK
 * glyphs (art read as text) don't make an English card Chinese, and Chinese text read with the Japanese
 * model stays Chinese unless real kana show up — Japanese prose is a third or more kana.
 */
export function scriptLanguage(text: string): CardLanguage {
  const kana = count(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const hangul = count(text, /\p{Script=Hangul}/gu);
  const han = count(text, /\p{Script=Han}/gu);
  const latin = count(text, /\p{Script=Latin}/gu);
  const cjk = kana + hangul + han;
  if (cjk < 3 || cjk < latin * 0.15) return 'en';
  if (hangul >= Math.max(3, (kana + han) * 0.5)) return 'ko';
  if (kana >= Math.max(2, (kana + han) * 0.15)) return 'ja';
  if (han >= 3) return 'zh';
  return 'en';
}
