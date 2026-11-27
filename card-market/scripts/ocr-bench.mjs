// Measure card scanning on a folder of real photos, with the same rules the app uses (lib/ocr-rules.ts).
//
//   npm run ocr:bench -- <folder> [--save-readings out.json]
//
// <folder> holds card photos (jpg/png/webp) and, optionally, labels.json:
//   { "pikachu-zh.jpg": { "language": "zh", "name": "皮卡丘", "number": "025/165" }, ... }
// For each photo it prints the language found, the readings it took, the name line, the numbers and the
// time; with labels, it scores language, name and number. Run it before and after a change to the rules.
// It runs in Node: timings are a few times faster than a phone, but the comparison between runs holds.
// Needs Node 22.18+ (it loads the TypeScript rules directly) and `npm run predev` once (the OCR data).
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { acceptName, choose, clean, findNumbers, hints, nextModel, numberCandidates, numberLine, tidyTitle, titleLine, NUMBER_CHARS } from '../lib/ocr-rules.ts';

const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.error('usage: npm run ocr:bench -- <folder> [--save-readings out.json]'); process.exit(1); }
const saveTo = rest[rest.indexOf('--save-readings') + 1] && rest.includes('--save-readings') ? rest[rest.indexOf('--save-readings') + 1] : null;
const LANG = 'public/ocr/lang';
if (!existsSync(`${LANG}/eng.traineddata.gz`)) { console.error('OCR data missing: run `npm run predev` first'); process.exit(1); }

const MODEL = { en: 'eng', zh: 'chi_tra+eng', ja: 'jpn+eng', ko: 'kor+eng' };
const FULL_SIDE = 2200, LINE_PX = 56;
const workers = {};
const worker = async (m) => (workers[m] ??= (async () => {
  const w = await createWorker(MODEL[m].split('+'), 1, { langPath: LANG, cachePath: '.ocr-cache', logger: () => {}, errorHandler: () => {} });
  await w.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' });
  return w;
})());

/** Same preparation as lib/ocr.ts: scaled toward FULL_SIDE (at most 2×), greyscale, 1–99% contrast stretch. */
async function prepare(file) {
  const meta = await sharp(file).rotate().metadata();
  const long = Math.max(meta.width, meta.height), k = Math.min(2, FULL_SIDE / long);
  const W = Math.round(meta.width * k), H = Math.round(meta.height * k);
  const png = await sharp(file).rotate().resize(W, H).greyscale().normalise({ lower: 1, upper: 99 }).png().toBuffer();
  return { png, W, H };
}

async function readFull(img, m) {
  const { data } = await (await worker(m)).recognize(img.png, {}, { text: true, blocks: true });
  const layout = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({
    text: clean(l.text), confidence: Math.round(l.confidence ?? 0),
    x: (l.bbox.x0 + l.bbox.x1) / 2 / img.W, y: (l.bbox.y0 + l.bbox.y1) / 2 / img.H, w: (l.bbox.x1 - l.bbox.x0) / img.W, h: (l.bbox.y1 - l.bbox.y0) / img.H,
  })).filter((l) => l.text);
  return { model: m, text: clean(data.text ?? ''), confidence: Math.round(data.confidence ?? 0), layout };
}

async function readLine(img, l, m, chars) {
  const padY = l.h * 0.45, padX = l.h * 1.2 * (img.H / img.W);
  const x0 = Math.max(0, l.x - l.w / 2 - padX), x1 = Math.min(1, l.x + l.w / 2 + padX);
  const y0 = Math.max(0, l.y - l.h / 2 - padY), y1 = Math.min(1, l.y + l.h / 2 + padY);
  const k = Math.min(3, Math.max(0.5, LINE_PX / Math.max(1, l.h * img.H)));
  const left = Math.round(x0 * img.W), top = Math.round(y0 * img.H);
  const width = Math.max(1, Math.round((x1 - x0) * img.W)), height = Math.max(1, Math.round((y1 - y0) * img.H));
  const cut = await sharp(img.png).extract({ left, top, width, height }).resize(Math.round(width * k), Math.round(height * k)).png().toBuffer();
  const params = { tessedit_pageseg_mode: '7', ...(chars ? { tessedit_char_whitelist: chars } : {}) };
  const { data } = await (await worker(m)).recognize(cut, params, { text: true });
  return { text: clean(data.text ?? '').replace(/\s*\n\s*/g, ' '), confidence: Math.round(data.confidence ?? 0) };
}

/** Same steps as readText() in lib/ocr.ts, in 'auto' mode, with no language carried over between photos. */
async function scan(file) {
  const t0 = performance.now();
  const img = await prepare(file);
  const reads = [];
  for (let m = 'en'; m && reads.length < 4; m = nextModel(reads)) reads.push(await readFull(img, m));
  const { read, language } = choose(reads);
  const model = language === 'other' ? read.model : language;
  let title = '';
  const tl = titleLine(read.layout);
  if (tl) {
    const again = await readLine(img, tl, model);
    title = tidyTitle(again.confidence >= tl.confidence && acceptName(again.text) ? again.text : tl.text);
  }
  const extra = [];
  for (const l of numberLine(read.layout) ? [] : numberCandidates(read.layout)) extra.push(...findNumbers((await readLine(img, l, 'en', NUMBER_CHARS)).text));
  const numbers = [...new Set([...hints(read.text).numbers, ...extra])];
  return { language, passes: reads.map((r) => r.model), title, numbers, ms: Math.round(performance.now() - t0), reads };
}

const norm = (s) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}/-]/gu, '');
const labels = existsSync(join(dir, 'labels.json')) ? JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8')) : {};
const files = readdirSync(dir).filter((f) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(f).toLowerCase())).sort();
const score = { language: [0, 0], name: [0, 0], number: [0, 0] };
const saved = [];
let total = 0;
for (const f of files) {
  const r = await scan(join(dir, f));
  total += r.ms;
  const want = labels[f] ?? {};
  const marks = [];
  for (const [k, got] of [['language', r.language], ['name', r.title], ['number', r.numbers]]) {
    if (!want[k]) continue;
    const ok = k === 'number' ? got.map(norm).includes(norm(want[k])) : k === 'name' ? norm(got).includes(norm(want[k])) || (norm(got) && norm(want[k]).includes(norm(got))) : got === want[k];
    score[k][0] += ok ? 1 : 0; score[k][1]++;
    marks.push(`${k}:${ok ? 'ok' : 'MISS'}`);
  }
  console.log(`${f}  ${r.language} via ${r.passes.join('>')}  name="${r.title}"  numbers=${r.numbers.join(',') || '-'}  ${r.ms}ms  ${marks.join(' ')}`);
  saved.push({ file: f, ...r, reads: r.reads.map(({ model, text, confidence }) => ({ model, text, confidence })) });
}
console.log(`\n${files.length} photos, ${files.length ? Math.round(total / files.length) : 0} ms each on average`);
for (const [k, [ok, n]] of Object.entries(score)) if (n) console.log(`${k}: ${ok}/${n} (${Math.round((ok / n) * 100)}%)`);
if (saveTo) { writeFileSync(saveTo, JSON.stringify(saved, null, 1)); console.log(`readings saved to ${saveTo}`); }
for (const w of Object.values(workers)) await (await w).terminate();
