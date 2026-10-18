// Card photos in a private Vercel Blob store (spec §3, §9): written and read only through this app's API.
// Without BLOB_READ_WRITE_TOKEN (local development) photos fall back to a folder on disk.
import 'server-only';
import { del, get, put } from '@vercel/blob';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCAL = path.join(process.cwd(), '.data', 'photos');
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const hasPhotoStore = () => useBlob() || process.env.NODE_ENV !== 'production';

export async function savePhoto(pathname: string, data: Buffer, contentType: string) {
  if (useBlob()) {
    await put(pathname, data, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true });
    return pathname;
  }
  const file = path.join(LOCAL, pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return pathname;
}

export async function readPhoto(pathname: string): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  if (useBlob()) {
    const r = await get(pathname, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return { body: r.stream, contentType: r.blob.contentType ?? 'image/jpeg' };
  }
  try { return { body: await readFile(path.join(LOCAL, pathname)), contentType: 'image/jpeg' }; } catch { return null; }
}

export async function deletePhotos(pathnames: string[]) {
  if (!pathnames.length) return;
  try {
    if (useBlob()) await del(pathnames);
    else await Promise.all(pathnames.map((p) => rm(path.join(LOCAL, p), { force: true })));
  } catch (e) { console.error('photo delete failed', e); }
}

/** JPEG / PNG / WebP by their magic bytes (spec §11: the server checks the file header). */
export function sniffImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
