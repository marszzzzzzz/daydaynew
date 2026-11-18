'use client';
import { useT } from '@/lib/i18n';
import type { DealStatus } from '@/lib/types';
import { Badge } from './ui';

const TONE: Record<DealStatus, 'warn' | 'ok' | 'neutral' | 'danger' | 'brand'> = {
  OPEN: 'warn', ACCEPTED: 'ok', COMPLETED: 'brand', DECLINED: 'neutral', WITHDRAWN: 'neutral', CANCELLED: 'danger',
};

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const { t } = useT();
  return <Badge tone={TONE[status]}>{t(`dstatus.${status}`)}</Badge>;
}

export const isLive = (s: DealStatus) => s === 'OPEN' || s === 'ACCEPTED';
