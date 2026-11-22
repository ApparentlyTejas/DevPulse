import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createOrganization, listOrganizations } from "./organizations";
import { setTokenGetter, setUnauthorizedHandler } from "./client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("organizations api", () => {
  beforeEach(() => {
    setTokenGetter(() => null);
    setUnauthorizedHandler(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("listOrganizations maps the bare list response to the minimal Org shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "org-1",
          slug: "acme",
          name: "Acme",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const orgs = await listOrganizations();

    expect(orgs).toEqual([{ id: "org-1", name: "Acme" }]);
  });

  test.each([
    ["Acme Corp", "acme-corp"],
    ["  Leading/Trailing  ", "leading-trailing"],
    ["Test Org!!", "test-org"],
    ["A", "a"],
    ["123", "123"],
    ["---", "org"],
  ])("createOrganization derives a valid slug from %j", async (name, expectedSlug) => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: "org-9",
          slug: expectedSlug,
          name,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const org = await createOrganization(name);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ name, slug: expectedSlug });
    expect(org).toEqual({ id: "org-9", name });
  });

  test("createOrganization truncates a long, punctuation-free name's slug to 64 chars and never ends in a hyphen", async () => {
    const longName = "a".repeat(80);
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      return jsonResponse(
        {
          id: "org-9",
          slug: body.slug,
          name: longName,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        201,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await createOrganization(longName);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const { slug } = JSON.parse(init.body as string);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("-")).toBe(false);
  });

  test("createOrganization surfaces a 409 slug conflict like any other API error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: "Slug already taken" }, 409));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOrganization("Test")).rejects.toMatchObject({
      status: 409,
      detail: "Slug already taken",
    });
  });
});
