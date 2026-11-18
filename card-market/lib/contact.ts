// Phone numbers are not allowed in deal messages and offer notes: contact details are shared by the
// platform (WhatsApp, once an offer is accepted), not typed into the chat. Used by the message boxes
// (warn before sending), the /api proxy (refuse), and the conversation view (hide any that got in, e.g.
// sent from the Card Pool app).

// Chinese numerals (normal and formal) and keycap digits, read as digits so "九一二三四五六七" is caught.
const CN: Record<string, string> = {
  零: '0', 〇: '0', 一: '1', 二: '2', 兩: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
  壹: '1', 貳: '2', 贰: '2', 參: '3', 叁: '3', 肆: '4', 伍: '5', 陸: '6', 陆: '6', 柒: '7', 捌: '8', 玖: '9',
};

/** Same length as the input (so match positions line up), digits in every form turned into 0–9. */
function digitsOf(text: string): string {
  let out = '';
  for (const ch of Array.from(text)) {
    const n = ch.normalize('NFKC'); // full-width ９ → 9, circled ① → 1
    const d = CN[ch] ?? (n.length === 1 && /\d/.test(n) ? n : null);
    // Keep one output character per UTF-16 unit of the input.
    out += (d ?? (ch.length === 1 ? ch : '\u0000')).padEnd(ch.length, '\u0000');
  }
  return out.replace(/[️⃣]/g, '\u0000'); // keycap digits: 9️⃣ → 9 plus fillers
}

// 8 or more digits, each separated by at most a few spaces / dashes / dots / brackets / plus signs
// (HK numbers are 8 digits; with the country code longer). Slashes are not separators, so card numbers
// like 025/165 4/102 never add up.
const RUN = /\d(?:[\s\-.()+_*·~,\u0000]{0,3}\d){7,}/g;
// A date written with dashes or dots (2026-11-14) is 8 digits but not a number to call.
const DATE = /^\d{4}[\s\-.]{1,2}\d{1,2}[\s\-.]{1,2}\d{1,2}$/;
// Links that open a chat with a phone number.
const LINKS = /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|line\.me|weixin\.qq\.com)\/\S*/gi;

function spans(text: string): [number, number][] {
  const d = digitsOf(text);
  const out: [number, number][] = [];
  for (const m of d.matchAll(RUN)) {
    const s = m[0].replace(/\u0000/g, '');
    let end = m.index! + m[0].length;
    while (d[end] === '\u0000') end++; // the rest of the last digit's characters (keycap marks)
    if (!DATE.test(s)) out.push([m.index!, end]);
  }
  for (const m of text.matchAll(LINKS)) out.push([m.index!, m.index! + m[0].length]);
  return out.sort((a, b) => a[0] - b[0]);
}

/** True when the text contains a phone number or a chat link with one. */
export const hasPhone = (text: string | null | undefined) => !!text && spans(text).length > 0;

/** The text with every phone number or chat link replaced by ••••. */
export function maskPhones(text: string): string {
  let out = '', at = 0;
  for (const [s, e] of spans(text)) {
    if (s < at) continue;
    out += `${text.slice(at, s)}••••`;
    at = e;
  }
  return out + text.slice(at);
}
