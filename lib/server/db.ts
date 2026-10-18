// Postgres (Neon via the Vercel Marketplace, or any Postgres) with postgres.js. The schema (spec §3) is created on
// first use with IF NOT EXISTS, under an advisory lock, so a fresh database needs no manual migration step.
import 'server-only';
import postgres from 'postgres';
import { HttpError } from './http';

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_UNPOOLED;

declare global { var __bcSql: postgres.Sql | undefined; var __bcReady: Promise<void> | undefined }

function client() {
  if (!url) throw new HttpError(503, 'The database is not connected yet. In Vercel → Storage, connect a Neon Postgres database to this project.', 'NO_DATABASE');
  globalThis.__bcSql ??= postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false, onnotice: () => undefined });
  return globalThis.__bcSql;
}

export const hasDatabase = () => !!url;

export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  whatsapp TEXT CHECK (whatsapp IS NULL OR whatsapp ~ '^\\+[1-9][0-9]{6,14}$'),
  email TEXT,
  email_verified_at BIGINT,
  email_code_hash TEXT,
  email_code_expires BIGINT,
  signature TEXT NOT NULL DEFAULT '',
  default_country TEXT NOT NULL DEFAULT '852',
  ui_lang TEXT NOT NULL DEFAULT 'zh',
  my_title TEXT NOT NULL DEFAULT '',
  my_company TEXT NOT NULL DEFAULT '',
  my_website TEXT NOT NULL DEFAULT '',
  my_address TEXT NOT NULL DEFAULT '',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_name_lower ON app_user (lower(name));
CREATE TABLE IF NOT EXISTS app_session (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS app_session_user ON app_session(user_id);
CREATE TABLE IF NOT EXISTS contact (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name_zh TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  company_en TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  met_at TEXT NOT NULL DEFAULT '',
  met_on DATE,
  follow_up_on DATE,
  starred BOOLEAN NOT NULL DEFAULT false,
  language TEXT NOT NULL DEFAULT 'en',
  ocr_text TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'SCAN',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS contact_user ON contact(user_id, archived, updated_at DESC);
CREATE TABLE IF NOT EXISTS contact_phone (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  e164 TEXT NOT NULL,
  raw TEXT NOT NULL DEFAULT '',
  whatsapp BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  pos INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS contact_phone_contact ON contact_phone(contact_id);
CREATE INDEX IF NOT EXISTS contact_phone_e164 ON contact_phone(e164);
CREATE TABLE IF NOT EXISTS contact_email (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  pos INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS contact_email_contact ON contact_email(contact_id);
CREATE INDEX IF NOT EXISTS contact_email_email ON contact_email(email);
CREATE TABLE IF NOT EXISTS contact_photo (
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  blob_path TEXT NOT NULL,
  uploaded_at BIGINT NOT NULL,
  PRIMARY KEY (contact_id, side)
);
CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'slate',
  UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS contact_tag (
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
CREATE TABLE IF NOT EXISTS template (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  to_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  attach_vcard_of TEXT REFERENCES contact(id) ON DELETE SET NULL,
  attach_my_card BOOLEAN NOT NULL DEFAULT false,
  template_id TEXT REFERENCES template(id) ON DELETE SET NULL,
  provider_id TEXT,
  error TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  sent_at BIGINT
);
CREATE INDEX IF NOT EXISTS message_user ON message(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS message_contact ON message(contact_id);
CREATE TABLE IF NOT EXISTS share_link (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  views INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS email_block (
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, email)
);
`;

async function migrate(sql: postgres.Sql) {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(424242)`;
    await tx.unsafe(SCHEMA);
  });
  // Fuzzy search index (spec §5); optional — plain ILIKE still works without the extension.
  try {
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS contact_search_trgm ON contact USING gin ((name_zh || ' ' || name_en || ' ' || company || ' ' || company_en || ' ' || title || ' ' || title_en || ' ' || notes || ' ' || ocr_text) gin_trgm_ops)`);
  } catch { /* no permission for extensions: fine */ }
}

/** The ready-to-use client (schema created on the first call per instance). */
export async function db() {
  const sql = client();
  globalThis.__bcReady ??= migrate(sql).catch((e) => { globalThis.__bcReady = undefined; throw e; });
  await globalThis.__bcReady;
  return sql;
}

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
