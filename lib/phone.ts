// Phone numbers (spec §7.1): stored as E.164 (+85291234567), shown in local groups (+852 9123 4567).
// Moved here from card-market's lib/cards.ts (WHATSAPP_COUNTRIES, whatsAppLink, formatWhatsApp).

export const COUNTRIES = [
  { code: '852', zh: '香港', en: 'Hong Kong' }, { code: '853', zh: '澳門', en: 'Macau' }, { code: '886', zh: '台灣', en: 'Taiwan' },
  { code: '86', zh: '中國內地', en: 'Mainland China' }, { code: '81', zh: '日本', en: 'Japan' }, { code: '82', zh: '韓國', en: 'Korea' },
  { code: '65', zh: '新加坡', en: 'Singapore' }, { code: '60', zh: '馬來西亞', en: 'Malaysia' }, { code: '66', zh: '泰國', en: 'Thailand' },
  { code: '63', zh: '菲律賓', en: 'Philippines' }, { code: '61', zh: '澳洲', en: 'Australia' }, { code: '44', zh: '英國', en: 'United Kingdom' },
  { code: '1', zh: '美國／加拿大', en: 'USA / Canada' },
] as const;

export const E164 = /^\+[1-9][0-9]{6,14}$/;

/** Is this a valid E.164 number (with the stricter Hong Kong rule for +852)? */
export function validE164(e164: string) {
  if (!E164.test(e164)) return false;
  if (e164.startsWith('+852')) return /^\+852[2-9]\d{7}$/.test(e164);
  return true;
}

/** Hong Kong mobile (spec §4.3): 8 digits starting 5/6/7/9 (4 and 8 are also mobile ranges). */
export const isHkMobile = (local: string) => /^[4-9]\d{7}$/.test(local);

/**
 * Whatever was printed on the card → E.164, or null when it can't be read as a phone number.
 * Rules (spec §4.3): an explicit + or 00 prefix wins; a bare 8-digit 2–9 number is Hong Kong; 1[3-9]xxxxxxxxx is
 * mainland mobile; 09xxxxxxxx is Taiwan mobile; 0[789]0xxxxxxxx is Japan mobile; anything else uses the default country.
 */
export function toE164(raw: string, defaultCountry = '852'): string | null {
  const s = raw.normalize('NFKC').trim();
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  let out: string;
  if (/^\s*\+/.test(s)) out = `+${digits}`;
  else if (digits.startsWith('00')) out = `+${digits.slice(2)}`;
  else if (/^\(?852\)?/.test(s.replace(/\s/g, '')) && digits.length === 11) out = `+${digits}`;
  else if (/^[2-9]\d{7}$/.test(digits) && (defaultCountry === '852' || defaultCountry === '853')) out = `+${defaultCountry}${digits}`;
  else if (/^1[3-9]\d{9}$/.test(digits)) out = `+86${digits}`;
  else if (/^09\d{8}$/.test(digits)) out = `+886${digits.slice(1)}`;
  else if (/^0[789]0\d{8}$/.test(digits)) out = `+81${digits.slice(1)}`;
  else {
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (digits.startsWith(defaultCountry) && digits.length > 9) out = `+${digits}`;
    else out = `+${defaultCountry}${digits}`;
  }
  return validE164(out) ? out : null;
}

/** +852 9123 4567 · +86 138 1234 5678 · +81 90 1234 5678 · otherwise +cc rest. */
export function formatPhone(e164: string) {
  const m = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => e164.startsWith(`+${c.code}`));
  if (!m) return e164;
  const r = e164.slice(m.code.length + 1);
  if ((m.code === '852' || m.code === '853' || m.code === '65') && r.length === 8) return `+${m.code} ${r.slice(0, 4)} ${r.slice(4)}`;
  if (m.code === '86' && r.length === 11) return `+86 ${r.slice(0, 3)} ${r.slice(3, 7)} ${r.slice(7)}`;
  if (m.code === '886' && r.length === 9) return `+886 ${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6)}`;
  if (m.code === '81' && r.length === 10) return `+81 ${r.slice(0, 2)} ${r.slice(2, 6)} ${r.slice(6)}`;
  return `+${m.code} ${r}`;
}

/** wa.me link; with no number WhatsApp asks which chat to send to. Text may hold Chinese, emoji and new lines. */
export function waLink(e164: string | null | undefined, text?: string) {
  const n = (e164 ?? '').replace(/\D/g, '');
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${n}${q}`;
}

export const digitsOnly = (s: string) => s.replace(/\D/g, '');
