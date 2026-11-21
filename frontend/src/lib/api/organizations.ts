/**
 * Organizations API functions. Mapped onto the backend's actual response
 * shape (`backend/app/modules/organizations/schemas.py`'s `OrgOut`: snake_case
 * `created_at`/`updated_at`, plus `slug`), translated into the minimal `Org`
 * shape the frontend consumes for now.
 */

import { apiRequest } from "./client";
import { deriveSlug as deriveSlugShared } from "../slug";

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
 *
 * Shared with `services.ts` (same backend slug pattern) via `../slug`;
 * re-exported here so existing imports of `deriveSlug` from this module
 * keep working.
 */
export function deriveSlug(name: string): string {
  return deriveSlugShared(name, "org");
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
