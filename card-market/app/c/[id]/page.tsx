// Public page behind a share link: anyone can open it (no account), and Facebook / WhatsApp / Telegram /
// Line / X read its preview tags. It shows the signed card summary and leads to the full listing.
import type { Metadata } from 'next';
import { ShareLanding } from '@/components/share/ShareLanding';
import { readShare } from '@/lib/share';
import { imageUrl, resolveBg } from '@/lib/theme';
import { readTheme } from '@/lib/theme-server';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

const money = (p: number | null, c: string) => (p === null ? '' : `${c === 'HKD' ? 'HK$' : `${c} `}${p.toLocaleString('en-HK')}`);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  const p = readShare(t, id);
  const title = p ? `${p.n}${p.p !== null ? ` · ${money(p.p, p.c)}` : ''}` : '日日新卡市 · Card Market';
  const description = p ? [p.d, p.sn && `限號 ${p.sn}`, p.s && `賣家 ${p.s}`, '日日新卡市：實體卡玩家之間直接買賣'].filter(Boolean).join(' · ')
    : '實體卡，玩家之間直接買賣 — Real cards, traded player to player.';
  const image = `/c/${encodeURIComponent(id)}/og${p && t ? `?t=${encodeURIComponent(t)}` : ''}`;
  return {
    title, description,
    robots: { index: false }, // shared cards are not for search engines
    openGraph: { title, description, type: 'website', siteName: '日日新卡市', images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function SharedCard({ params, searchParams }: Props) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  const card = readShare(t, id);
  return <ShareLanding id={id} card={card} bg={resolveBg(await readTheme(), card?.ci)} photo={card?.ph ? imageUrl(card.ph) : null} />;
}
