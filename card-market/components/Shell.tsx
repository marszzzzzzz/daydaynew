'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, MessageCircle, Shield, Tag, User, Store, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAdminSession, useMe } from '@/lib/hooks';
import { useT, type Key } from '@/lib/i18n';
import { SignOutButton } from './SignOut';

const NAV: { href: string; key: Key; icon: LucideIcon }[] = [
  { href: '/', key: 'nav.market', icon: Store },
  { href: '/sell', key: 'nav.sell', icon: Tag },
  { href: '/deals', key: 'nav.deals', icon: MessageCircle },
  { href: '/account', key: 'nav.account', icon: User },
];

const active = (path: string, href: string) => (href === '/' ? path === '/' || path.startsWith('/listing') : path.startsWith(href));

export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useT();
  const { me, blocked } = useMe();
  const path = usePathname();
  const badge = me?.dealsNeedingAttention ?? 0;
  const isAdmin = !!useAdminSession(!!me)?.admin;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="display flex items-center gap-2 text-base">
            <span aria-hidden className="grid size-7 place-items-center rounded-sm bg-shelf text-sm text-bg">卡</span>
            <span className="hidden sm:inline">{t('brand')}</span>
          </Link>
          {me && (
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} data-tour={n.href === '/sell' ? 'nav-sell' : undefined}
                  className={`relative px-3 py-1.5 text-sm font-medium ${active(path, n.href) ? 'text-ink after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:bg-shelf after:shadow-[0_0_12px_var(--glow)]' : 'text-muted hover:text-ink'}`}>
                  {t(n.key)}
                  {n.href === '/deals' && badge > 0 && <Dot n={badge} />}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* The camera is the main way in: one tap from every page. */}
            {me && !path.startsWith('/sell/batch') && (
              <Link href="/sell/batch" className="lamp flex items-center gap-1.5 rounded-lg bg-shelf px-3 py-1.5 text-sm font-medium text-bg">
                <Camera aria-hidden size={16} strokeWidth={1.75} />{t('start.short')}
              </Link>
            )}
            <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="rounded-lg px-2.5 py-1.5 text-sm text-muted hover:text-ink">
              {t('common.lang')}
            </button>
            {me === null && (
              <>
                <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-surface-2">{t('nav.signin')}</Link>
                <Link href="/signup" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink">{t('nav.signup')}</Link>
              </>
            )}
            {isAdmin && <Link href="/admin" className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${path.startsWith('/admin') ? 'bg-surface-2' : 'text-muted hover:text-ink'}`}><Shield aria-hidden size={16} strokeWidth={1.75} className="inline align-[-3px]" /><span className="hidden sm:inline"> {t('admin.nav')}</span></Link>}
            {me && <span className="hidden text-sm text-muted md:inline">{me.user.name}</span>}
            {blocked && <SignOutButton variant="ghost" />}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:pb-12">{children}</main>

      <footer className="hidden border-t border-line py-6 text-center text-xs text-muted sm:block">
        <p>{t('footer.noPayment')}</p>
        <p className="mt-1">{t('footer.shared')}</p>
      </footer>

      {me && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} data-tour={n.href === '/sell' ? 'nav-sell' : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active(path, n.href) ? 'text-ink' : 'text-muted'}`}>
              <n.icon aria-hidden size={20} strokeWidth={active(path, n.href) ? 2 : 1.5} />
              {t(n.key)}
              {n.href === '/deals' && badge > 0 && <Dot n={badge} />}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

const Dot = ({ n }: { n: number }) => (
  <span className="absolute -top-0.5 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">{n > 99 ? '99+' : n}</span>
);
