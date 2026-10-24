// Server-only: share links. A link carries a small, signed summary of the card (name, price, tags…) so the
// public preview page and the link-preview image can show it without any account, and nobody can make our
// domain show a card or price that isn't real. The summary is taken from Card Pool on the server when the
// link is made, never from the browser.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SharePayload {
  v: 1;
  id: string;
  n: string; // name
  d: string; // set · number · grade
  p: number | null; // asking price
  c: string; // currency
  s: string; // seller name
  cat: string; // category name
  g: string[]; // tags (preset codes or custom text)
  sn: string; // serial number (限號)
  l: boolean; // listed in the market when shared
}

function secret(): string | null {
  const s = process.env.SHARE_SECRET || (process.env.CARD_POOL_ADMIN_PASSWORD ? `share:${process.env.CARD_POOL_ADMIN_PASSWORD}` : '');
  if (s) return s;
  return process.env.NODE_ENV === 'production' ? null : 'dev-only-share-secret';
}

const b64 = (b: Buffer) => b.toString('base64url');
const mac = (key: string, data: string) => createHmac('sha256', key).update(data).digest().subarray(0, 18);

/** The `t` parameter of a share link, or null when no signing secret is set up. */
export function signShare(p: SharePayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64(Buffer.from(JSON.stringify(p)));
  return `${body}.${b64(mac(key, body))}`;
}

/** The card summary inside a share link, if it is genuine and belongs to this card id. */
export function readShare(token: string | null | undefined, id: string): SharePayload | null {
  const key = secret();
  if (!key || !token || token.length > 4000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = mac(key, body), got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SharePayload;
    return p.v === 1 && p.id === id ? p : null;
  } catch {
    return null;
  }
}
