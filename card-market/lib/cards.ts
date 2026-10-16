// Card constants and small pure helpers (mirrors Card Pool's shared/rules where noted).
import type { CardLanguage, Condition, Me, PhotoSide, RealCard } from './types';

export const CONDITIONS: Condition[] = ['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'PLAYED', 'POOR'];
export const CARD_LANGUAGES: CardLanguage[] = ['en', 'zh', 'ja', 'ko', 'other'];

const GLYPHS: Record<string, string> = { bolt: '⚡', diamond: '⚾', hoop: '🏀', hat: '👒', ball: '⚽', eye: '👁' };
export const glyph = (g?: string | null) => (g && GLYPHS[g]) || '🃏';

/** Photo through the same-origin proxy (the session cookie authorises it). `v` busts the cache after a re-upload. */
export const photoUrl = (cardId: string, side: PhotoSide, v?: number) =>
  `/api/real-cards/${encodeURIComponent(cardId)}/photos/${side.toLowerCase()}${v ? `?v=${v}` : ''}`;

// WhatsApp — same rules as Card Pool shared/rules/phone.ts (the server re-checks).
export const WHATSAPP_COUNTRIES = [
  { code: '852', zh: '香港', en: 'Hong Kong' }, { code: '853', zh: '澳門', en: 'Macau' }, { code: '886', zh: '台灣', en: 'Taiwan' },
  { code: '86', zh: '中國內地', en: 'Mainland China' }, { code: '81', zh: '日本', en: 'Japan' }, { code: '82', zh: '韓國', en: 'Korea' },
  { code: '65', zh: '新加坡', en: 'Singapore' }, { code: '60', zh: '馬來西亞', en: 'Malaysia' }, { code: '66', zh: '泰國', en: 'Thailand' },
  { code: '63', zh: '菲律賓', en: 'Philippines' }, { code: '61', zh: '澳洲', en: 'Australia' }, { code: '44', zh: '英國', en: 'United Kingdom' },
  { code: '1', zh: '美國／加拿大', en: 'USA / Canada' },
] as const;

export function whatsAppLink(e164: string, text?: string) {
  return `https://wa.me/${e164.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function formatWhatsApp(e164: string) {
  const m = WHATSAPP_COUNTRIES.find((c) => e164.startsWith(`+${c.code}`));
  if (!m) return e164;
  const rest = e164.slice(m.code.length + 1);
  return `+${m.code} ${rest.length === 8 ? `${rest.slice(0, 4)} ${rest.slice(4)}` : rest}`;
}

/** Can this account list cards at all? (spec §8.1: password + WhatsApp) */
export const sellerReady = (me: Me | null | undefined) => !!me?.user.hasPassword && !!me?.user.whatsapp;

export type ListingState = 'live' | 'hidden' | 'removed' | 'needsPrice' | 'needsQty' | 'needsAccount';

/** Where a record stands in the market, from the seller's side (spec §8.1). */
export function listingState(c: RealCard, me: Me | null | undefined): ListingState {
  if (c.marketRemovedByAdmin) return 'removed';
  if (!c.marketPublic) return 'hidden';
  if (c.askingPrice === null) return 'needsPrice';
  if (c.listedQuantity < 1) return 'needsQty';
  if (!sellerReady(me)) return 'needsAccount';
  return 'live';
}

export const cardDetail = (c: { setName?: string; number?: string; grade?: string }) =>
  [c.setName, c.number, c.grade].filter(Boolean).join(' · ');
