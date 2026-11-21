/**
 * Shared slug derivation used by any resource whose create request requires
 * a URL-safe `slug` alongside a human-entered `name` (orgs, services, ...).
 * The backend's slug pattern is the same everywhere it appears:
 * `^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$` (lowercase letters, digits, and
 * internal hyphens only, no leading/trailing hyphen), max 64 chars.
 */
export function deriveSlug(name: string, fallback = "resource"): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    // A long, punctuation-free name (the backend allows names up to 120
    // chars) would otherwise produce a slug the backend rejects with a 422
    // for exceeding max_length=64. Truncating can expose a trailing hyphen
    // (e.g. "...word-rest" cut mid-word is fine, but a cut right at a
    // hyphen boundary isn't), so strip trailing hyphens again afterward.
    .slice(0, 64)
    .replace(/-+$/, "");
  // A name made entirely of punctuation/non-ASCII (e.g. "---" or "日本語")
  // strips down to nothing, which the backend's pattern rejects. Fall back
  // to a fixed, always-valid slug rather than sending an empty string; a
  // collision with an existing slug surfaces as the same 409 any other
  // slug collision does.
  return slug.length > 0 ? slug : fallback;
}
