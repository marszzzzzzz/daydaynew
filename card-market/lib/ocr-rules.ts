// Pure rules for reading card photos: which language model to try next, which reading to keep, which
// text is the card's name and which is its number. No DOM and no engine here, so the rules can be unit
// tested and replayed by scripts/ocr-bench.ts on saved readings. lib/ocr.ts runs the engine.
import type { CardLanguage } from './types';

export type Script = Exclude<CardLanguage, 'other'>;
/** One recognised line and where it sits, as shares of the photo's width and height (y and x are the middle). */
export interface OcrLine { text: string; x: number; y: number; w: number; h: number; confidence: number }
/** One full reading of a photo with one language model. */
export interface Read { model: Script; text: string; confidence: number; layout: OcrLine[] }

const HAN = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々〆';
const CJK_GAP = new RegExp(`(?<=[${HAN}])[ \\t]+(?=[${HAN}])`, 'gu');

/** Full-width letters and digits to plain ones (０２５／１６５ → 025/165), and no stray spaces inside CJK words. */
export function clean(text: string) {
  return text.normalize('NFKC').replace(CJK_GAP, '').replace(/[ \t]+\n/g, '\n').trim();
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export function scripts(text: string) {
  return {
    kana: count(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu),
    hangul: count(text, /\p{Script=Hangul}/gu),
    han: count(text, /\p{Script=Han}/gu),
    latin: count(text, /\p{Script=Latin}/gu),
    alnum: count(text, /[\p{L}\p{N}]/gu),
  };
}

/**
 * The card's language from recognised text, by how much of each script it holds. A few stray CJK glyphs
 * (art read as text) don't make an English card Chinese; Japanese prose is a sixth or more kana.
 */
export function scriptLanguage(text: string): CardLanguage {
  const { kana, hangul, han, latin } = scripts(text);
  const cjk = kana + hangul + han;
  if (cjk < 3 || cjk < latin * 0.15) return 'en';
  if (hangul >= Math.max(3, (kana + han) * 0.5)) return 'ko';
  if (kana >= Math.max(2, (kana + han) * 0.15)) return 'ja';
  if (han >= 3) return 'zh';
  return 'en';
}

// What one reading says about the card's language. Each model can only write its own script (plus Latin),
// so the evidence differs per model. Thresholds come from scripts/ocr-bench.ts: the English model reads
// English cards at 70–90% confidence and every CJK card below 50%; a Japanese card read with the Japanese
// model is mostly kana, other cards give it a few stray kana; the Chinese model writes Han on any CJK card,
// but on a Korean card it is outnumbered by Latin junk; the Korean model writes Hangul only on Korean cards.
// Short, common words of English card text (rules text, sports backs, trainer cards). Junk read from
// Chinese or Japanese print almost never spells two of them.
const EN_WORDS = new Set(('the and this that your you each from for with all any ' +
  'card cards damage attack energy pokemon trainer flip coin heads tails draw deck hand discard player opponent ' +
  'turn during play put does more less than then until once your active bench basic stage evolves weakness ' +
  'resistance retreat rule ability item supporter stadium monster spell trap effect summon target destroy ' +
  'born height weight bats throws team season rookie games points rebounds assists').split(' '));
export const englishWords = (text: string) => (text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3 && EN_WORDS.has(w)).length; // "a", "at" turn up in junk

const distinctKana = (text: string) => new Set(text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).size;

export type Verdict = Script | 'cjk' | 'blank' | 'unsure';
export const EN_CONFIDENT = 60;

export function verdict(r: Read): Verdict {
  const { kana, hangul, han, latin, alnum } = scripts(r.text);
  if (alnum < 4) return 'blank';
  const cjk = kana + hangul + han;
  // Mostly English text (a CJK model on an English card); junk Latin from CJK print doesn't count.
  const latinMostly = latin >= 4 && latin >= cjk * 3 && englishWords(r.text) >= 2;
  switch (r.model) {
    // Confidence alone is not enough: CJK print read by the English model can score 60+ as "BEE BERK".
    case 'en': return r.confidence >= EN_CONFIDENT && latin >= 4 && englishWords(r.text) >= 2 ? 'en' : 'unsure';
    // Junk kana from art comes in runs (にににに, ググ) at low confidence; real Japanese is varied.
    case 'ja': return kana >= 8 && kana >= (kana + han) * 0.5 && r.confidence >= 50 && distinctKana(r.text) >= 5 ? 'ja' : latinMostly ? 'en' : 'cjk';
    case 'zh': return han >= 6 && han >= latin * 1.5 ? 'zh' : latinMostly ? 'en' : 'cjk';
    // The Korean model writes Latin junk for Han and kana, so its "mostly Latin" says nothing.
    case 'ko': return hangul >= 10 && hangul >= latin * 0.5 ? 'ko' : 'cjk';
  }
}

const ORDER: Script[] = ['ja', 'zh', 'ko', 'en'];

/**
 * The next model to read with, or null when the language is settled. Most cards take one or two readings:
 * English settles on the English model; Chinese needs the Japanese model to rule kana out (the Chinese
 * model writes Japanese kanji as Chinese); Korean is the last resort.
 */
export function nextModel(reads: Read[]): Script | null {
  const v = reads.map(verdict);
  const has = (m: Script) => reads.some((r) => r.model === m);
  const found = (m: Script) => reads.some((r, i) => r.model === m && v[i] === m);
  if (reads.length === 1 && v[0] === 'blank') return null; // a blank side (most card backs)
  if (found('en') || found('ja') || found('ko')) return null;
  if (found('zh')) return has('ja') ? null : 'ja';
  if (v.includes('en')) return has('en') ? null : 'en'; // mostly Latin: read it with the English model
  return ORDER.find((m) => !has(m)) ?? null;
}

/** The reading to keep and the card's language, once nextModel has nothing more to try. */
export function choose(reads: Read[]): { read: Read; language: CardLanguage } {
  const v = reads.map(verdict);
  for (const m of ['ja', 'ko', 'zh', 'en'] as const) {
    const i = reads.findIndex((r, j) => r.model === m && v[j] === m);
    if (i >= 0) return { read: reads[i], language: m };
  }
  const en = reads.find((r) => r.model === 'en');
  if (en && v.includes('en')) return { read: en, language: 'en' };
  const best = [...reads].sort((a, b) => b.confidence - a.confidence)[0];
  return { read: best, language: v.every((x) => x === 'blank') ? best.model : scriptLanguage(best.text) };
}

// --- card numbers ---------------------------------------------------------------------------------------

export const NUMBER_PATTERNS = [
  /\b[A-Z]{2,5}\d{0,2}-(?:EN|JP|JA|KR|TC|SC|DE|FR|IT|SP|PT)?\d{3}\b/g, // Yu-Gi-Oh LOB-EN001, One Piece OP01-001
  /\b\d{1,3}\s*\/\s*\d{1,3}\b/g, // Pokémon 025/165
  /#\s?\d{1,4}\b/g, // sports cards #123
];
/** Every character a printed card number can have (Tesseract takes a literal list, not ranges). */
export const NUMBER_CHARS = '0123456789/-#ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Card numbers in the text. The slash of 025/165 is often read as 7 or 1 (0257165): such runs are repaired. */
export function findNumbers(text: string): string[] {
  const found = NUMBER_PATTERNS.flatMap((re) => text.match(re) ?? []).map((n) => n.replace(/\s+/g, ''));
  if (!found.some((n) => n.includes('/'))) {
    for (const m of text.matchAll(/(?<![\d/])(\d{3})[71Il|](\d{3})(?![\d/])/g)) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (b > 0 && a <= b + 60) found.push(`${m[1]}/${m[2]}`); // secret rares run a little past the set size
    }
  }
  return [...new Set(found)];
}

// --- name lines -----------------------------------------------------------------------------------------

const NOISE = /^(hp|lv|ex|gx|v|vmax|vstar|atk|def|lvl|level|basic|stage\s?\d|trainer|energy|weakness|resistance|retreat|illus.*|©.*|\d+)$/i;

/** Plausible text lines (the chips the user picks from). */
export function hints(text: string) {
  const lines = [...new Set(text.split('\n')
    .map((l) => l.replace(/[|_~`^*<>{}[\]=]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => {
      const letters = (l.match(/\p{L}/gu) ?? []).length;
      return letters >= 2 && letters / l.length >= 0.4 && !NOISE.test(l);
    }))].slice(0, 14);
  return { lines, numbers: findNumbers(text) };
}

/** A name line without what is printed beside it: "Pikachu HP 60" → "Pikachu", "| 皮卡丘 HP60 一" → "皮卡丘". */
export function tidyTitle(line: string) {
  return line
    .replace(/\s*(?:HP|PV|KP|LP|ATK)\s*\d+.*$/i, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})!?.'’]+$/gu, '')
    .replace(/\s+[^\s\p{L}]{1,2}$/u, '') // a stray symbol at the end ("Pikachu ]")
    .replace(/\s+/g, ' ')
    .trim();
}

// Credit and copyright lines ("Illus." often reads as "lllus.").
const CREDIT = /\b[il1|]{1,3}lus\b|©|\(c\)|nintendo|creatures|game\s?freak|konami|bandai/i;

/** Could this be a card's name? Mostly letters, short, not a stats word. Any script, one word is fine. */
export function acceptName(text: string) {
  const s = tidyTitle(text);
  if (s.length < 2 || s.length > 40 || NOISE.test(s) || CREDIT.test(s)) return false;
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  const cjk = (s.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  if (cjk === 0 && !/\p{L}{3}/u.test(s)) return false; // a Latin name has a real word in it, not "4 r y EE"
  return letters / s.replace(/\s/g, '').length >= 0.7;
}

/**
 * The line most likely to be the card's name: the tallest name-like line in the top fifth (Pokémon, One
 * Piece, Yu-Gi-Oh, Digimon) or, failing that, the bottom fifth (many sports fronts).
 */
export function titleLine(layout: OcrLine[]): OcrLine | null {
  const band = (keep: (l: OcrLine) => boolean) => layout.filter((l) => keep(l) && acceptName(l.text)).sort((a, b) => b.h - a.h)[0] ?? null;
  return band((l) => l.y < 0.2) ?? band((l) => l.y > 0.8);
}

/** The line that holds the card number, if one was recognised. */
export function numberLine(layout: OcrLine[]): OcrLine | null {
  return layout.find((l) => findNumbers(l.text).length) ?? null;
}

/** Lines that may hold a number the full reading missed: digits near the top or bottom edge. */
export function numberCandidates(layout: OcrLine[]): OcrLine[] {
  return layout.filter((l) => (l.y > 0.8 || l.y < 0.12) && count(l.text, /\d/g) >= 3).slice(0, 2);
}
