'use client';
// What someone sees after tapping a shared link: the card summary from the link, then the way in.
// Signed in, the button opens the listing; otherwise it leads through sign-up to it.
import Link from 'next/link';
import { TagList } from '@/components/TagList';
import { useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { SharePayload } from '@/lib/share';
import type { ResolvedBg } from '@/lib/theme';

export function ShareLanding({ id, card: c, bg, photo }: { id: string; card: SharePayload | null; bg: ResolvedBg; photo: string | null }) {
  const { t, money } = useT();
  const { me } = useMe();
  const listing = `/listing/${encodeURIComponent(id)}${c ? `?q=${encodeURIComponent(Array.from(c.n).slice(0, 60).join(''))}` : ''}`;
  const go = me ? listing : `/signup?next=${encodeURIComponent(listing.split('?')[0])}`;

  return (
    <div className="mx-auto max-w-lg py-4">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${bg.from}, ${bg.to})` }}>
        {bg.image && <>
          <img src={bg.image} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/80" />
        </>}
        {photo ? (
          <img src={photo} alt={c?.n ?? ''} className="relative mx-auto mb-5 block w-56 rotate-2 rounded-2xl border-4 border-white/90 shadow-2xl" style={{ aspectRatio: '63 / 88', objectFit: 'cover' }} />
        ) : (
          <div aria-hidden className="pointer-events-none absolute -right-6 -bottom-10 flex gap-2 opacity-70">
            {['#FFCB05', '#8B5CF6', '#FF4D2E'].map((col, i) => <span key={col} className="h-24 w-16 rounded-lg border-2 border-white/70" style={{ background: col, transform: `rotate(${8 + i * 7}deg)` }} />)}
          </div>
        )}
        <div className="relative">
          {c ? (
            <>
              {c.l && <span className="inline-block rounded-full bg-[#34d27b] px-3 py-0.5 text-xs font-bold text-[#0b1f12]">{t('share.img.listed')}</span>}
              <h1 className="mt-2 text-3xl font-extrabold leading-tight">{c.n}</h1>
              {(c.cat || c.d) && <p className="mt-1 text-white/75">{[c.cat, c.d].filter(Boolean).join(' · ')}</p>}
              <TagList tags={c.g} serial={c.sn} t={t} className="mt-3" />
              {c.p !== null && <p className="mt-4 text-3xl font-bold text-accent">{money(c.p, c.c)}</p>}
              {c.s && <p className="mt-1 text-sm text-white/70">{t('listing.seller')}: {c.s}</p>}
            </>
          ) : (
            <h1 className="text-2xl font-extrabold">{t('hero.title')}</h1>
          )}
          <Link href={c ? go : me ? '/' : '/signup'} className="mt-6 inline-flex rounded-2xl bg-accent px-5 py-3 font-bold text-[#17192c]">
            {c ? t(me ? 'share.land.view' : 'share.land.join') : t('hero.start')}
          </Link>
          {c && <p className="mt-3 text-xs text-white/60">{t('share.land.note')}</p>}
        </div>
      </section>
      <p className="mt-4 text-center text-sm text-muted">{t('hero.sub')}</p>
    </div>
  );
}
