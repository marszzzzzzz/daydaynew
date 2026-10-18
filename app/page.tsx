'use client';
// Home (spec §10): signed out — what it does and sign in / sign up; signed in — today's follow-ups, newest cards, drafts.
import Link from 'next/link';
import useSWR from 'swr';
import { ContactRow } from '@/components/ContactRow';
import { ButtonLink, Loading, Panel } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { Contact } from '@/lib/types';

export default function Home() {
  const { me } = useMe();
  if (me === undefined) return <Loading />;
  return me ? <Dashboard /> : <Landing />;
}

function Landing() {
  const { t } = useT();
  const steps = [['📷', 'how.1.t', 'how.1.d'], ['🗂️', 'how.2.t', 'how.2.d'], ['💬', 'how.3.t', 'how.3.d']] as const;
  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t('hero.title')}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">{t('hero.sub')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/signup">{t('hero.start')}</ButtonLink>
        <ButtonLink href="/login" variant="secondary">{t('nav.signin')}</ButtonLink>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {steps.map(([icon, title, desc]) => (
          <Panel key={title}>
            <div className="text-3xl">{icon}</div>
            <h2 className="mt-2 font-bold">{t(title)}</h2>
            <p className="mt-1 text-sm text-muted">{t(desc)}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">🔒 {t('landing.privacy')}</p>
    </div>
  );
}

function Dashboard() {
  const { t } = useT();
  const { me } = useMe();
  const { data: due } = useSWR<{ contacts: Contact[] } | null>('contacts?due=1&sort=followup&limit=20', fetcher);
  const { data: recent } = useSWR<{ contacts: Contact[] } | null>('contacts?sort=new&limit=6', fetcher);
  const s = me!.stats;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('home.hi', { name: me!.user.displayName || me!.user.name })}</h1>
          <p className="mt-1 text-sm text-muted">{t('home.stats', { n: s.contacts })}</p>
        </div>
        <ButtonLink href="/scan" className="text-base">📷 {t('home.scan')}</ButtonLink>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat href="/contacts" n={s.contacts} label={t('home.contacts')} />
        <Stat href="/contacts?due=1" n={s.due} label={t('home.due')} tone={s.due ? 'danger' : undefined} />
        <Stat href="/messages" n={s.drafts} label={t('home.drafts')} />
      </div>

      <section>
        <h2 className="mb-2 font-bold">⏰ {t('home.dueToday')}</h2>
        {!due ? <Loading /> : due.contacts.length ? (
          <ul className="grid gap-2">{due.contacts.map((c) => <ContactRow key={c.id} c={c} />)}</ul>
        ) : <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t('home.noDue')}</p>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">{t('home.recent')}</h2>
          <Link href="/contacts" className="text-sm font-semibold text-brand">{t('home.all')} →</Link>
        </div>
        {!recent ? <Loading /> : recent.contacts.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">{recent.contacts.map((c) => <ContactRow key={c.id} c={c} />)}</ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-muted">{t('home.empty')}</p>
            <div className="mt-4 flex justify-center gap-2">
              <ButtonLink href="/scan">📷 {t('home.scan')}</ButtonLink>
              <ButtonLink href="/contacts/new" variant="secondary">{t('list.new')}</ButtonLink>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const Stat = ({ href, n, label, tone }: { href: string; n: number; label: string; tone?: 'danger' }) => (
  <Link href={href} className="rounded-2xl border border-line bg-surface p-4 text-center hover:border-brand">
    <div className={`text-2xl font-bold ${tone === 'danger' ? 'text-danger' : ''}`}>{n}</div>
    <div className="text-xs text-muted">{label}</div>
  </Link>
);
