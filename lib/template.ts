// Message templates (spec §8.3) and the plain-text business card (spec §7.3).
import { splitScripts } from './bizcard';
import { formatPhone } from './phone';
import type { Email, Phone } from './types';

export const VARIABLES = ['name', 'name_zh', 'name_en', 'company', 'title', 'met_at', 'met_on', 'my_name', 'my_company', 'my_whatsapp', 'my_email', 'signature'] as const;
export type Variable = (typeof VARIABLES)[number];

export interface VarContact { nameZh: string; nameEn: string; company: string; companyEn: string; title: string; titleEn: string; metAt: string; metOn: string }
export interface VarMe { displayName: string; name: string; myCompany: string; whatsapp: string | null; email: string | null; signature: string }

export function variables(c: VarContact | null, me: VarMe | null): Record<Variable, string> {
  return {
    name: c ? c.nameZh || c.nameEn : '',
    name_zh: c?.nameZh ?? '',
    name_en: c?.nameEn ?? '',
    company: c ? c.company || c.companyEn : '',
    title: c ? c.title || c.titleEn : '',
    met_at: c?.metAt ?? '',
    met_on: c?.metOn ?? '',
    my_name: me ? me.displayName || me.name : '',
    my_company: me?.myCompany ?? '',
    my_whatsapp: me?.whatsapp ? formatPhone(me.whatsapp) : '',
    my_email: me?.email ?? '',
    signature: me?.signature ?? '',
  };
}

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Fill {{variables}}. Known variables with a value are replaced; a known variable without a value is left in place
 * so the editor can flag it in yellow (spec §8.3); unknown names are left alone.
 */
export function fill(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(VAR_RE, (all, k: string) => {
    if (!(k in vars)) return all;
    if (vars[k]) return vars[k];
    missing.add(k);
    return all;
  });
  return { text: out, missing: [...missing] };
}

/** Variables still in the text (known ones only). */
export const unfilled = (text: string) => [...new Set([...text.matchAll(VAR_RE)].map((m) => m[1]).filter((k) => (VARIABLES as readonly string[]).includes(k)))];

/** Remove leftover {{variables}} (and the blank they leave). */
export const stripVars = (text: string) => text.replace(VAR_RE, '').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ');

export interface CardData { nameZh: string; nameEn: string; title: string; titleEn: string; company: string; companyEn: string; website: string; address: string; phones: Phone[]; emails: Email[] }

/** The text version of a business card for WhatsApp (spec §7.3). */
export function cardText(c: CardData): string {
  const pair = (a: string, b: string) => [a, b].filter(Boolean).join(' ');
  const mobile = c.phones.filter((p) => p.kind !== 'FAX');
  const lines = [
    pair(c.nameZh, c.nameEn),
    pair(c.title, c.titleEn),
    pair(c.company, c.companyEn),
    ...mobile.map((p) => `${p.kind === 'MOBILE' || p.whatsapp ? '📱' : '☎️'} ${formatPhone(p.e164)}`),
    ...c.phones.filter((p) => p.kind === 'FAX').map((p) => `📠 ${formatPhone(p.e164)}`),
    ...c.emails.map((e) => `✉️ ${e.email}`),
    c.website ? `🌐 ${c.website}` : '',
    c.address ? `📍 ${c.address}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** WhatsApp formatting preview: *bold*, _italic_, ~strike~ → HTML (input escaped first). */
export function waPreview(text: string) {
  const e = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return e
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*(?=$|[\s).,!?])/g, '$1<b>$2</b>')
    .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=$|[\s).,!?])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])~(\S(?:[^~\n]*\S)?)~(?=$|[\s).,!?])/g, '$1<s>$2</s>')
    .replace(/\n/g, '<br>');
}

/** Default templates (spec §8.3), Chinese and English. */
export const DEFAULT_TEMPLATES: { channel: 'WHATSAPP' | 'EMAIL'; name: string; subject: string; body: string }[] = [
  { channel: 'WHATSAPP', name: '初次認識跟進', subject: '', body: '{{name}} 你好！我是{{my_company}}的{{my_name}}，很高興在{{met_at}}認識你。之後有任何合作機會，歡迎隨時聯絡我 🙂\n\n{{signature}}' },
  { channel: 'WHATSAPP', name: 'Nice to meet you', subject: '', body: 'Hi {{name}}, this is {{my_name}} from {{my_company}}. Great meeting you at {{met_at}}! Let’s keep in touch — feel free to message me any time.\n\n{{signature}}' },
  { channel: 'EMAIL', name: '報價跟進', subject: '報價跟進 — {{my_company}}', body: '{{name}} 你好，\n\n多謝你早前的查詢。附上的報價不知道是否合適？如有任何問題或需要調整，歡迎回覆此電郵或 WhatsApp {{my_whatsapp}}。\n\n祝 生意興隆\n{{my_name}}\n{{signature}}' },
  { channel: 'EMAIL', name: 'Quotation follow-up', subject: 'Following up on our quotation — {{my_company}}', body: 'Dear {{name}},\n\nThank you for your interest. I wanted to follow up on the quotation we sent — please let me know if you have any questions or would like any changes.\n\nBest regards,\n{{my_name}}\n{{signature}}' },
  { channel: 'WHATSAPP', name: '節日問候', subject: '', body: '{{name}} 你好！祝你節日快樂、身體健康、生意興隆 🎉\n{{my_name}}（{{my_company}}）' },
  { channel: 'WHATSAPP', name: 'Season’s greetings', subject: '', body: 'Hi {{name}}, wishing you and your team a wonderful holiday season! 🎉\n{{my_name}} ({{my_company}})' },
  { channel: 'WHATSAPP', name: '發送我的名片', subject: '', body: '{{name}} 你好，這是我的聯絡資料：\n' },
  { channel: 'WHATSAPP', name: 'Send my card', subject: '', body: 'Hi {{name}}, here are my contact details:\n' },
];

/** The user's own card from their profile (display name / title / company may mix Chinese and English). */
export function userCard(u: { displayName: string; name: string; myTitle: string; myCompany: string; myAddress: string; myWebsite: string; whatsapp: string | null; email: string | null }): CardData {
  const n = splitScripts(u.displayName || u.name), tt = splitScripts(u.myTitle), c = splitScripts(u.myCompany);
  return {
    nameZh: n.zh, nameEn: n.en, title: tt.zh, titleEn: tt.en, company: c.zh, companyEn: c.en, address: u.myAddress, website: u.myWebsite,
    phones: u.whatsapp ? [{ kind: 'MOBILE', e164: u.whatsapp, raw: '', whatsapp: true, isPrimary: true }] : [],
    emails: u.email ? [{ email: u.email, isPrimary: true }] : [],
  };
}
