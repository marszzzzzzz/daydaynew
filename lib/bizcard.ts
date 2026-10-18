// Business-card field extraction (spec §4.3). Input: the recognised lines of the front and back, each with its
// height on the photo. Output: the best value per field with a confidence score, plus every candidate so the
// review screen can offer alternatives. Pure: no DOM, so it runs in tests.
import { toE164, isHkMobile } from './phone';
import type { CardLanguage, PhoneKind } from './types';

export interface Line { text: string; y?: number; h?: number }
export interface ParsedPhone { kind: PhoneKind; e164: string; raw: string; whatsapp: boolean }
export type TextField = 'nameZh' | 'nameEn' | 'title' | 'titleEn' | 'company' | 'companyEn' | 'department' | 'address' | 'website';
export interface Candidate { value: string; score: number }
export interface ParsedCard {
  fields: Partial<Record<TextField, Candidate>>;
  candidates: Partial<Record<TextField, Candidate[]>>;
  phones: ParsedPhone[];
  emails: string[];
  language: CardLanguage;
}

export const THRESHOLD = 0.5;

const HAN = /\p{Script=Han}/u;
const HAN_ALL = /\p{Script=Han}/gu;
const LATIN_ALL = /\p{Script=Latin}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

const TITLE_EN = /\b(manager|director|officer|executive|president|partner|founder|co-founder|engineer|consultant|sales|head|lead|vp|ceo|cfo|cto|coo|cmo|chairman|chairwoman|secretary|assistant|specialist|supervisor|coordinator|representative|associate|analyst|designer|developer|architect|advisor|adviser|owner|principal|agent|accountant|lawyer|solicitor|chief|administrator|controller)\b/i;
const TITLE_ZH = /(經理|总监|總監|主任|主管|總裁|总裁|董事|顧問|顾问|工程師|工程师|創辦人|创办人|合夥人|合伙人|秘書|秘书|助理|總經理|总经理|行政|營業代表|代表|專員|专员|設計師|设计师|律師|律师|會計師|会计师|社長|部長|部长|課長|課長|係長|社員|主席|院長|校長|代理)/;
const COMPANY_EN = /\b(limited|ltd\.?|co\.|company|inc\.?|corp\.?|corporation|group|holdings?|llc|gmbh|plc|pte\.?|s\.a\.|bank|associates|enterprises?|international|technology|technologies|trading|studio|solutions)\b/i;
const COMPANY_ZH = /(有限公司|公司|集團|集团|控股|事務所|事务所|銀行|银行|株式会社|株式會社|商行|工作室|企業|企业|貿易|贸易|科技|實業|实业|學院|学院|協會|协会)/;
const ADDRESS_EN = /\b(road|rd\.?|street|st\.|avenue|ave\.?|floor|\d+\/f|flat|room|rm\.?|unit|tower|building|bldg|centre|center|plaza|hong kong|kowloon|n\.t\.|new territories|block|lane|drive|district|industrial|estate|suite|level|lot)\b/i;
const ADDRESS_ZH = /(道|街|路|號|号|樓|楼|室|座|大廈|大厦|中心|香港|九龍|九龙|新界|區|区|市|省|巷|廣場|广场|村)/;
const DEPT = /\b(department|dept\.?|division)\b|部$|部門|部门/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WEB_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|hk|cn|tw|jp|kr|sg|my|io|co|biz|info|shop|asia|us|uk|au)(?:\.[a-z]{2})?(?:\/[^\s]*)?/gi;
const PHONE_RE = /(?:\+|00)?\(?\d[\d\s().\-–]{5,}\d/g;
const LABELS: { re: RegExp; kind?: PhoneKind; wa?: boolean }[] = [
  { re: /(whats\s?app|\bwa\b|📱|微信|wechat)/i, wa: true },
  { re: /(\bfax\b|\bf\b|傳真|传真)/i, kind: 'FAX' },
  { re: /(\bmob(ile)?\b|\bm\b|\bcell\b|\bhp\b|手機|手机|流動|流动|携帯)/i, kind: 'MOBILE' },
  { re: /(\btel\b|\bt\b|\boffice\b|\bdirect\b|\bdid\b|\bph(one)?\b|電話|电话|直線|直线|辦公|办公)/i, kind: 'OFFICE' },
];

/** Undo common OCR slips in e-mail addresses: (at) → @, ",com" → ".com", spaces around @ and dots. */
export function fixEmailText(line: string) {
  return line
    .replace(/\s*[([]\s*at\s*[)\]]\s*/gi, '@')
    .replace(/\s*@\s*/g, '@')
    .replace(/,(com|net|org|hk|cn)\b/gi, '.$1')
    .replace(/(@[a-z0-9-]+)\s*\.\s*/gi, '$1.')
    .replace(/(\.[a-z]{2,3})\s+\.\s*([a-z]{2})\b/gi, '$1.$2');
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const tidy = (s: string) => s.replace(/[|_~`^*<>{}[\]=•·]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,:;.\-–]+|[\s,:;\-–]+$/g, '').trim();

/**
 * Split a mixed line into its Chinese and Latin halves: "銷售經理 Sales Manager", "Peter Chan 陳大文",
 * "ABC 有限公司 ABC Limited" (→ "ABC 有限公司" / "ABC Limited"). A single Latin word before the Chinese
 * ("ABC 有限公司") belongs to the Chinese name.
 */
export function splitScripts(s: string): { zh: string; en: string } {
  const han = count(s, HAN_ALL), latin = count(s, LATIN_ALL);
  if (!han) return { zh: '', en: tidy(s) };
  if (!latin) return { zh: s.trim(), en: '' };
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const chars = [...s];
  const first = chars.findIndex((c) => cjk.test(c));
  let last = chars.length - 1;
  while (last > 0 && !cjk.test(chars[last])) last--;
  const prefix = chars.slice(0, first).join(''), middle = chars.slice(first, last + 1).join(''), suffix = chars.slice(last + 1).join('');
  const words = (x: string) => x.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  const clean = (x: string) => tidy(x.replace(/[（）「」、，。：]/g, ' '));
  if (words(suffix) && !words(prefix)) return { zh: clean(middle), en: clean(suffix) };
  if (words(suffix) && words(prefix) === 1) return { zh: clean(prefix + middle), en: clean(suffix) };
  if (words(prefix) >= 2 && !words(suffix)) return { zh: clean(middle + suffix), en: clean(prefix) };
  if (words(prefix) === 1 && !words(suffix) && !words(middle)) return { zh: clean(s), en: '' };
  // Interleaved: take the scripts apart.
  const zh = s.replace(/[A-Za-z][A-Za-z0-9&.,'()\- ]*/g, ' ').replace(/\s+/g, '').trim();
  const en = s.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}（）「」、，。：]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return { zh, en: tidy(en) };
}

function phonesIn(line: string, defaultCountry: string): { phones: ParsedPhone[]; rest: string } {
  const phones: ParsedPhone[] = [];
  let rest = line;
  for (const m of line.matchAll(PHONE_RE)) {
    const raw = m[0].trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    // A date (2026-10-18) or a postcode-like run is not a phone.
    if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw)) continue;
    const before = line.slice(Math.max(0, (m.index ?? 0) - 14), m.index).toLowerCase();
    let kind: PhoneKind | undefined;
    let wa = false;
    // The label closest to the number wins.
    let best = -1;
    for (const l of LABELS) {
      const all = [...before.matchAll(new RegExp(l.re.source, 'gi'))];
      const at = all.length ? (all[all.length - 1].index ?? 0) : -1;
      if (at >= 0 && at >= best) {
        if (l.wa) { wa = true; if (at > best) { best = at; kind = kind ?? 'MOBILE'; } continue; }
        best = at; kind = l.kind;
      }
    }
    const e164 = toE164(raw, defaultCountry);
    if (!e164) continue;
    if (!kind) {
      if (e164.startsWith('+852')) kind = isHkMobile(e164.slice(4)) && /^[5679]/.test(e164.slice(4)) ? 'MOBILE' : /^[23]/.test(e164.slice(4)) ? 'OFFICE' : 'OTHER';
      else if (/^\+861[3-9]/.test(e164) || /^\+8869/.test(e164) || /^\+81[789]0/.test(e164)) kind = 'MOBILE';
      else kind = 'OTHER';
    }
    if (kind === 'MOBILE' && e164.startsWith('+852') && /^[5679]/.test(e164.slice(4))) wa = true;
    if (kind === 'FAX') wa = false;
    phones.push({ kind, e164, raw, whatsapp: wa });
    rest = rest.replace(m[0], ' ');
  }
  return { phones, rest };
}

const LABEL_EN = /(^|\s)(t|tel|f|fax|m|mob|mobile|e|email|e-mail|w|web|website|a|add|addr|address|wa|whatsapp|phone|ph|direct|office|hp|cell)(?=\s*[:：.]|\s*$|\s+[^a-z\s])\s*[:：.]?/gi;
const LABEL_ZH = /(電話|电话|傳真|传真|手機|手机|電郵|电邮|郵箱|邮箱|網址|网址|地址|直線|直线|流動|流动|携帯)\s*[:：]?/g;

interface Tagged { text: string; h: number; side: number; idx: number }

/** Parse both sides. Lines are given per side in reading order. */
export function parseCard(sides: Line[][], defaultCountry = '852'): ParsedCard {
  const phones: ParsedPhone[] = [];
  const emails: string[] = [];
  const websites: Candidate[] = [];
  const rest: Tagged[] = [];
  const allText: string[] = [];

  sides.forEach((lines, side) => {
    lines.forEach((l, idx) => {
      let t = l.text.normalize('NFKC');
      allText.push(t);
      t = fixEmailText(t);
      for (const m of t.match(EMAIL_RE) ?? []) emails.push(m.toLowerCase().replace(/[.,]+$/, ''));
      t = t.replace(EMAIL_RE, ' ');
      for (const m of t.match(WEB_RE) ?? []) {
        if (/^\d/.test(m) || !/[a-z]/i.test(m.split('.')[0])) continue;
        const v = m.replace(/[.,]+$/, '');
        websites.push({ value: v.toLowerCase(), score: /^(https?:\/\/|www\.)/i.test(v) ? 0.95 : 0.7 });
        t = t.replace(m, ' ');
      }
      const p = phonesIn(t, defaultCountry);
      phones.push(...p.phones);
      t = p.rest.replace(LABEL_EN, ' ').replace(LABEL_ZH, ' ');
      t = tidy(t);
      if (count(t, /[\p{L}]/gu) >= 2) rest.push({ text: t, h: l.h ?? 0, side, idx });
    });
  });

  // Height rank across the card (bigger text first) — the largest line is usually the name.
  const heights = [...new Set(rest.map((r) => r.h))].sort((a, b) => b - a);
  const rank = (h: number) => (h ? heights.indexOf(h) : 9);

  const cand: Partial<Record<TextField, Candidate[]>> = {};
  const add = (f: TextField, value: string, score: number) => {
    value = tidy(value);
    if (!value) return;
    (cand[f] ??= []).push({ value, score: Math.min(1, score) });
  };

  const used = new Set<Tagged>();
  // Address: keyword lines, consecutive lines on the same side merged.
  const addrRuns: Tagged[][] = [];
  for (const r of rest) {
    const isAddr = (ADDRESS_EN.test(r.text) && /\d/.test(r.text)) || (ADDRESS_ZH.test(r.text) && /\d|號|号|樓|楼/.test(r.text)) || /\b(hong kong|kowloon)\b/i.test(r.text) && r.text.length > 12;
    if (!isAddr || COMPANY_EN.test(r.text) && !/\d/.test(r.text)) continue;
    const last = addrRuns[addrRuns.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && prev.side === r.side && r.idx === prev.idx + 1) last.push(r);
    else addrRuns.push([r]);
    used.add(r);
  }
  for (const run of addrRuns) add('address', run.map((r) => r.text).join(HAN.test(run[0].text) ? '' : ', '), 0.6 + 0.1 * Math.min(3, run.length));

  for (const r of rest) {
    if (used.has(r)) continue;
    const { zh, en } = splitScripts(r.text);
    const big = rank(r.h);
    if (DEPT.test(r.text) && !TITLE_EN.test(r.text)) { add('department', r.text, 0.6); continue; }
    let took = false;
    // Company
    if (zh && COMPANY_ZH.test(zh)) { add('company', zh, 0.85); took = true; }
    if (en && COMPANY_EN.test(en)) { add('companyEn', en, 0.85); took = true; }
    if (took) continue;
    // Title
    if (zh && TITLE_ZH.test(zh) && zh.length <= 16) { add('title', zh, 0.8); took = true; }
    if (en && TITLE_EN.test(en) && en.split(' ').length <= 8) { add('titleEn', en, 0.8); took = true; }
    if (took) continue;
    // Names
    const zhName = zh.replace(/\s/g, '');
    if (/^\p{Script=Han}{2,4}$/u.test(zhName) && !KANA.test(zhName)) add('nameZh', zhName, 0.55 + (big === 0 ? 0.35 : big <= 2 ? 0.2 : 0));
    else if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,6}$/u.test(zhName) && KANA.test(zhName)) add('nameZh', zhName, 0.4);
    if (en) {
      const words = en.split(/\s+/).filter(Boolean);
      const nameLike = words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w) || /^[A-Z]{2,}$/.test(w) || /^\(?[A-Z][a-z]+\)?,?$/.test(w));
      if (nameLike && !ADDRESS_EN.test(en)) add('nameEn', words.join(' '), 0.45 + (big === 0 ? 0.4 : big <= 2 ? 0.25 : 0));
    }
  }
  if (websites.length) cand.website = websites;

  const fields: ParsedCard['fields'] = {};
  for (const [f, list] of Object.entries(cand) as [TextField, Candidate[]][]) {
    list.sort((a, b) => b.score - a.score);
    // Same value seen on both sides: keep one.
    cand[f] = list.filter((c, i) => list.findIndex((x) => x.value.toLowerCase() === c.value.toLowerCase()) === i);
    if (list[0].score >= THRESHOLD) fields[f] = list[0];
  }

  // De-duplicate phones (by E.164; keep the most specific kind, OR the WhatsApp flag) and e-mails.
  const byNum = new Map<string, ParsedPhone>();
  for (const p of phones) {
    const old = byNum.get(p.e164);
    if (!old) byNum.set(p.e164, { ...p });
    else { if (old.kind === 'OTHER') old.kind = p.kind; old.whatsapp ||= p.whatsapp; }
  }
  return {
    fields, candidates: cand, phones: [...byNum.values()], emails: [...new Set(emails)],
    language: scriptOf(allText.join('\n')),
  };
}

/** The card's main language (Chinese wins when any real Chinese text is present — bilingual HK cards). */
export function scriptOf(text: string): CardLanguage {
  const kana = count(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const hangul = count(text, /\p{Script=Hangul}/gu);
  const han = count(text, HAN_ALL);
  if (hangul >= 3) return 'ko';
  if (kana >= 2) return 'ja';
  if (han >= 2) return 'zh';
  return 'en';
}
