// Contacts: input cleaning, reads with phones / e-mails / tags / photos attached, writes, merge (spec §3, §5, §11).
import 'server-only';
import { validE164 } from '@/lib/phone';
import type { CardLanguage, Contact, ContactFields, Email, Phone, PhoneKind, PhotoSide, Tag } from '@/lib/types';
import { deletePhotos } from './blob';
import { db, type Sql, type Tx } from './db';
import { HttpError, date, email as cleanEmail, id, longText, now, text } from './http';

export const MAX_CONTACTS = 5000;
const KINDS: PhoneKind[] = ['MOBILE', 'OFFICE', 'FAX', 'OTHER'];
const LANGS: CardLanguage[] = ['en', 'zh', 'ja', 'ko', 'other'];

type Scalar = Omit<ContactFields, 'phones' | 'emails' | 'tagIds'> & { ocrText: string; source: string; archived: boolean };
const COLUMNS: Record<keyof Scalar, string> = {
  nameZh: 'name_zh', nameEn: 'name_en', title: 'title', titleEn: 'title_en', company: 'company', companyEn: 'company_en',
  department: 'department', address: 'address', website: 'website', notes: 'notes', metAt: 'met_at', metOn: 'met_on',
  followUpOn: 'follow_up_on', starred: 'starred', language: 'language', ocrText: 'ocr_text', source: 'source', archived: 'archived',
};
const LIMITS: Partial<Record<keyof Scalar, number>> = {
  nameZh: 60, nameEn: 80, title: 80, titleEn: 120, company: 120, companyEn: 160, department: 80, address: 300, website: 200, notes: 2000, metAt: 120, ocrText: 4000,
};

/** Validate a (partial) contact body into column values. Only keys present in the body are returned. */
export function cleanFields(b: Record<string, unknown>, partial: boolean) {
  const cols: Record<string, unknown> = {};
  for (const k of Object.keys(COLUMNS) as (keyof Scalar)[]) {
    if (!(k in b)) { if (partial) continue; }
    const v = b[k];
    const col = COLUMNS[k];
    if (k === 'starred' || k === 'archived') cols[col] = !!v;
    else if (k === 'metOn' || k === 'followUpOn') cols[col] = date(v, k);
    else if (k === 'language') cols[col] = LANGS.includes(v as CardLanguage) ? v : 'en';
    else if (k === 'source') cols[col] = ['SCAN', 'MANUAL', 'IMPORT'].includes(v as string) ? v : 'MANUAL';
    else if (k === 'notes' || k === 'ocrText' || k === 'address') cols[col] = longText(v, LIMITS[k]!, k);
    else cols[col] = text(v, LIMITS[k] ?? 200, k);
  }
  let phones: Phone[] | undefined;
  if ('phones' in b) {
    if (!Array.isArray(b.phones) || b.phones.length > 10) throw new HttpError(400, 'Up to 10 phone numbers', 'BAD_REQUEST');
    const seen = new Set<string>();
    phones = [];
    for (const p of b.phones as Record<string, unknown>[]) {
      const e164 = text(p?.e164, 16, 'phone');
      if (!validE164(e164)) throw new HttpError(400, `Not a valid phone number: ${e164 || '(empty)'}`, 'BAD_PHONE', { e164 });
      if (seen.has(e164)) continue;
      seen.add(e164);
      const kind = KINDS.includes(p.kind as PhoneKind) ? (p.kind as PhoneKind) : 'OTHER';
      phones.push({ kind, e164, raw: text(p.raw, 40, 'phone'), whatsapp: !!p.whatsapp && kind !== 'FAX', isPrimary: !!p.isPrimary });
    }
    if (phones.length && !phones.some((p) => p.isPrimary)) phones[0].isPrimary = true;
  }
  let emails: Email[] | undefined;
  if ('emails' in b) {
    if (!Array.isArray(b.emails) || b.emails.length > 10) throw new HttpError(400, 'Up to 10 e-mail addresses', 'BAD_REQUEST');
    const seen = new Set<string>();
    emails = [];
    for (const e of b.emails as Record<string, unknown>[]) {
      const v = cleanEmail(e?.email);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      emails.push({ email: v, isPrimary: !!e.isPrimary });
    }
    if (emails.length && !emails.some((e) => e.isPrimary)) emails[0].isPrimary = true;
  }
  let tagIds: string[] | undefined;
  if ('tagIds' in b) {
    if (!Array.isArray(b.tagIds) || b.tagIds.length > 100) throw new HttpError(400, 'Bad tags', 'BAD_REQUEST');
    tagIds = [...new Set((b.tagIds as unknown[]).map((x) => text(x, 40, 'tag')))].filter(Boolean);
  }
  return { cols, phones, emails, tagIds };
}

interface Row {
  id: string; name_zh: string; name_en: string; title: string; title_en: string; company: string; company_en: string; department: string;
  address: string; website: string; notes: string; met_at: string; met_on: string | null; follow_up_on: string | null; starred: boolean;
  language: CardLanguage; ocr_text: string; source: Contact['source']; archived: boolean; created_at: string; updated_at: string;
  phones: { kind: PhoneKind; e164: string; raw: string; whatsapp: boolean; is_primary: boolean }[] | null;
  emails: { email: string; is_primary: boolean }[] | null;
  tags: Tag[] | null; photos: { side: PhotoSide; at: string }[] | null;
}

const d = (v: string | null) => (v ? String(v).slice(0, 10) : '');

export function toContact(r: Row): Contact {
  const photos = r.photos ?? [];
  return {
    id: r.id, nameZh: r.name_zh, nameEn: r.name_en, title: r.title, titleEn: r.title_en, company: r.company, companyEn: r.company_en,
    department: r.department, address: r.address, website: r.website, notes: r.notes, metAt: r.met_at, metOn: d(r.met_on), followUpOn: d(r.follow_up_on),
    starred: r.starred, language: r.language, ocrText: r.ocr_text, source: r.source, archived: r.archived,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
    phones: (r.phones ?? []).map((p) => ({ kind: p.kind, e164: p.e164, raw: p.raw, whatsapp: p.whatsapp, isPrimary: p.is_primary })),
    emails: (r.emails ?? []).map((e) => ({ email: e.email, isPrimary: e.is_primary })),
    tags: r.tags ?? [], tagIds: (r.tags ?? []).map((t) => t.id),
    photos: photos.map((p) => p.side).sort(), photoV: Math.max(0, ...photos.map((p) => Number(p.at))),
  };
}

/** SELECT list with the child rows folded in as JSON (one round trip). */
const SELECT = `
  c.id, c.name_zh, c.name_en, c.title, c.title_en, c.company, c.company_en, c.department, c.address, c.website, c.notes,
  c.met_at, to_char(c.met_on, 'YYYY-MM-DD') AS met_on, to_char(c.follow_up_on, 'YYYY-MM-DD') AS follow_up_on, c.starred, c.language,
  c.ocr_text, c.source, c.archived, c.created_at, c.updated_at,
  (SELECT json_agg(json_build_object('kind', p.kind, 'e164', p.e164, 'raw', p.raw, 'whatsapp', p.whatsapp, 'is_primary', p.is_primary) ORDER BY p.is_primary DESC, p.pos) FROM contact_phone p WHERE p.contact_id = c.id) AS phones,
  (SELECT json_agg(json_build_object('email', e.email, 'is_primary', e.is_primary) ORDER BY e.is_primary DESC, e.pos) FROM contact_email e WHERE e.contact_id = c.id) AS emails,
  (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name) FROM contact_tag ct JOIN tag t ON t.id = ct.tag_id WHERE ct.contact_id = c.id) AS tags,
  (SELECT json_agg(json_build_object('side', ph.side, 'at', ph.uploaded_at)) FROM contact_photo ph WHERE ph.contact_id = c.id) AS photos`;

export async function getContact(userId: string, cid: string, sql?: Sql | Tx): Promise<Contact> {
  sql ??= await db();
  const [r] = await sql.unsafe<Row[]>(`SELECT ${SELECT} FROM contact c WHERE c.id = $1 AND c.user_id = $2`, [cid, userId]);
  if (!r) throw new HttpError(404, 'Contact not found', 'NOT_FOUND');
  return toContact(r);
}

export interface ListOpts { q?: string; tags?: string[]; starred?: boolean; wa?: boolean; hasEmail?: boolean; due?: boolean; archived?: boolean; sort?: string; offset?: number; limit?: number; ids?: string[] }

const SORTS: Record<string, string> = {
  new: 'c.created_at DESC', updated: 'c.updated_at DESC',
  name: "COALESCE(NULLIF(c.name_en, ''), c.name_zh) ASC, c.created_at DESC",
  company: "COALESCE(NULLIF(c.company_en, ''), c.company) ASC, c.created_at DESC",
  followup: 'c.follow_up_on ASC NULLS LAST, c.updated_at DESC',
};

export async function listContacts(userId: string, o: ListOpts) {
  const sql = await db();
  const where = ['c.user_id = $1'];
  const args: unknown[] = [userId];
  const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
  if (o.ids?.length) where.push(`c.id = ANY(${arg(o.ids)}::text[])`);
  else where.push(`c.archived = ${o.archived ? 'true' : 'false'}`);
  if (o.q) {
    const q = o.q.slice(0, 60).replace(/[\\%_]/g, (m) => `\\${m}`);
    const like = arg(`%${q}%`);
    const parts = [`(c.name_zh || ' ' || c.name_en || ' ' || c.company || ' ' || c.company_en || ' ' || c.title || ' ' || c.title_en || ' ' || c.notes || ' ' || c.met_at || ' ' || c.ocr_text) ILIKE ${like}`,
      `EXISTS (SELECT 1 FROM contact_email e WHERE e.contact_id = c.id AND e.email ILIKE ${like})`];
    const digits = o.q.replace(/\D/g, '');
    if (digits.length >= 3) parts.push(`EXISTS (SELECT 1 FROM contact_phone p WHERE p.contact_id = c.id AND p.e164 LIKE ${arg(`%${digits}%`)})`);
    where.push(`(${parts.join(' OR ')})`);
  }
  if (o.tags?.length) where.push(`EXISTS (SELECT 1 FROM contact_tag ct WHERE ct.contact_id = c.id AND ct.tag_id = ANY(${arg(o.tags)}::text[]))`);
  if (o.starred) where.push('c.starred');
  if (o.wa) where.push('EXISTS (SELECT 1 FROM contact_phone p WHERE p.contact_id = c.id AND p.whatsapp)');
  if (o.hasEmail) where.push('EXISTS (SELECT 1 FROM contact_email e WHERE e.contact_id = c.id)');
  if (o.due) where.push(`c.follow_up_on IS NOT NULL AND c.follow_up_on <= (now() AT TIME ZONE 'Asia/Hong_Kong')::date`);
  const limit = Math.min(Math.max(o.limit ?? 50, 1), 5000);
  const offset = Math.max(o.offset ?? 0, 0);
  const rows = await sql.unsafe<Row[]>(
    `SELECT ${SELECT} FROM contact c WHERE ${where.join(' AND ')} ORDER BY ${SORTS[o.sort ?? ''] ?? SORTS.new} LIMIT ${limit + 1} OFFSET ${offset}`, args as never[]);
  const more = rows.length > limit;
  return { contacts: rows.slice(0, limit).map(toContact), nextCursor: more ? String(offset + limit) : null };
}

async function checkTags(sql: Sql | Tx, userId: string, tagIds: string[]) {
  if (!tagIds.length) return;
  const rows = await sql`SELECT id FROM tag WHERE user_id = ${userId} AND id = ANY(${tagIds}::text[])`;
  if (rows.length !== tagIds.length) throw new HttpError(400, 'Unknown tag', 'BAD_TAG');
}

async function writeChildren(tx: Tx, cid: string, userId: string, f: { phones?: Phone[]; emails?: Email[]; tagIds?: string[] }) {
  if (f.phones) {
    await tx`DELETE FROM contact_phone WHERE contact_id = ${cid}`;
    for (const [i, p] of f.phones.entries()) {
      await tx`INSERT INTO contact_phone (id, contact_id, kind, e164, raw, whatsapp, is_primary, pos) VALUES (${id('ph')}, ${cid}, ${p.kind}, ${p.e164}, ${p.raw}, ${p.whatsapp}, ${p.isPrimary}, ${i})`;
    }
  }
  if (f.emails) {
    await tx`DELETE FROM contact_email WHERE contact_id = ${cid}`;
    for (const [i, e] of f.emails.entries()) {
      await tx`INSERT INTO contact_email (id, contact_id, email, is_primary, pos) VALUES (${id('em')}, ${cid}, ${e.email}, ${e.isPrimary}, ${i})`;
    }
  }
  if (f.tagIds) {
    await checkTags(tx, userId, f.tagIds);
    await tx`DELETE FROM contact_tag WHERE contact_id = ${cid}`;
    for (const t of f.tagIds) await tx`INSERT INTO contact_tag (contact_id, tag_id) VALUES (${cid}, ${t}) ON CONFLICT DO NOTHING`;
  }
}

export async function createContact(userId: string, b: Record<string, unknown>) {
  const f = cleanFields(b, false);
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM contact WHERE user_id = ${userId}`;
  if (n >= MAX_CONTACTS) throw new HttpError(400, `Up to ${MAX_CONTACTS} contacts per account`, 'LIMIT');
  const cid = id('ct');
  const t = now();
  await sql.begin(async (tx) => {
    const cols = { ...f.cols, id: cid, user_id: userId, created_at: t, updated_at: t };
    await tx`INSERT INTO contact ${tx(cols as unknown as Record<string, string>)}`;
    await writeChildren(tx, cid, userId, f);
  });
  return getContact(userId, cid);
}

export async function updateContact(userId: string, cid: string, b: Record<string, unknown>) {
  const f = cleanFields(b, true);
  const sql = await db();
  await sql.begin(async (tx) => {
    const cols = { ...f.cols, updated_at: now() };
    const r = await tx`UPDATE contact SET ${tx(cols as unknown as Record<string, string>)} WHERE id = ${cid} AND user_id = ${userId} RETURNING id`;
    if (!r.length) throw new HttpError(404, 'Contact not found', 'NOT_FOUND');
    await writeChildren(tx, cid, userId, f);
  });
  return getContact(userId, cid);
}

export async function deleteContacts(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const sql = await db();
  const photos = await sql<{ blob_path: string }[]>`
    SELECT ph.blob_path FROM contact_photo ph JOIN contact c ON c.id = ph.contact_id WHERE c.user_id = ${userId} AND c.id = ANY(${ids}::text[])`;
  const r = await sql`DELETE FROM contact WHERE user_id = ${userId} AND id = ANY(${ids}::text[]) RETURNING id`;
  await deletePhotos(photos.map((p) => p.blob_path));
  return r.length;
}

/** Contacts sharing a phone or an e-mail with the given ones (for the "possible duplicate" hint, spec §4.4). */
export async function matchContacts(userId: string, phones: string[], emails: string[], exclude?: string) {
  const sql = await db();
  const rows = await sql<{ id: string }[]>`
    SELECT DISTINCT c.id FROM contact c
    LEFT JOIN contact_phone p ON p.contact_id = c.id
    LEFT JOIN contact_email e ON e.contact_id = c.id
    WHERE c.user_id = ${userId} AND c.id <> ${exclude ?? ''}
      AND (p.e164 = ANY(${phones}::text[]) OR e.email = ANY(${emails.map((x) => x.toLowerCase())}::text[]))
    LIMIT 5`;
  if (!rows.length) return [];
  return (await listContacts(userId, { ids: rows.map((r) => r.id), limit: 5 })).contacts;
}

/** Groups of probable duplicates: same phone, same e-mail, or same name + company (spec §5). */
export async function findDuplicates(userId: string) {
  const sql = await db();
  const pairs = await sql<{ a: string; b: string; reason: string }[]>`
    SELECT p1.contact_id AS a, p2.contact_id AS b, 'phone' AS reason FROM contact_phone p1
      JOIN contact_phone p2 ON p1.e164 = p2.e164 AND p1.contact_id < p2.contact_id
      JOIN contact c1 ON c1.id = p1.contact_id JOIN contact c2 ON c2.id = p2.contact_id
      WHERE c1.user_id = ${userId} AND c2.user_id = ${userId} AND NOT c1.archived AND NOT c2.archived
    UNION
    SELECT e1.contact_id, e2.contact_id, 'email' FROM contact_email e1
      JOIN contact_email e2 ON e1.email = e2.email AND e1.contact_id < e2.contact_id
      JOIN contact c1 ON c1.id = e1.contact_id JOIN contact c2 ON c2.id = e2.contact_id
      WHERE c1.user_id = ${userId} AND c2.user_id = ${userId} AND NOT c1.archived AND NOT c2.archived
    UNION
    SELECT c1.id, c2.id, 'name' FROM contact c1 JOIN contact c2 ON c1.user_id = c2.user_id AND c1.id < c2.id
      WHERE c1.user_id = ${userId} AND NOT c1.archived AND NOT c2.archived
        AND lower(c1.name_zh || '|' || c1.name_en) = lower(c2.name_zh || '|' || c2.name_en) AND (c1.name_zh <> '' OR c1.name_en <> '')
        AND lower(c1.company || '|' || c1.company_en) = lower(c2.company || '|' || c2.company_en)
    LIMIT 2000`;
  // Union-find into groups.
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const reasons = new Map<string, Set<string>>();
  for (const { a, b, reason } of pairs) {
    parent.set(find(a), find(b));
    for (const x of [a, b]) { if (!reasons.has(x)) reasons.set(x, new Set()); reasons.get(x)!.add(reason); }
  }
  const groups = new Map<string, string[]>();
  for (const x of reasons.keys()) { const r = find(x); groups.set(r, [...(groups.get(r) ?? []), x]); }
  const all = [...groups.values()].slice(0, 100);
  const ids = all.flat();
  const contacts = ids.length ? (await listContacts(userId, { ids, limit: ids.length })).contacts : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return all.map((g) => ({
    reasons: [...new Set(g.flatMap((x) => [...(reasons.get(x) ?? [])]))],
    contacts: g.map((x) => byId.get(x)!).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt),
  })).filter((g) => g.contacts.length > 1);
}

/**
 * Merge (spec §5): `fields` are the values chosen to keep; phones, e-mails, tags, photos (sides the kept contact
 * lacks) and message history of the merged contacts all move to the kept one, then the merged contacts are deleted.
 */
export async function mergeContacts(userId: string, keepId: string, mergeIds: string[], fields: Record<string, unknown>) {
  mergeIds = [...new Set(mergeIds)].filter((x) => x !== keepId);
  if (!mergeIds.length) throw new HttpError(400, 'Nothing to merge', 'BAD_REQUEST');
  const sql = await db();
  const all = (await listContacts(userId, { ids: [keepId, ...mergeIds], limit: 50 })).contacts;
  const keep = all.find((c) => c.id === keepId);
  const others = all.filter((c) => c.id !== keepId);
  if (!keep || others.length !== mergeIds.length) throw new HttpError(404, 'Contact not found', 'NOT_FOUND');
  const phones = [...keep.phones];
  for (const p of others.flatMap((c) => c.phones)) if (!phones.some((x) => x.e164 === p.e164)) phones.push({ ...p, isPrimary: false });
  const emails = [...keep.emails];
  for (const e of others.flatMap((c) => c.emails)) if (!emails.some((x) => x.email === e.email)) emails.push({ ...e, isPrimary: false });
  const tagIds = [...new Set([...keep.tagIds, ...others.flatMap((c) => c.tagIds)])];
  const notes = [keep.notes, ...others.map((c) => c.notes)].filter(Boolean);
  const body = { ...fields, phones: phones.slice(0, 10), emails: emails.slice(0, 10), tagIds };
  if (!('notes' in fields) && notes.length > 1) (body as Record<string, unknown>).notes = [...new Set(notes)].join('\n').slice(0, 2000);
  const f = cleanFields(body, true);
  const orphanPhotos: string[] = [];
  await sql.begin(async (tx) => {
    await tx`UPDATE contact SET ${tx({ ...f.cols, updated_at: now() } as unknown as Record<string, string>)} WHERE id = ${keepId} AND user_id = ${userId}`;
    await writeChildren(tx, keepId, userId, f);
    for (const side of ['FRONT', 'BACK'] as PhotoSide[]) {
      if (keep.photos.includes(side)) continue;
      const donor = others.find((c) => c.photos.includes(side));
      if (donor) await tx`UPDATE contact_photo SET contact_id = ${keepId} WHERE contact_id = ${donor.id} AND side = ${side}`;
    }
    const left = await tx<{ blob_path: string }[]>`SELECT blob_path FROM contact_photo WHERE contact_id = ANY(${mergeIds}::text[])`;
    orphanPhotos.push(...left.map((r) => r.blob_path));
    await tx`UPDATE message SET contact_id = ${keepId} WHERE contact_id = ANY(${mergeIds}::text[]) AND user_id = ${userId}`;
    await tx`UPDATE message SET attach_vcard_of = ${keepId} WHERE attach_vcard_of = ANY(${mergeIds}::text[]) AND user_id = ${userId}`;
    await tx`UPDATE share_link SET contact_id = ${keepId} WHERE contact_id = ANY(${mergeIds}::text[]) AND user_id = ${userId}`;
    await tx`DELETE FROM contact WHERE id = ANY(${mergeIds}::text[]) AND user_id = ${userId}`;
  });
  await deletePhotos(orphanPhotos);
  return getContact(userId, keepId);
}
