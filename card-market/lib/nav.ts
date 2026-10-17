const BASE = 'https://self.invalid';

/**
 * Only same-site paths may be used as a post-login destination. Browsers drop tab/CR/LF and read "\" as "/"
 * while parsing a URL ("/\t/evil.example" becomes "//evil.example"), so resolve the value and compare origins
 * instead of checking prefixes.
 */
export function safeNext(v: string | null) {
  if (!v || !v.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(v)) return '/';
  try {
    const u = new URL(v, BASE);
    return u.origin === BASE ? `${u.pathname}${u.search}${u.hash}` : '/';
  } catch {
    return '/';
  }
}
