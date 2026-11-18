// Share backgrounds: what's behind the card on the share picture, the link-preview image and the shared
// page. The admin picks a preset or uploads a picture, for all cards and optionally per category.
export interface Preset { id: string; from: string; to: string; label: [string, string] }

export const PRESETS: Preset[] = [
  { id: 'midnight', from: '#121633', to: '#2b308f', label: ['午夜藍', 'Midnight'] },
  { id: 'sunset', from: '#3b0d2e', to: '#e8573a', label: ['日落', 'Sunset'] },
  { id: 'forest', from: '#0b2a1f', to: '#1f8a5b', label: ['森林', 'Forest'] },
  { id: 'ocean', from: '#06233d', to: '#1478c7', label: ['海洋', 'Ocean'] },
  { id: 'gold', from: '#2a1d05', to: '#b8860b', label: ['金色', 'Gold'] },
  { id: 'electric', from: '#2a2100', to: '#e0a800', label: ['電氣黃', 'Electric'] },
  { id: 'court', from: '#2b1306', to: '#c4561c', label: ['球場', 'Court'] },
  { id: 'graphite', from: '#0d0d10', to: '#3b3d46', label: ['石墨', 'Graphite'] },
];

/** A background choice: a preset by id, or an uploaded picture by its store key. */
export type Bg = { kind: 'preset'; id: string } | { kind: 'image'; key: string };

/** `uploads`: the admin's uploaded backgrounds (newest first), offered as choices. */
export interface ThemeConfig { all: Bg; byCategory: Record<string, Bg>; uploads: string[] }

export const DEFAULT_THEME: ThemeConfig = { all: { kind: 'preset', id: 'midnight' }, byCategory: {}, uploads: [] };

/** What to draw: two gradient colours, or a picture (with the default gradient underneath while it loads). */
export interface ResolvedBg { from: string; to: string; image: string | null }

export const imageUrl = (key: string) => `/s/img/${key}`;

export function resolveBg(cfg: ThemeConfig, categoryId?: string | null): ResolvedBg {
  const bg = (categoryId && cfg.byCategory[categoryId]) || cfg.all;
  if (bg.kind === 'image') return { from: PRESETS[0].from, to: PRESETS[0].to, image: imageUrl(bg.key) };
  const p = PRESETS.find((x) => x.id === bg.id) ?? PRESETS[0];
  return { from: p.from, to: p.to, image: null };
}

export const BG_KEY = /^theme\/[a-f0-9]{16}\.(jpg|png|webp)$/;

/** Validate a Bg from a request; null when it isn't one. */
export function cleanBg(v: unknown): Bg | null {
  const o = v as { kind?: unknown; id?: unknown; key?: unknown } | null;
  if (o?.kind === 'preset' && typeof o.id === 'string' && PRESETS.some((p) => p.id === o.id)) return { kind: 'preset', id: o.id };
  if (o?.kind === 'image' && typeof o.key === 'string' && BG_KEY.test(o.key)) return { kind: 'image', key: o.key };
  return null;
}
