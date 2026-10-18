// Player (sports) cards: the player's name is printed big on the front and again at the top of the back,
// next to the card number; the middle of the back is stats (ignored); the bottom carries the publisher's
// logo and a copyright line with the year. This reads those parts from the OCR layout of both sides.
import type { OcrLine } from './ocr';

export interface PlayerCard {
  /** True when the photos look like a player card (a publisher found, or one name on both sides). */
  sports: boolean;
  name: string | null;
  number: string | null;
  publisher: string | null;
  year: string | null;
  /** "Panini Prizm · 2023-24": what goes into the notes. */
  note: string | null;
}

// Companies (as printed in the © line) and their product lines. Brands are matched as whole words.
const PUBLISHERS: [RegExp, string][] = [
  [/\btopps\b/i, 'Topps'], [/\bpanini\b/i, 'Panini'], [/\bupper\s*deck\b/i, 'Upper Deck'], [/\bfleer\b/i, 'Fleer'],
  [/\bleaf\b/i, 'Leaf'], [/\bfutera\b/i, 'Futera'], [/\bepoch\b/i, 'Epoch'], [/\bbbm\b/i, 'BBM'], [/\bcalbee\b/i, 'Calbee'],
  [/\bpacific\b/i, 'Pacific'], [/\bpinnacle\b/i, 'Pinnacle'], [/\bsky\s*box\b/i, 'SkyBox'], [/\bdonruss\b/i, 'Donruss'],
  [/\bbowman\b/i, 'Bowman'], [/\bscore\s+board\b/i, 'Score Board'], [/\bo-?pee-?chee\b/i, 'O-Pee-Chee'],
];
const BRANDS: [RegExp, string][] = [
  [/\bprizm\b/i, 'Prizm'], [/\bselect\b/i, 'Select'], [/\bmosaic\b/i, 'Mosaic'], [/\boptic\b/i, 'Optic'], [/\bhoops\b/i, 'Hoops'],
  [/\bnational\s+treasures\b/i, 'National Treasures'], [/\bimmaculate\b/i, 'Immaculate'], [/\bcontenders\b/i, 'Contenders'],
  [/\bchrome\b/i, 'Chrome'], [/\bstadium\s+club\b/i, 'Stadium Club'], [/\bfinest\b/i, 'Finest'], [/\bheritage\b/i, 'Heritage'],
  [/\bbowman\b/i, 'Bowman'], [/\bdonruss\b/i, 'Donruss'], [/\bscore\b/i, 'Score'], [/\bgallery\b/i, 'Gallery'],
];
// Words that are big on cards but are not a player's name.
const NOT_NAME = /\b(rookie|rc|card|cards|edition|series|draft|prospect|auto(graph)?|patch|relic|inc|llc|ltd|company|america|licensed|official|nba|nfl|mlb|nhl|mls|fifa|uefa|league|player|players|association|team|stats|season|totals?|career|position|height|weight|born|bats|throws|college|draft(ed)?|acquired|home)\b/i;

/** "LeBron James", "SHOHEI OHTANI", "大谷翔平": 2–4 words of letters, or 2–6 CJK characters. */
export function looksLikeName(line: string): boolean {
  const s = line.replace(/[•·|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^[\p{Script=Han}\p{Script=Katakana}ー・]{2,8}$/u.test(s.replace(/\s/g, ''))) return true;
  if (s.length < 5 || s.length > 34 || NOT_NAME.test(s)) return false;
  const words = s.split(' ');
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[\p{Lu}][\p{L}.'’-]*$/u.test(w) || /^(de|da|van|von|der|la|le|di|jr\.?|sr\.?|ii|iii|iv)$/i.test(w))
    && words.filter((w) => /^\p{Lu}/u.test(w)).length >= 2;
}

const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}]/gu, '');
const tidyName = (s: string) => s.replace(/[•·|]/g, ' ').replace(/\s+/g, ' ').trim();

// Card numbers printed at the top of a back: #23, No. 23, RC-12, BDC-150, TC-MJ, or a lone number.
const TOP_NUMBER = [
  /(?:^|\s)(?:#|no\.?\s*)(\d{1,4}[a-z]?)\b/i,
  /\b([A-Z]{1,5}\d{0,2}-[A-Z0-9]{1,5})\b/,
  /^(\d{1,4})$/,
];

const thisYear = new Date().getFullYear();
const okYear = (y: number) => y >= 1880 && y <= thisYear + 1;

/** The year: the © line first (© 2023, (c) 2023), else a season (2023-24) or year near the bottom. */
export function findYear(lines: OcrLine[]): string | null {
  const all = lines.map((l) => l.text).join('\n');
  const season = (s: string) => {
    const m = /\b((?:19|20)\d{2})\s*[-–/]\s*(\d{2})\b/.exec(s);
    return m && okYear(Number(m[1])) && Number(m[2]) === (Number(m[1]) + 1) % 100 ? `${m[1]}-${m[2]}` : null;
  };
  const copy = /(?:©|\(c\)|copyright)\s*((?:19|20)\d{2})/i.exec(all);
  const bottom = lines.filter((l) => l.y > 0.75).map((l) => l.text).join('\n');
  const s = season(bottom) ?? season(lines.filter((l) => l.y < 0.25).map((l) => l.text).join('\n'));
  if (copy && okYear(Number(copy[1]))) {
    // A season printed on the card beats the copyright year it was published in (2023-24 cards say © 2024).
    return s && Math.abs(Number(s.slice(0, 4)) - Number(copy[1])) <= 1 ? s : copy[1];
  }
  if (s) return s;
  const y = /\b((?:19|20)\d{2})\b/.exec(bottom);
  return y && okYear(Number(y[1])) ? y[1] : null;
}

const NUM_TOKEN = /(?:^|\s)(?:#\s?|no\.?\s*)?([A-Z]{1,5}\d{0,2}-[A-Z0-9]{1,5}|\d{1,4}[a-z]?)(?=\s|$)/i;

/** A top-of-back line often reads "#23 LEBRON JAMES": split it into the number and the rest. */
export function splitNumber(line: string): { number: string | null; rest: string } {
  const t = line.trim();
  for (const re of TOP_NUMBER) {
    const m = re.exec(t);
    if (m) return { number: m[1].toUpperCase(), rest: t.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  // A bare number before or after a name: "30 Stephen Curry", "Stephen Curry 30".
  const m = NUM_TOKEN.exec(t);
  if (m) {
    const rest = t.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    if (looksLikeName(rest)) return { number: m[1].toUpperCase(), rest };
  }
  return { number: null, rest: t };
}

/** Read a player card from the layout of its front and back (either may be missing). */
export function readPlayerCard(front: OcrLine[] = [], back: OcrLine[] = []): PlayerCard {
  const all = [...front, ...back].map((l) => l.text).join('\n');
  const company = PUBLISHERS.find(([re]) => re.test(all))?.[1] ?? null;
  const brand = BRANDS.find(([re, b]) => re.test(all) && b !== company)?.[1] ?? null;
  const publisher = [company, brand].filter(Boolean).join(' ') || null;
  const year = findYear(back.length ? back : front);

  // Name: the same name on both sides wins; else the top of the back; else the biggest text on the front.
  const backTop = back.filter((l) => l.y < 0.3).sort((a, b) => a.y - b.y).map((l) => ({ ...l, ...splitNumber(l.text) }));
  const frontNames = front.filter((l) => looksLikeName(l.text)).sort((a, b) => b.h - a.h);
  const backNames = backTop.filter((l) => looksLikeName(l.rest)).map((l) => ({ ...l, text: l.rest }));
  const both = frontNames.find((f) => backNames.some((b) => key(b.text) === key(f.text) || key(b.text).includes(key(f.text)) || key(f.text).includes(key(b.text))));
  const pick = both ?? backNames[0] ?? frontNames[0] ?? null;
  const name = pick ? tidyName(pick.text) : null;

  const number = backTop.find((l) => l.number)?.number ?? null;

  const sports = !!company || !!both;
  const note = sports && (publisher || year) ? [publisher, year].filter(Boolean).join(' · ') : null;
  return { sports, name: sports ? name : null, number: sports ? number : null, publisher, year, note };
}
