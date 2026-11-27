const BASE = 'https://self.invalid';
/** Our own destinations are plain paths: /, /sell, /sell/new, /listing/<id>, /deals/<id>, /account. */
const PLAIN_PATH = /^(\/[A-Za-z0-9_-]+)*\/?$/;

/**
 * Only same-site paths may be used as a post-sign-in destination. Browsers drop tab/CR/LF, read "\" as "/" and
 * resolve "." / ".." / "%2e" segments ("/..//evil.example" becomes "//evil.example"), and the router may decode
 * once more, so the resolved path must be made of plain segments only. Query and fragment cannot change the origin.
 */
export function safeNext(v: string | null) {
  if (!v || !v.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(v)) return '/';
  let u: URL;
  try {
    u = new URL(v, BASE);
  } catch {
    return '/';
  }
  return u.origin === BASE && PLAIN_PATH.test(u.pathname) ? `${u.pathname}${u.search}${u.hash}` : '/';
}
