// Server-only: reading and saving the share-theme settings (lib/theme.ts) in the file store.
// Each save writes a new file that never changes (config/share-theme-<hash>.json) and reading takes the
// newest, so no CDN copy can serve old settings; a few older versions are kept, the rest removed.
import { deleteFiles, getFile, hashKey, listFiles, putFile } from './store';
import { BG_KEY, DEFAULT_THEME, cleanBg, type Bg, type ThemeConfig } from './theme';

const PREFIX = 'config/';
const KEEP = 5;
let cache: { at: number; cfg: ThemeConfig } | null = null;

export async function readTheme(): Promise<ThemeConfig> {
  if (cache && Date.now() - cache.at < 5_000) return cache.cfg;
  let cfg = DEFAULT_THEME;
  try {
    const latest = (await listFiles(PREFIX)).find((f) => f.key.startsWith(`${PREFIX}share-theme-`));
    const f = latest ? await getFile(latest.key) : null;
    if (f) cfg = parseTheme(JSON.parse(new TextDecoder().decode(f.body))) ?? DEFAULT_THEME;
  } catch (e) {
    console.error('[share-theme] read failed, using the default', e);
  }
  cache = { at: Date.now(), cfg };
  return cfg;
}

export async function saveTheme(cfg: ThemeConfig) {
  const json = JSON.stringify(cfg);
  const key = `${PREFIX}share-theme-${hashKey(new TextEncoder().encode(`${Date.now()}:${json}`))}.json`;
  await putFile(key, json, 'application/json', 31536000);
  cache = { at: Date.now(), cfg };
  const old = (await listFiles(PREFIX)).filter((f) => f.key.startsWith(`${PREFIX}share-theme-`) && f.key !== key).slice(KEEP - 1);
  await deleteFiles(old.map((f) => f.key)).catch(() => undefined);
}

/** A whole settings object from a request, or null if anything in it is not valid. */
export function parseTheme(v: unknown): ThemeConfig | null {
  const o = v as { all?: unknown; byCategory?: unknown; uploads?: unknown } | null;
  const all = cleanBg(o?.all);
  if (!all || typeof o?.byCategory !== 'object' || o.byCategory === null) return null;
  const byCategory: Record<string, Bg> = {};
  for (const [k, b] of Object.entries(o.byCategory as Record<string, unknown>).slice(0, 50)) {
    const bg = cleanBg(b);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(k) || !bg) return null;
    byCategory[k] = bg;
  }
  const uploads = Array.isArray(o.uploads) ? [...new Set(o.uploads.filter((k): k is string => typeof k === 'string' && BG_KEY.test(k)))].slice(0, 24) : [];
  return { all, byCategory, uploads };
}
