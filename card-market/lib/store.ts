// Server-only file store for share assets: public copies of shared card photos, admin-uploaded share
// backgrounds and the share-theme settings. Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production),
// else a local .data/ folder (development and tests). Everything is read back through this site
// (/s/img/…), so pages never depend on where the files live.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCAL = path.join(process.cwd(), '.data', 'store');
const blob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Keys are short, plain paths: share/<id>/<hash>.jpg, theme/<hash>.png, config/share-theme-<hash>.json. */
export const KEY = /^(share\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{16}\.(jpg|png|webp)|theme\/[a-f0-9]{16}\.(jpg|png|webp)|config\/share-theme-[a-f0-9]{16}\.json)$/;

export const hashKey = (data: ArrayBuffer | Uint8Array) => createHash('sha256').update(new Uint8Array(data as ArrayBuffer)).digest('hex').slice(0, 16);

export async function putFile(key: string, data: ArrayBuffer | Uint8Array | string, contentType: string, maxAge: number) {
  if (!KEY.test(key)) throw new Error(`bad key ${key}`);
  if (blob()) {
    const { put } = await import('@vercel/blob');
    const body = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer);
    await put(key, body, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType, cacheControlMaxAge: maxAge });
    return;
  }
  const file = path.join(LOCAL, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer));
  await writeFile(`${file}.type`, contentType);
}

export async function getFile(key: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  if (!KEY.test(key)) return null;
  try {
    if (blob()) {
      const { head } = await import('@vercel/blob');
      const meta = await head(key).catch(() => null);
      if (!meta) return null;
      const res = await fetch(meta.url, { cache: 'no-store' });
      return res.ok ? { body: await res.arrayBuffer(), type: meta.contentType } : null;
    }
    const file = path.join(LOCAL, key);
    const [body, type] = await Promise.all([readFile(file), readFile(`${file}.type`, 'utf8')]);
    return { body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer, type };
  } catch {
    return null;
  }
}

export async function hasFile(key: string) {
  if (!KEY.test(key)) return false;
  if (blob()) {
    const { head } = await import('@vercel/blob');
    return !!(await head(key).catch(() => null));
  }
  try { await readFile(path.join(LOCAL, `${key}.type`)); return true; } catch { return false; }
}

/** Files under a folder (e.g. 'config/'), newest first. Listing is never served from a CDN cache. */
export async function listFiles(prefix: string): Promise<{ key: string; at: number }[]> {
  if (blob()) {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix, limit: 100 });
    return blobs.map((b) => ({ key: b.pathname, at: new Date(b.uploadedAt).getTime() })).sort((a, b) => b.at - a.at);
  }
  try {
    const dir = path.join(LOCAL, prefix);
    const names = (await readdir(dir)).filter((n) => !n.endsWith('.type'));
    const out = await Promise.all(names.map(async (n) => ({ key: `${prefix}${n}`, at: (await stat(path.join(dir, n))).mtimeMs })));
    return out.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function deleteFiles(keys: string[]) {
  if (!keys.length) return;
  if (blob()) {
    const { del } = await import('@vercel/blob');
    await del(keys);
    return;
  }
  for (const k of keys) await Promise.all([rm(path.join(LOCAL, k), { force: true }), rm(path.join(LOCAL, `${k}.type`), { force: true })]);
}

/** JPEG / PNG / WebP by their first bytes (the declared type is not trusted). */
export function sniffImage(b: Uint8Array): { ext: 'jpg' | 'png' | 'webp'; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: 'webp', type: 'image/webp' };
  return null;
}
