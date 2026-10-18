// Accounts (spec §9): scrypt (N=2^15) password hashes, a random session token in an httpOnly cookie (only its hash
// is stored), five failed sign-ins lock the account for 15 minutes.
import 'server-only';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { User } from '@/lib/types';
import { db } from './db';
import { HttpError } from './http';

export const COOKIE = 'bc_session';
const SESSION_DAYS = 30;
const N = 1 << 15, R = 8, P = 1, KEYLEN = 32;

function scrypt(pw: string, salt: Buffer) {
  return new Promise<Buffer>((res, rej) => scryptCb(pw, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize('NFKC'), salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, , , , salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(pw.normalize('NFKC'), Buffer.from(salt, 'base64url'));
  const want = Buffer.from(hash, 'base64url');
  return want.length === key.length && timingSafeEqual(want, key);
}

const tokenHash = (t: string) => createHash('sha256').update(`${process.env.SESSION_SECRET ?? ''}:${t}`).digest('base64url');

export async function createSession(userId: string) {
  const sql = await db();
  const token = randomBytes(32).toString('base64url');
  const t = Date.now();
  await sql`INSERT INTO app_session (token_hash, user_id, expires_at, created_at) VALUES (${tokenHash(token)}, ${userId}, ${t + SESSION_DAYS * 864e5}, ${t})`;
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const sql = await db();
    await sql`DELETE FROM app_session WHERE token_hash = ${tokenHash(token)}`;
  }
  jar.delete(COOKIE);
}

export interface UserRow {
  id: string; name: string; password_hash: string; display_name: string; whatsapp: string | null; email: string | null;
  email_verified_at: string | null; signature: string; default_country: string; ui_lang: string;
  my_title: string; my_company: string; my_website: string; my_address: string; failed_logins: number; locked_until: string;
}

export const toUser = (u: UserRow): User => ({
  id: u.id, name: u.name, displayName: u.display_name, whatsapp: u.whatsapp, email: u.email, emailVerified: !!u.email_verified_at,
  signature: u.signature, defaultCountry: u.default_country, uiLang: u.ui_lang === 'en' ? 'en' : 'zh',
  myTitle: u.my_title, myCompany: u.my_company, myWebsite: u.my_website, myAddress: u.my_address,
});

/** The signed-in user's row, or null. */
export async function currentUser(_req?: NextRequest): Promise<UserRow | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sql = await db();
  const [u] = await sql<UserRow[]>`
    SELECT u.* FROM app_session s JOIN app_user u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > ${Date.now()}`;
  return u ?? null;
}

export async function requireUser(req?: NextRequest): Promise<UserRow> {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in', 'UNAUTHENTICATED');
  return u;
}

/** Login names: NFKC, 2–24 characters, letters/digits/._- and CJK; compared case-insensitively. */
export function cleanName(v: unknown) {
  const s = typeof v === 'string' ? v.normalize('NFKC').trim() : '';
  if (s.length < 2 || s.length > 24 || !/^[\p{L}\p{N}._-]+$/u.test(s)) throw new HttpError(400, 'Name must be 2–24 letters, digits, . _ or -', 'BAD_NAME');
  return s;
}

export function checkPassword(v: unknown) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw new HttpError(400, 'Password must be at least 8 characters', 'WEAK_PASSWORD');
  return v;
}
