'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from './api';
import type { AppConfig, Me } from './types';

/** The signed-in account, or null when signed out. `undefined` while loading. */
export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me | null>('me', fetcher, { refreshInterval: 30_000 });
  return { me: data, error, isLoading, mutate };
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
