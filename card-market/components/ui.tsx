'use client';
// Small UI kit: buttons, fields, badges, notices and an in-page confirm dialog
// (embedded browsers silently refuse window.confirm).
import Link from 'next/link';
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useT } from '@/lib/i18n';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-surface text-danger border border-line hover:bg-danger-soft',
};
const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none';

export function Button({ variant = 'primary', className, busy, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || busy} className={cx(BTN, VARIANTS[variant], className)}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={cx(BTN, VARIANTS[variant], className)}>{children}</Link>;
}

export const Spinner = () => <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;

const FIELD = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none';

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(FIELD, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(FIELD, !className?.includes('min-h-') && 'min-h-24', className)} />
);
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(FIELD, 'pr-8', className)} />;

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  brand: 'bg-brand text-brand-ink',
};
export const Badge = ({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>{children}</span>
);

export function Notice({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t = tone === 'neutral' ? 'bg-surface-2 text-ink' : TONES[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-xl px-4 py-3 text-sm', t, className)}>{children}</div>;
}

export const Panel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cx('rounded-2xl border border-line bg-surface p-4 sm:p-5', className)}>{children}</section>
);

export function Loading() {
  const { t } = useT();
  return <div className="flex items-center gap-2 py-10 text-muted"><Spinner /> {t('common.loading')}</div>;
}

export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t, errorText } = useT();
  return (
    <Notice tone="danger" className="flex flex-wrap items-center justify-between gap-3">
      <span>{t('common.error', { msg: errorText(error) })}</span>
      {retry && <Button variant="secondary" onClick={retry}>{t('common.retry')}</Button>}
    </Notice>
  );
}

export function ConfirmDialog({ open, message, confirmLabel, danger, busy, onConfirm, onClose }: {
  open: boolean; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50">
      <p className="text-[15px] leading-relaxed">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t('confirm.no')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel ?? t('confirm.yes')}</Button>
      </div>
    </dialog>
  );
}

export const PageTitle = ({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
    {action}
  </div>
);
