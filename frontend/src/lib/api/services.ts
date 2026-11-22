/**
 * Services API functions. Mapped onto the backend's actual response shape
 * (`backend/app/modules/services/schemas.py`'s `ServiceOut`: snake_case
 * `created_at`/`updated_at`/`repository_url`, plus `slug`/`status`/`org_id`)
 * and its paginated list envelope (`app/core/pagination.py`'s `Page`),
 * translated into the minimal shapes the frontend consumes for now.
 */

import { apiRequest } from "./client";
import { deriveSlug } from "../slug";

export type ServiceStatus = "unknown" | "healthy" | "degraded" | "down";

// Widened to the full backend record (see `ServiceOut` in
// `backend/app/modules/services/schemas.py`) rather than keeping a separate,
// richer type just for `getService`. `listServices`/`createService`/
// `updateService` already receive all of these fields from the backend on
// every response; they just used to throw most of them away. Carrying them
// through means list rows now have real `repository_url`/`status` values
// too, which lets `ServicesListPage`'s edit dialog pre-populate those fields
// correctly instead of always seeding them blank/"unknown".
export interface Service {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ServiceStatus;
  repository_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface ServiceResponse {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ServiceStatus;
  repository_url: string | null;
  created_at: string;
  updated_at: string;
}

function toService(dto: ServiceResponse): Service {
  return {
    id: dto.id,
    org_id: dto.org_id,
    name: dto.name,
    slug: dto.slug,
    description: dto.description,
    status: dto.status,
    repository_url: dto.repository_url,
    created_at: dto.created_at,
    updated_at: dto.updated_at,
  };
}

export async function listServices(
  orgId: string,
  page: { limit: number; offset: number },
): Promise<Page<Service>> {
  const query = new URLSearchParams({
    limit: String(page.limit),
    offset: String(page.offset),
  });
  const dto = await apiRequest<Page<ServiceResponse>>(
    `/organizations/${orgId}/services?${query.toString()}`,
  );
  return {
    items: dto.items.map(toService),
    total: dto.total,
    limit: dto.limit,
    offset: dto.offset,
  };
}

export async function createService(
  orgId: string,
  data: { name: string; description?: string; repository_url?: string },
): Promise<Service> {
  // `CreateServiceRequest.slug` is required by the backend but isn't part
  // of this task's public interface; derive it from the name the same way
  // `createOrganization` does (same slug pattern on the backend).
  const slug = deriveSlug(data.name, "service");
  const body: Record<string, unknown> = { name: data.name, slug };
  if (data.description) {
    body.description = data.description;
  }
  if (data.repository_url) {
    body.repository_url = data.repository_url;
  }
  const dto = await apiRequest<ServiceResponse>(`/organizations/${orgId}/services`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toService(dto);
}

export async function updateService(
  orgId: string,
  serviceId: string,
  data: Partial<{
    name: string;
    description: string;
    status: ServiceStatus;
    repository_url: string;
  }>,
): Promise<Service> {
  const dto = await apiRequest<ServiceResponse>(
    `/organizations/${orgId}/services/${serviceId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
  return toService(dto);
}

export async function deleteService(orgId: string, serviceId: string): Promise<void> {
  await apiRequest<void>(`/organizations/${orgId}/services/${serviceId}`, {
    method: "DELETE",
  });
}

export async function getService(orgId: string, serviceId: string): Promise<Service> {
  const dto = await apiRequest<ServiceResponse>(
    `/organizations/${orgId}/services/${serviceId}`,
  );
  return toService(dto);
}
