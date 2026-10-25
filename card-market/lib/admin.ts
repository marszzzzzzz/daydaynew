// Server-only: the admin area. Admins sign in with their normal Card Pool account; the accounts allowed in
// are listed in CARD_MARKET_ADMINS. This server then talks to Card Pool's admin API with its own admin
// session (from CARD_POOL_ADMIN_PASSWORD), which never reaches the browser.
import { UPSTREAM } from './session';

export interface Caller { id: string; name: string }

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * CARD_MARKET_ADMINS: comma-separated entries, each an account id (`id:usr_…`, safest: an id never changes)
 * or an account name (names can be changed, so a freed name could pass to someone else).
 */
export function adminList(raw = process.env.CARD_MARKET_ADMINS ?? '') {
  const ids = new Set<string>(), names = new Set<string>();
  for (const entry of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (entry.startsWith('id:')) ids.add(entry.slice(3).trim());
    else names.add(norm(entry));
  }
  return { ids, names };
}

export function isAdmin(c: Caller | null, raw?: string) {
  if (!c) return false;
  const { ids, names } = adminList(raw);
  return ids.has(c.id) || names.has(norm(c.name));
}

/** Who is signed in on this site (asks Card Pool with their own session); null if nobody or suspended. */
export async function caller(token: string | undefined): Promise<Caller | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${UPSTREAM}/api/me`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const me = (await res.json()) as { user?: { id?: string; name?: string } };
    return me.user?.id && me.user.name ? { id: me.user.id, name: me.user.name } : null;
  } catch {
    return null;
  }
}

export const adminConfigured = () => !!process.env.CARD_POOL_ADMIN_PASSWORD;

// One Card Pool admin session per server instance, made on first use and remade if Card Pool drops it.
let adminToken: Promise<string> | null = null;
function login(): Promise<string> {
  adminToken ??= (async () => {
    const res = await fetch(`${UPSTREAM}/api/admin/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: process.env.CARD_POOL_ADMIN_PASSWORD ?? '' }), cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { token?: string };
    if (!res.ok || !data.token) throw new Error(`admin login refused (${res.status})`);
    return data.token;
  })();
  adminToken.catch(() => { adminToken = null; });
  return adminToken;
}

/** Call Card Pool's admin API; retried once with a fresh admin session if the old one was dropped. */
export async function adminFetch(path: string, init: { method: string; body?: ArrayBuffer; type?: string | null }) {
  for (let attempt = 0; ; attempt++) {
    const token = await login();
    const headers = new Headers({ authorization: `Bearer ${token}`, accept: 'application/json' });
    if (init.type) headers.set('content-type', init.type);
    const res = await fetch(`${UPSTREAM}/api/admin/${path}`, { method: init.method, headers, body: init.body, cache: 'no-store', redirect: 'manual' });
    if (res.status !== 401 || attempt > 0) return res;
    adminToken = null;
  }
}

/** For this site's own admin routes: the signed-in caller if they are on the admin list, else null. */
export async function adminCaller(token: string | undefined) {
  const who = await caller(token);
  return isAdmin(who) ? who : null;
}
