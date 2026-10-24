// Link-preview image (1200×630) for a shared card: name, details, price and tags on the brand background.
// Chinese and Japanese need a CJK font: a subset with just this text is fetched from Google Fonts; if
// that fails the image still renders with the built-in font.
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { readShare } from '@/lib/share';

export const runtime = 'nodejs';

const TAGS: Record<string, string> = { AUTO: '簽名 Auto', PATCH: '球衣 Patch', MULTI: '多球員', ROOKIE: 'RC 新人', PARALLEL: '平行版', REFRACTOR: '折射', INSERT: 'Insert', SHORT_PRINT: 'SP', ERROR: '錯版' };

async function font(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&text=${encodeURIComponent(text)}`,
      { headers: { 'user-agent': 'Mozilla/5.0 (compatible; og)' } })).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype|woff)'\)/.exec(css)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = readShare(req.nextUrl.searchParams.get('t'), id);
  const price = p && p.p !== null ? `${p.c === 'HKD' ? 'HK$' : `${p.c} `}${p.p.toLocaleString('en-HK')}` : '';
  const tags = p ? [p.sn && `限號 ${p.sn}`, ...p.g.map((g) => TAGS[g] ?? g)].filter(Boolean).slice(0, 5) as string[] : [];
  const title = p?.n ?? '日日新卡市';
  const sub = p ? [p.cat, p.d].filter(Boolean).join(' · ') : '實體卡，玩家之間直接買賣';
  const brand = '日日新卡市 · DayDayNew Card Market';
  const data = await font([title, sub, price, ...tags, brand, '出售中', '查看及出價'].join(''));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(135deg,#121633 0%,#2b308f 100%)', color: '#fff', padding: 64, fontFamily: data ? 'CJK' : undefined }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {p?.l && <div style={{ display: 'flex', alignSelf: 'flex-start', background: '#34d27b', color: '#0b1f12', borderRadius: 999, padding: '6px 18px', fontSize: 26, fontWeight: 700 }}>出售中</div>}
            <div style={{ display: 'flex', fontSize: title.length > 18 ? 64 : 80, fontWeight: 700, marginTop: 24, lineHeight: 1.1, maxWidth: 760 }}>{title}</div>
            {sub && <div style={{ display: 'flex', fontSize: 32, opacity: 0.8, marginTop: 16, maxWidth: 760 }}>{sub}</div>}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', maxWidth: 760 }}>
                {tags.map((x) => <div key={x} style={{ display: 'flex', background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '6px 16px', fontSize: 26 }}>{x}</div>)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', maxWidth: 760 }}>
            <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: '#FFCB05' }}>{price}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 26, opacity: 0.75 }}>{brand}</div>
        </div>
        <div style={{ display: 'flex', width: 300, alignItems: 'center', justifyContent: 'center' }}>
          {['#FFCB05', '#8B5CF6', '#FF4D2E'].map((c, i) => (
            <div key={c} style={{ display: 'flex', position: 'absolute', width: 190, height: 266, borderRadius: 18, border: '6px solid rgba(255,255,255,0.85)', background: c, transform: `rotate(${-10 + i * 10}deg) translateX(${(i - 1) * 36}px)` }} />
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: data ? [{ name: 'CJK', data, weight: 700, style: 'normal' }] : undefined,
      headers: { 'cache-control': 'public, max-age=86400, immutable' } },
  );
}
