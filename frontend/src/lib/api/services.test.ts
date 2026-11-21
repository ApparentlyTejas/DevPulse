import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setTokenGetter, setUnauthorizedHandler } from "./client";
import { createService, deleteService, listServices, updateService } from "./services";

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("services api", () => {
  beforeEach(() => {
    setTokenGetter(() => null);
    setUnauthorizedHandler(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("listServices passes limit/offset as query params and maps the page envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "svc-1",
            org_id: "org-1",
            name: "API",
            slug: "api",
            description: "The main API",
            status: "healthy",
            repository_url: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await listServices("org-1", { limit: 20, offset: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/organizations/org-1/services?limit=20&offset=0");
    expect(page).toEqual({
      items: [
        {
          id: "svc-1",
          org_id: "org-1",
          name: "API",
          slug: "api",
          description: "The main API",
          status: "healthy",
          repository_url: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  test("createService derives a slug and omits blank optional fields", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      return jsonResponse(
        {
          id: "svc-1",
          org_id: "org-1",
          name: body.name,
          slug: body.slug,
          description: null,
          status: "unknown",
          repository_url: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        201,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService("org-1", { name: "My Service" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ name: "My Service", slug: "my-service" });
    expect(service).toEqual({
      id: "svc-1",
      org_id: "org-1",
      name: "My Service",
      slug: "my-service",
      description: null,
      status: "unknown",
      repository_url: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
  });

  test("createService includes description and repository_url when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: "svc-1",
          org_id: "org-1",
          name: "My Service",
          slug: "my-service",
          description: "desc",
          status: "unknown",
          repository_url: "https://example.com/repo",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createService("org-1", {
      name: "My Service",
      description: "desc",
      repository_url: "https://example.com/repo",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      name: "My Service",
      slug: "my-service",
      description: "desc",
      repository_url: "https://example.com/repo",
    });
  });

  test("updateService PATCHes the given fields, including status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "svc-1",
        org_id: "org-1",
        name: "Renamed",
        slug: "my-service",
        description: null,
        status: "degraded",
        repository_url: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = await updateService("org-1", "svc-1", { name: "Renamed", status: "degraded" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/organizations/org-1/services/svc-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Renamed", status: "degraded" });
    expect(service).toEqual({
      id: "svc-1",
      org_id: "org-1",
      name: "Renamed",
      slug: "my-service",
      description: null,
      status: "degraded",
      repository_url: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
  });

  test("deleteService sends a DELETE and surfaces a 404 as an ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Service not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteService("org-1", "svc-1")).rejects.toMatchObject({
      status: 404,
      detail: "Service not found",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/organizations/org-1/services/svc-1");
    expect(init.method).toBe("DELETE");
  });
});
