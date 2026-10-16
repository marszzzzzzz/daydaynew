/** Only same-site paths may be used as a post-login destination (no //host or /\\host). */
export const safeNext = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/');
