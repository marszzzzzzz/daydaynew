// vCard 3.0 (spec §5 export, §7.3 share links). CRLF line ends; commas, semicolons, backslashes and new lines escaped.
import type { Email, Phone } from './types';

export interface VCardInput {
  nameZh: string; nameEn: string; title: string; titleEn: string; company: string; companyEn: string;
  department?: string; address: string; website: string; notes?: string; phones: Phone[]; emails: Email[];
}

export const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const HAN = /\p{Script=Han}/u;

/** Family and given name: "Peter Chan" → Chan / Peter; "陳大文" → 陳 / 大文 (one-character surname). */
export function splitName(nameZh: string, nameEn: string): { family: string; given: string } {
  if (nameEn.trim()) {
    const w = nameEn.trim().split(/\s+/);
    if (w.length === 1) return { family: '', given: w[0] };
    // "CHAN Tai Man" (surname in capitals first) vs "Peter Chan" (surname last).
    if (/^[A-Z]{2,}$/.test(w[0]) && w.slice(1).some((x) => /[a-z]/.test(x))) return { family: w[0], given: w.slice(1).join(' ') };
    return { family: w[w.length - 1], given: w.slice(0, -1).join(' ') };
  }
  const z = nameZh.trim();
  if (z && HAN.test(z)) return { family: z.slice(0, 1), given: z.slice(1) };
  return { family: '', given: z };
}

const TEL: Record<Phone['kind'], string> = { MOBILE: 'CELL', OFFICE: 'WORK', FAX: 'FAX', OTHER: 'VOICE' };

export function toVCard(c: VCardInput): string {
  const { family, given } = c.nameEn ? splitName('', c.nameEn) : splitName(c.nameZh, '');
  const fn = [c.nameZh, c.nameEn].filter(Boolean).join(' ') || c.company || c.companyEn || 'Contact';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(given)};;;`, `FN:${esc(fn)}`];
  if (c.nameZh && c.nameEn) lines.push(`NICKNAME:${esc(c.nameZh)}`);
  const org = c.company || c.companyEn;
  if (org) lines.push(`ORG:${esc(org)}${c.department ? `;${esc(c.department)}` : ''}`);
  const title = [c.title, c.titleEn].filter(Boolean).join(' ');
  if (title) lines.push(`TITLE:${esc(title)}`);
  for (const p of c.phones) lines.push(`TEL;TYPE=${TEL[p.kind]}${p.isPrimary ? ',PREF' : ''}:${p.e164}`);
  for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET${e.isPrimary ? ',PREF' : ''}:${e.email}`);
  if (c.website) lines.push(`URL:${esc(/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`)}`);
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${esc(c.address)};;;;`);
  const note = [c.company && c.companyEn ? c.companyEn : '', c.notes ?? ''].filter(Boolean).join('\n');
  if (note) lines.push(`NOTE:${esc(note)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/** File name for a .vcf download: letters, digits and CJK only. */
export const vcfName = (c: { nameZh: string; nameEn: string }) =>
  `${(c.nameEn || c.nameZh || 'contact').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'contact'}.vcf`;
