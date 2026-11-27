// On-device OCR for card photos (tesseract.js, WebAssembly). The engine and language data are served from
// /ocr on this site (scripts/copy-ocr.mjs). Workers are reused and jobs run one at a time, so a batch of
// 10 cards is read in the background while the user keeps shooting.
//
// One photo: a full reading with one language model at a time until lib/ocr-rules.ts settles the language
// (usually one or two readings), then a sharp second look at just the name line and the number line.
'use client';
import type { Worker } from 'tesseract.js';
import { NUMBER_CHARS, verdict, choose, clean, findNumbers, hints, nextModel, numberCandidates, numberLine, tidyTitle, titleLine, acceptName, type OcrLine, type Read, type Script } from './ocr-rules';
import type { CardLanguage } from './types';

export { clean, hints, scriptLanguage } from './ocr-rules';
export type { OcrLine } from './ocr-rules';

/** 'auto' works the language out; the others read with that language's model only. */
export type OcrLangs = 'auto' | 'en' | 'zh' | 'ja' | 'ko';
export const OCR_LANGS: OcrLangs[] = ['auto', 'en', 'zh', 'ja', 'ko'];
/** `title` is the name line read a second time on its own (empty when none was found). */
export interface OcrResult { text: string; confidence: number; lines: string[]; numbers: string[]; language: CardLanguage; layout: OcrLine[]; title: string }

// Tesseract reads best at a text height of ~30px: small photos are scaled up, large ones down.
const FULL_SIDE = 2200;
// Tesseract leans hard on the first language of a list, so the card's own script goes first and English
// second (for "HP", attack costs and set codes). One combined list can't tell Japanese or Korean from English.
const MODEL: Record<Script, string> = { en: 'eng', zh: 'chi_tra+eng', ja: 'jpn+eng', ko: 'kor+eng' };
// A second look at one line: scaled so its letters are about this tall.
const LINE_PX = 56;

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

/** Encoded once and handed to every reading (tesseract.js would otherwise PNG-encode the canvas each time). */
const png = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png'));

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

async function readFull(image: Blob, W: number, H: number, model: Script): Promise<Read> {
  const { data } = await (await worker(MODEL[model])).recognize(image, {}, { text: true, blocks: true });
  const layout: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({
      text: clean(l.text), confidence: Math.round(l.confidence ?? 0),
      x: (l.bbox.x0 + l.bbox.x1) / 2 / W, y: (l.bbox.y0 + l.bbox.y1) / 2 / H, w: (l.bbox.x1 - l.bbox.x0) / W, h: (l.bbox.y1 - l.bbox.y0) / H,
    }))
    .filter((l) => l.text);
  return { model, text: clean(data.text ?? ''), confidence: Math.round(data.confidence ?? 0), layout };
}

/** One line cut out of the prepared photo (with a margin) and scaled so its letters are LINE_PX tall. */
function cutLine(c: HTMLCanvasElement, l: OcrLine): Promise<Blob> {
  const padY = l.h * 0.45, padX = l.h * 1.2 * (c.height / c.width);
  const x0 = Math.max(0, l.x - l.w / 2 - padX), x1 = Math.min(1, l.x + l.w / 2 + padX);
  const y0 = Math.max(0, l.y - l.h / 2 - padY), y1 = Math.min(1, l.y + l.h / 2 + padY);
  const sw = (x1 - x0) * c.width, sh = (y1 - y0) * c.height;
  const k = Math.min(3, Math.max(0.5, LINE_PX / Math.max(1, l.h * c.height)));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * k));
  out.height = Math.max(1, Math.round(sh * k));
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, x0 * c.width, y0 * c.height, sw, sh, 0, 0, out.width, out.height);
  return png(out);
}

/** Read one cut-out line as a single line of text; `chars` limits what it may contain. */
async function readLine(image: Blob, model: Script, chars?: string) {
  // Per-call parameters: tesseract.js sets them for this job only and restores the worker's afterwards.
  const params = { tessedit_pageseg_mode: '7', ...(chars ? { tessedit_char_whitelist: chars } : {}) } as Record<string, string>;
  const { data } = await (await worker(MODEL[model])).recognize(image, params, { text: true });
  return { text: clean(data.text ?? '').replace(/\s*\n\s*/g, ' '), confidence: Math.round(data.confidence ?? 0) };
}

// One job at a time on the shared workers.
let queue: Promise<unknown> = Promise.resolve();
// Cards in one batch are usually in one language: the last one found is tried first.
let lastFound: Script | null = null;

/** Forget the language of the previous cards (a new batch, or a new photo of several cards). */
export function resetOcrLanguage() { lastFound = null; }

export class StaleJob extends Error { constructor() { super('stale'); } }

export interface ReadOptions {
  /**
   * Read with this language first and settle for it when it fits (the back of a card whose front was read).
   * Asked when the job's turn comes, so a front read just before it counts.
   */
  hint?: () => CardLanguage | null | undefined;
  /** Checked when the job's turn comes: a photo retaken or removed meanwhile is not read at all. */
  stale?: () => boolean;
}

/**
 * Read the text on one photo. The first call loads the engine (a few MB, then cached by the browser).
 * Rejects with StaleJob when `stale()` says the photo is no longer wanted.
 */
export function readText(blob: Blob, langs: OcrLangs, opts: ReadOptions = {}): Promise<OcrResult> {
  const job = queue.then(async () => {
    if (opts.stale?.()) throw new StaleJob();
    const t0 = performance.now();
    const canvas = await prepare(blob, FULL_SIDE);
    const image = await png(canvas);
    const W = canvas.width, H = canvas.height;
    let read: Read, language: CardLanguage;
    if (langs !== 'auto') {
      read = await readFull(image, W, H, langs);
      language = langs;
    } else {
      const h0 = opts.hint?.();
      const hint = h0 && h0 !== 'other' ? h0 : null;
      const reads: Read[] = [];
      for (let m: Script | null = hint ?? lastFound ?? 'en'; m && reads.length < 4; m = nextModel(reads)) {
        reads.push(await readFull(image, W, H, m));
        if (hint && reads.length === 1 && choose(reads).language === hint) break; // the front already settled it
      }
      ({ read, language } = choose(reads));
      if (process.env.NODE_ENV !== 'production') console.debug('[ocr] readings', reads.map((r) => `${r.model}:${verdict(r)}:${r.confidence}:${r.text.replace(/\s+/g, ' ').slice(0, 60)}`));
      if (language !== 'other' && read.text.length >= 4) lastFound = language as Script;
    }
    const model: Script = language === 'other' ? read.model : language;

    // A second, sharper look at the name line and at the number line (or a line of digits that may be one).
    let title = '';
    const tl = titleLine(read.layout);
    if (tl) {
      const again = await readLine(await cutLine(canvas, tl), model);
      title = tidyTitle(again.confidence >= tl.confidence && acceptName(again.text) ? again.text : tl.text);
    }
    const extra: string[] = [];
    for (const l of numberLine(read.layout) ? [] : numberCandidates(read.layout)) {
      const again = await readLine(await cutLine(canvas, l), 'en', NUMBER_CHARS);
      extra.push(...findNumbers(again.text));
    }
    const h = hints(read.text);
    if (process.env.NODE_ENV !== 'production') console.debug(`[ocr] ${language} via ${model} in ${Math.round(performance.now() - t0)} ms`, { title, numbers: [...extra, ...h.numbers] });
    return {
      text: read.text, layout: read.layout, confidence: read.confidence, language, title,
      lines: title ? [title, ...h.lines.filter((l) => l !== title)].slice(0, 14) : h.lines,
      numbers: [...new Set([...h.numbers, ...extra])],
    };
  });
  queue = job.catch(() => undefined);
  return job;
}
