'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ApiError, fetcher } from './api';
import type { AppConfig, Me } from './types';

/** The signed-in account, or null when signed out. `undefined` while loading. */
export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me | null>('me', fetcher, { refreshInterval: 30_000 });
  // A suspended account is signed in but locked out: pages offer sign-out instead of a retry loop.
  const blocked = error instanceof ApiError && error.code === 'ACCOUNT_SUSPENDED' ? error : null;
  return { me: data, error, isLoading, mutate, blocked };
}

export interface AdminSession { signedIn: boolean; admin: boolean; configured: boolean; id: string | null; name: string | null }

/** Whether the signed-in account may use the admin area (app/api/admin). */
export function useAdminSession(enabled = true) {
  const { data } = useSWR<AdminSession | null>(enabled ? 'admin/session' : null, fetcher, { revalidateOnFocus: false });
  return data ?? null;
}

/** Public config: categories, regions, currency. */
export function useConfig() {
  const { data } = useSWR<AppConfig | null>('config', fetcher, { revalidateOnFocus: false });
  return data ?? null;
}

/** The value, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
