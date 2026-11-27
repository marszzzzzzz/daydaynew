// Browser-side API client. Every call goes to this site's /api proxy; the session cookie rides along.
'use client';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: unknown) {
    super(message);
  }
}

type Body = Record<string, unknown> | Blob | undefined;

export async function api<T>(path: string, init: { method?: string; body?: Body } = {}): Promise<T> {
  const { method = init.body ? 'POST' : 'GET', body } = init;
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  let res: Response;
  try {
    res = await fetch(`/api/${path.replace(/^\//, '')}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': isBlob ? body.type || 'application/octet-stream' : 'application/json' },
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Network error', 0, 'NETWORK');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string; data?: unknown };
    throw new ApiError(e.error ?? `Request failed (${res.status})`, res.status, e.code, e.data);
  }
  return data as T;
}

/** SWR fetcher: a signed-out visitor gets null instead of an error. */
export const fetcher = async <T,>(path: string): Promise<T | null> => {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
};
