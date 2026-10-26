/**
 * Safely resolves the store/buy URL from environment variables.
 * Ensures the URL is absolute by prepending 'https://' if missing,
 * preventing browsers from treating relative strings (e.g. 'whopkey')
 * as local relative paths on clearer.trade.
 */
export function getBuyUrl(customUrl?: string): string {
  const rawUrl = customUrl || process.env.NEXT_PUBLIC_WHOP_URL;
  
  if (!rawUrl || !rawUrl.trim()) {
    return 'https://whop.com/clearertrade';
  }
  
  const trimmed = rawUrl.trim();
  
  // If it already has http:// or https://, return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  
  // Prepend https:// so the browser opens an external absolute URL
  return `https://${trimmed}`;
}
