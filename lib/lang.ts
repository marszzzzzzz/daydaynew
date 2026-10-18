// The UI language for a visitor: their saved choice (bc_lang cookie), else the first of Chinese or English
// in the browser's Accept-Language list, by preference weight. Anything else falls back to Chinese.
export type Lang = 'zh' | 'en';

export function pickLang(cookie: string | undefined, acceptLanguage: string | null): Lang {
  if (cookie === 'en' || cookie === 'zh') return cookie;
  const prefs = (acceptLanguage ?? '').split(',').map((part, i) => {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    const q = Number(params.find((p) => p.trim().startsWith('q='))?.trim().slice(2) ?? 1);
    return { tag, q: Number.isFinite(q) ? q : 0, i };
  }).filter((p) => p.tag && p.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of prefs) {
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'zh';
}
