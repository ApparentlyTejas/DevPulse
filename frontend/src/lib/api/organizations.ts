/**
 * Organizations API functions. Mapped onto the backend's actual response
 * shape (`backend/app/modules/organizations/schemas.py`'s `OrgOut`: snake_case
 * `created_at`/`updated_at`, plus `slug`), translated into the minimal `Org`
 * shape the frontend consumes for now.
 */

import { apiRequest } from "./client";

export interface Org {
  id: string;
  name: string;
}

interface OrgResponse {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function toOrg(dto: OrgResponse): Org {
  return { id: dto.id, name: dto.name };
}

/**
 * Derives a URL-safe slug from an org name for `createOrganization`'s
 * request body: the backend's `CreateOrgRequest.slug` is required and must
 * match `^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$` (lowercase letters,
 * digits, and internal hyphens only, no leading/trailing hyphen).
 */
export function deriveSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    // The backend's `CreateOrgRequest.slug` has `max_length=64`; a long,
    // punctuation-free name (the backend allows names up to 120 chars)
    // would otherwise produce a slug the backend rejects with a 422.
    // Truncating can expose a trailing hyphen (e.g. "...word-rest" cut
    // mid-word is fine, but a cut right at a hyphen boundary isn't), so
    // strip trailing hyphens again after truncating.
    .slice(0, 64)
    .replace(/-+$/, "");
  // A name made entirely of punctuation/non-ASCII (e.g. "---" or "日本語")
  // strips down to nothing, which the backend's pattern rejects. Fall back
  // to a fixed, always-valid slug rather than sending an empty string; a
  // collision with an existing "org" slug surfaces as the same 409 any
  // other slug collision does.
  return slug.length > 0 ? slug : "org";
}

export async function listOrganizations(): Promise<Org[]> {
  const dtos = await apiRequest<OrgResponse[]>("/organizations");
  return dtos.map(toOrg);
}

export async function createOrganization(name: string): Promise<Org> {
  const slug = deriveSlug(name);
  const dto = await apiRequest<OrgResponse>("/organizations", {
    method: "POST",
    body: JSON.stringify({ name, slug }),
  });
  return toOrg(dto);
}
