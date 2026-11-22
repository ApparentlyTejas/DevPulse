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

// ---------------------------------------------------------------------------
// Membership management. Mapped onto `MembershipOut` in
// `backend/app/modules/organizations/schemas.py`: a membership row nests the
// user (`id`/`email`/`full_name`) and carries `role` (`OrgRole`: "owner" |
// "admin" | "member") and `created_at`.
// ---------------------------------------------------------------------------

export type MemberRole = "owner" | "admin" | "member";

export interface Member {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: MemberRole;
  createdAt: string;
}

interface MembershipResponse {
  id: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  };
  role: MemberRole;
  created_at: string;
}

function toMember(dto: MembershipResponse): Member {
  return {
    id: dto.id,
    userId: dto.user.id,
    email: dto.user.email,
    fullName: dto.user.full_name,
    role: dto.role,
    createdAt: dto.created_at,
  };
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const dtos = await apiRequest<MembershipResponse[]>(`/organizations/${orgId}/members`);
  return dtos.map(toMember);
}

/**
 * Adds a member by raw user ID. The backend's `AddMemberRequest.role`
 * defaults to `OrgRole.MEMBER`, so it's intentionally omitted from the
 * request body here -- there's no role picker in the "add member" form
 * (per the task spec, it only takes a user ID).
 */
export async function addMember(orgId: string, userId: string): Promise<Member> {
  const dto = await apiRequest<MembershipResponse>(`/organizations/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
  return toMember(dto);
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: MemberRole,
): Promise<Member> {
  const dto = await apiRequest<MembershipResponse>(
    `/organizations/${orgId}/members/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
  return toMember(dto);
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await apiRequest<void>(`/organizations/${orgId}/members/${userId}`, {
    method: "DELETE",
  });
}
