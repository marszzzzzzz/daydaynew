'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from './api';
import type { Me, Tag, Template } from './types';

/** The signed-in account, or null when signed out. `undefined` while loading. */
export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me | null>('me', fetcher, { refreshInterval: 60_000 });
  return { me: data, error, isLoading, mutate };
}

export function useTags() {
  const { data, mutate } = useSWR<{ tags: Tag[] } | null>('tags', fetcher);
  return { tags: data?.tags ?? [], mutate, loaded: !!data };
}

export function useTemplates() {
  const { data, mutate } = useSWR<{ templates: Template[] } | null>('templates', fetcher);
  return { templates: data?.templates ?? [], mutate, loaded: !!data };
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

export const todayHK = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
