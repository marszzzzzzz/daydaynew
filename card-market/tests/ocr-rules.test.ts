import { describe, expect, it } from 'vitest';
import {
  acceptName, choose, clean, findNumbers, hints, nextModel, numberCandidates, scriptLanguage, tidyTitle, titleLine, verdict,
  type OcrLine, type Read, type Script,
} from '@/lib/ocr-rules';
import readings from './fixtures/readings.json';

// Real readings of rendered test cards (English, Chinese, Japanese, Korean; clean and blurred/tilted/JPEG)
// with each of the four models, recorded by scripts/ocr-bench.ts.
type Fixture = { card: Script; shot: string; model: Script; confidence: number; text: string };
const all = readings as Fixture[];
const reading = (card: Script, shot: string, model: Script): Read => {
  const f = all.find((r) => r.card === card && r.shot === shot && r.model === model)!;
  return { model, text: f.text, confidence: f.confidence, layout: [] };
};

/** Run the language search the way lib/ocr.ts does, starting from `first`. */
function settle(card: Script, shot: string, first: Script) {
  const reads: Read[] = [];
  for (let m: Script | null = first; m && reads.length < 4; m = nextModel(reads)) reads.push(reading(card, shot, m));
  return { ...choose(reads), passes: reads.map((r) => r.model) };
}

describe('language search', () => {
  const cards: Script[] = ['en', 'zh', 'ja', 'ko'];
  for (const card of cards) for (const shot of ['clean', 'video']) for (const first of cards) {
    it(`${card} card (${shot}), starting with ${first}`, () => {
      expect(settle(card, shot, first).language).toBe(card);
    });
  }

  it('regression: a Chinese card is not kept as an English reading of its art', () => {
    // Before: the English read (67%, "FI, BISBEE EF") beat the Chinese one (39%) because both "fit".
    const r = settle('zh', 'clean', 'en');
    expect(r.language).toBe('zh');
    expect(r.read.model).toBe('zh');
  });

  it('settles English cards in one reading and the others in at most four', () => {
    expect(settle('en', 'clean', 'en').passes).toEqual(['en']);
    expect(settle('en', 'video', 'en').passes).toEqual(['en']);
    expect(settle('ja', 'clean', 'en').passes).toEqual(['en', 'ja']);
    expect(settle('zh', 'video', 'zh').passes).toEqual(['zh', 'ja']); // kana ruled out once
    expect(settle('ko', 'video', 'ko').passes).toEqual(['ko']);
    for (const card of cards) expect(settle(card, 'clean', 'en').passes.length).toBeLessThanOrEqual(4);
  });

  it('stops at once on a blank side', () => {
    const blank: Read = { model: 'en', text: '| ~', confidence: 12, layout: [] };
    expect(verdict(blank)).toBe('blank');
    expect(nextModel([blank])).toBeNull();
    expect(choose([blank]).language).toBe('en');
  });

  it('reads an unsure English reading of mostly Latin text in English', () => {
    const lowEn: Read = { model: 'en', text: 'Trainer card Professor research draw seven', confidence: 55, layout: [] };
    expect(verdict(lowEn)).toBe('unsure');
    const ja: Read = { model: 'ja', text: 'Trainer card Professor research draw seven', confidence: 50, layout: [] };
    expect(verdict(ja)).toBe('en');
    expect(nextModel([ja])).toBe('en');
    expect(nextModel([ja, lowEn])).toBeNull();
    expect(choose([ja, lowEn]).language).toBe('en');
  });

  it('the Korean model’s Latin junk is not taken for English', () => {
    expect(verdict(reading('ja', 'clean', 'ko'))).toBe('cjk');
  });
});

describe('scriptLanguage', () => {
  it('ignores a few stray CJK glyphs in English text', () => {
    expect(scriptLanguage('Pikachu ii 廊 晤 Thunder shock 30 Flip a coin. If heads')).toBe('en');
  });
  it('tells the scripts apart', () => {
    expect(scriptLanguage('皮卡丘 十萬伏特 擲硬幣1次')).toBe('zh');
    expect(scriptLanguage('ピカチュウ 10まんボルト コインを1回投げ')).toBe('ja');
    expect(scriptLanguage('피카츄 10만볼트 동전을 1번 던져서')).toBe('ko');
  });
});

describe('card numbers', () => {
  it('finds the usual formats', () => {
    expect(findNumbers('Illus. x  025 / 165')).toEqual(['025/165']);
    expect(findNumbers('LOB-EN001 Blue-Eyes')).toEqual(['LOB-EN001']);
    expect(findNumbers('OP01-001 Monkey D. Luffy')).toEqual(['OP01-001']);
    expect(findNumbers('#23 LeBron')).toEqual(['#23']);
  });
  it('repairs a slash read as 7 or 1', () => {
    expect(findNumbers('0257165 Is teamDte')).toEqual(['025/165']);
    expect(findNumbers('1301165')).toEqual(['130/165']);
  });
  it('does not repair when a proper number is there, or when it cannot be one', () => {
    expect(findNumbers('025/165 0257165')).toEqual(['025/165']);
    expect(findNumbers('9997001')).toEqual([]); // 999 of 001 is no card number
    expect(findNumbers('12345678')).toEqual([]);
  });
});

describe('name lines', () => {
  const line = (text: string, y: number, h: number): OcrLine => ({ text, y, h, x: 0.5, w: 0.5, confidence: 80 });

  it('tidies what is printed beside the name', () => {
    expect(tidyTitle('/ Pikachu              HP 60 p')).toBe('Pikachu');
    expect(tidyTitle('皮卡丘                 HP60 一')).toBe('皮卡丘');
    expect(tidyTitle('| Pikachu        HP 60 ]')).toBe('Pikachu');
    expect(tidyTitle('Charizard ex')).toBe('Charizard ex');
  });

  it('accepts one-word and non-Latin names, not stats or junk', () => {
    for (const ok of ['Pikachu', 'Charizard ex', '皮卡丘', 'ピカチュウ', '피카츄', 'Monkey D. Luffy']) expect(acceptName(ok)).toBe(true);
    for (const no of ['HP 60', 'Weakness', '4 r y EE', '30', 'x2', '©2023 Pokémon', '6 lllus. Example', 'Illus. Mitsuhiro Arita']) expect(acceptName(no)).toBe(false);
  });

  it('picks the tallest name-like line at the top, else at the bottom', () => {
    const top = [line('Basic', 0.03, 0.02), line('Pikachu HP 60', 0.06, 0.04), line('Flip a coin. If heads, the Defending', 0.6, 0.02)];
    expect(titleLine(top)?.text).toBe('Pikachu HP 60');
    const bottom = [line('2023 Panini', 0.05, 0.015), line('LeBron James', 0.9, 0.05)];
    expect(titleLine(bottom)?.text).toBe('LeBron James');
    expect(titleLine([line('Flip a coin', 0.5, 0.03)])).toBeNull();
  });

  it('offers digit lines near the edges for a second look', () => {
    const lines = [line('4 0257165', 0.95, 0.015), line('30 damage 120', 0.5, 0.02), line('Pikachu', 0.05, 0.04)];
    expect(numberCandidates(lines).map((l) => l.text)).toEqual(['4 0257165']);
  });
});

describe('clean and hints', () => {
  it('turns full-width characters plain and joins CJK words', () => {
    expect(clean('０２５／１６５')).toBe('025/165');
    expect(clean('皮 卡 丘')).toBe('皮卡丘');
  });
  it('keeps text lines and drops noise', () => {
    const h = hints('Pikachu\nHP\n60\nThunder Shock 30\n|||\n025/165');
    expect(h.lines).toEqual(['Pikachu', 'Thunder Shock 30']);
    expect(h.numbers).toEqual(['025/165']);
  });
});

describe('junk kana', () => {
  it('a Korean or Chinese card read badly by the Japanese model is not taken for Japanese', () => {
    // Recorded from degraded photos: runs of the same kana at low confidence.
    const ko: Read = { model: 'ja', confidence: 34, text: '級 .計 / ににににり記ににEL をしに 中|品本所 ・誠 lllusExample 居', layout: [] };
    const zh: Read = { model: 'ja', confidence: 44, text: '皮証正 / 6 | 電 ベミングググ// 折リッ 』 0257165 lllus. Example プ', layout: [] };
    expect(verdict(ko)).toBe('cjk');
    expect(verdict(zh)).toBe('cjk');
  });
  it('a real Japanese reading still is', () => {
    const ja: Read = { model: 'ja', confidence: 56, text: '』 。開 セル / 時拉り以内20 中旋回投げオモテなら、相手のバトルポケモン 025/165', layout: [] };
    expect(verdict(ja)).toBe('ja');
  });
});

describe('English verdict', () => {
  it('regression: a confident English reading of Chinese print is not English', () => {
    // Seen in the browser on the Chinese test card: 60%+ confidence, no English in it.
    const r: Read = { model: 'en', confidence: 66, text: 'BEE\n&\nBERK\n//\nRk, EARER , BI4HFHBFIRTEIEAR\n025/165', layout: [] };
    expect(verdict(r)).toBe('unsure');
    expect(nextModel([r])).toBe('ja');
  });
  it('real English card text is', () => {
    const r: Read = { model: 'en', confidence: 72, text: 'Pikachu HP 60\nThunder Shock 30\nFlip a coin. If heads, the Defending Pokémon is now Paralyzed.', layout: [] };
    expect(verdict(r)).toBe('en');
  });
});

describe('Latin junk from CJK print', () => {
  it('regression: the Japanese model’s junk Latin on a Chinese card does not send it back to English', () => {
    // Seen in the browser: "ja:en" sent the Chinese card to the English reading.
    const en: Read = { model: 'en', confidence: 46, text: '& BERK // Rk, EARER , BI4HFHBFIRTEIEAR 025/165 lllus. Example', layout: [] };
    const ja: Read = { model: 'ja', confidence: 58, text: '4 皮玉丘 / ik, BAER , BISHFOBRFIRTEIEN 025/165 lllus. Example', layout: [] };
    expect(verdict(ja)).toBe('cjk');
    expect(nextModel([en, ja])).toBe('zh');
  });
});

it('regression: junk with "A" and "AT" in it is not English', () => {
  // The Chinese model on the Japanese test card, in the browser.
  const zh: Read = { model: 'zh', confidence: 38, text: 'EAFary HP 60 102 AFLP 30 AT E1BRT A E7755 MFPs E EVEIZT 3, 0', layout: [] };
  expect(verdict(zh)).toBe('cjk');
  expect(nextModel([zh])).toBe('ja');
});
