/**
 * Rewrite dead/old 5movierulz hosts to the live MOVIES_RULSZ mirror.
 * Keeps path/query; swaps origin only.
 */
export function normalizeMovierulzUrl(
  url: string | null | undefined,
  mirrorBase: string,
): string | null {
  if (!url?.trim()) return null;
  try {
    const src = new URL(url.trim());
    if (!/5movierulz\./i.test(src.hostname)) return url.trim();
    const base = new URL(mirrorBase.endsWith('/') ? mirrorBase : `${mirrorBase}/`);
    return `${base.origin}${src.pathname}${src.search}${src.hash}`;
  } catch {
    return url.trim();
  }
}
