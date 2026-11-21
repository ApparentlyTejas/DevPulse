# DevPulse Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DevPulse frontend (full CRUD over the existing API, auth, AI triage/postmortem flow) and the one small backend change it depends on.

**Architecture:** A Vite + React 18 + TypeScript SPA talking to the existing FastAPI backend over REST with JWT bearer auth. TanStack Query owns server state and caching; React Hook Form + Zod own form state and validation; React Router v6 owns routing. A thin, hand-written fetch wrapper (no axios) owns auth headers and token refresh.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod, React Router v6. Vitest + React Testing Library for frontend tests. Backend change: FastAPI/SQLAlchemy, pytest + httpx (existing patterns).

**Spec:** `docs/superpowers/specs/2026-11-21-frontend-design.md`

## Global Constraints

- Frontend lives in `frontend/` at the repo root, alongside `backend/`.
- API base URL is `VITE_API_BASE_URL`, default `http://localhost:8000/api/v1` (matches `API_V1_PREFIX` in `backend/.env.example`). Never hardcoded in a component.
- Auth: access token lives in memory (React context) only; refresh token lives in `localStorage` under the key `devpulse_refresh_token`. A 401 on any API call triggers one refresh attempt via `POST /auth/refresh`, then retries the original call once; a second 401 clears tokens and redirects to `/login`.
- No backend changes except Task 1 (`status`/`severity` query params on `GET /organizations/{org_id}/incidents`).
- Color tokens (exact): base `#0B0C0E`, surface `#16181C`, ink `#E7E9EC`, hairline `#2A2D31`, accent blue `#2E42B8`, accent orange `#D9732B`, critical red `#C73E34`. Severity color mapping: `sev1` → critical red, `sev2` → orange, `sev3` → blue, `sev4` → no color (ink at reduced opacity).
- Typefaces: IBM Plex Sans for all UI text and headings. IBM Plex Mono only for incident/resource IDs, timestamps, and status/severity codes, never for ordinary labels or buttons.
- No card-grid layouts for resource lists; lists are tables. No decorative gradients, no `→` appended to button text, no ALL-CAPS labels.
- Package manager: npm.

## Review Focus

- Access/refresh token both invalid or expired mid-session: must redirect to `/login` once, not loop or throw an unhandled error. (Task 3)
- Incident list filtered by a status/severity combination with zero matches: must render the empty state, not a broken pagination footer claiming pages that don't exist. (Task 10, Task 1)
- Triage or postmortem generation hitting the backend's 429 rate limit: must show the `Retry-After`-aware message, not a generic "something went wrong" toast. (Task 12, Task 13)
- Acting on a resource (incident, service, alert rule) that returns 404 because it was already deleted by someone else since the list was fetched: must surface the error and refresh the list, not crash the page. (Task 5, Task 10)
- A brand-new user with zero organizations: every page that needs a selected org must handle "no org selected" without firing a request with a missing/undefined `org_id`. (Task 4)

---

## Task 1: Backend incident status/severity filter

**Files:**
- Modify: `backend/app/modules/incidents/router.py:54-70` (`list_incidents` endpoint)
- Modify: `backend/app/modules/incidents/service.py:98-113` (`list_incidents` service function)
- Test: `backend/tests/integration/test_incidents.py`

**Interfaces:**
- Produces: `GET /organizations/{org_id}/incidents?status=<IncidentStatus>&severity=<IncidentSeverity>` (both optional, combinable, validated against the existing `IncidentStatus`/`IncidentSeverity` enums; 422 on an invalid value, matching how `limit`/`offset` already 422).

- [ ] **Step 1: Write the failing tests**

```python
async def test_list_incidents_filters_by_status(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-filter-status@example.com", "inc-filter-status-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)
    await client.post(url, json={"title": "A", "severity": "sev1"}, headers=hdrs)
    resp_open = await client.post(url, json={"title": "B", "severity": "sev1"}, headers=hdrs)
    await client.patch(
        f"{url}/{resp_open.json()['id']}/status",
        json={"status": "resolved"},
        headers=hdrs,
    )

    resp = await client.get(url, params={"status": "resolved"}, headers=hdrs)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "B"


async def test_list_incidents_filters_by_severity(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-filter-sev@example.com", "inc-filter-sev-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)
    await client.post(url, json={"title": "A", "severity": "sev1"}, headers=hdrs)
    await client.post(url, json={"title": "B", "severity": "sev4"}, headers=hdrs)

    resp = await client.get(url, params={"severity": "sev4"}, headers=hdrs)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "B"


async def test_list_incidents_rejects_invalid_status(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-filter-bad@example.com", "inc-filter-bad-org")
    resp = await client.get(
        _inc_url(org_id),
        params={"status": "not-a-real-status"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/integration/test_incidents.py -k filter -v`
Expected: FAIL (no `status`/`severity` query params accepted yet; filter tests see unfiltered counts)

- [ ] **Step 3: Add `status: IncidentStatus | None = None, severity: IncidentSeverity | None = None` query params to `list_incidents` in `router.py`, pass through to the service call**

- [ ] **Step 4: Add `status: IncidentStatus | None, severity: IncidentSeverity | None` parameters to `list_incidents` in `service.py`, and apply them as additional `.where()` clauses on the existing query only when not `None`**

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/integration/test_incidents.py -v`
Expected: PASS (all incident tests, including the three new ones)

- [ ] **Step 6: Run lint and type-check**

Run: `cd backend && uv run ruff check . && uv run mypy app`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/incidents/router.py backend/app/modules/incidents/service.py backend/tests/integration/test_incidents.py
git commit -m "Add status/severity filters to the incidents list endpoint"
```

---

## Task 2: Frontend scaffold + design tokens

**Files:**
- Create: `frontend/` (Vite + React + TS project, via `npm create vite@latest frontend -- --template react-ts`)
- Create: `frontend/tailwind.config.ts`, `frontend/src/index.css`
- Create: `frontend/.env.example` (`VITE_API_BASE_URL=http://localhost:8000/api/v1`)
- Create: `frontend/src/lib/fonts.ts` (or `index.html` `<link>` for IBM Plex Sans/Mono)
- Modify: `README.md` (replace the "Frontend... planned for a later phase" line with how to run it)
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: a Tailwind theme exposing the Global Constraints color tokens as named colors (`bg`, `surface`, `ink`, `hairline`, `accent-blue`, `accent-orange`, `critical`) and two font families (`font-sans` → IBM Plex Sans, `font-mono` → IBM Plex Mono), usable by every later task.

- [ ] **Step 1: Scaffold the project**

Run: `npm create vite@latest frontend -- --template react-ts`, then `cd frontend && npm install`

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && npm install @tanstack/react-query react-router-dom react-hook-form zod @hookform/resolvers && npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom && npx tailwindcss init -p`

- [ ] **Step 3: Init shadcn/ui**

Run: `cd frontend && npx shadcn@latest init`

- [ ] **Step 4: Define the Tailwind theme in `tailwind.config.ts`**

Add the seven Global Constraints colors under `theme.extend.colors`, and `fontFamily.sans`/`fontFamily.mono` set to `["IBM Plex Sans", ...]` / `["IBM Plex Mono", ...]`.

- [ ] **Step 5: Load IBM Plex Sans and IBM Plex Mono**

Add a Google Fonts `<link>` for both families (weights 400/500/600 for Sans, 400/500 for Mono) to `frontend/index.html`.

- [ ] **Step 6: Set `body` background/color/font in `frontend/src/index.css`** to `bg`/`ink`/`font-sans`, so the default page already reflects the palette before any component is built.

- [ ] **Step 7: Configure Vitest**

Add a `test` block to `vite.config.ts` (environment `jsdom`, `setupFiles` pointing at a new `frontend/src/test/setup.ts` that imports `@testing-library/jest-dom`), and a `"test": "vitest run"` script in `package.json`.

- [ ] **Step 8: Write the failing smoke test**

```tsx
// frontend/src/App.test.tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders without crashing", () => {
  render(<App />);
  expect(document.body).toBeTruthy();
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL (default Vite `App.tsx` still has the counter demo; `App` import may still resolve, so this step may instead fail on Vitest not yet configured; resolve until it runs and fails for the right reason, then move to Step 10)

- [ ] **Step 10: Replace `App.tsx` with an empty shell** (a styled `<div>` using `bg`/`ink`/`font-sans`, no routes yet)

- [ ] **Step 11: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 12: Update `README.md`'s frontend section** to describe `cd frontend && npm install && npm run dev`, replacing the "not implemented yet" line.

- [ ] **Step 13: Commit**

```bash
git add frontend README.md
git commit -m "Scaffold the DevPulse frontend with Tailwind design tokens"
```

---

## Task 3: API client, auth storage, token refresh

**Files:**
- Create: `frontend/src/lib/api/client.ts`
- Create: `frontend/src/lib/api/auth.ts`
- Create: `frontend/src/lib/auth-context.tsx`
- Test: `frontend/src/lib/api/client.test.ts`
- Test: `frontend/src/lib/auth-context.test.tsx`

**Interfaces:**
- Produces: `apiRequest<T>(path: string, init?: RequestInit): Promise<T>` in `client.ts`, which joins `path` to `import.meta.env.VITE_API_BASE_URL`, attaches `Authorization: Bearer <accessToken>` from a module-level getter, throws `ApiError` (`{status: number, detail: string}`) on non-2xx, and on a 401 calls `refreshAccessToken()` once before retrying.
- Produces: `login(email: string, password: string): Promise<TokenPair>`, `register(email: string, password: string): Promise<TokenPair>`, `refreshAccessToken(): Promise<TokenPair>`, `logout(): Promise<void>`, `getCurrentUser(): Promise<User>` in `auth.ts`, where `TokenPair = {accessToken: string, refreshToken: string}` and `User = {id: string, email: string}`.
- Produces: `AuthProvider`, `useAuth(): {user: User | null, accessToken: string | null, login, register, logout, isLoading: boolean}` in `auth-context.tsx`. `login`/`register` store the access token in React state and the refresh token in `localStorage["devpulse_refresh_token"]`; on mount, if a refresh token exists, calls `refreshAccessToken()` then `getCurrentUser()` to restore the session.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing client tests**

```ts
// client.test.ts
test("attaches the Authorization header from the token getter", async () => { /* mock fetch, assert header */ });
test("retries once after a successful refresh on 401", async () => { /* fetch mock: 401 then refresh then 200 */ });
test("throws ApiError with status and detail on a non-2xx response", async () => { /* fetch mock: 404 with {"detail": "not found"} */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- client.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement `client.ts`**, consisting of the `fetch` wrapper, `setTokenGetter`/`setUnauthorizedHandler` module-level hooks that `auth-context.tsx` wires up, and the `ApiError` class.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `auth.ts`**: the five functions above, each a thin `apiRequest` call to `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/me`.

- [ ] **Step 6: Write the failing auth-context test**

```tsx
// auth-context.test.tsx
test("restores a session on mount when a refresh token is in localStorage", async () => { /* seed localStorage, mock auth.ts, assert useAuth().user is set after load */ });
test("clears tokens and sets user to null on logout", async () => { /* ... */ });
test("has no user and isLoading false when no refresh token is stored", async () => { /* ... */ });
```

- [ ] **Step 7: Run tests to verify they fail, then implement `auth-context.tsx`, then run tests to verify they pass**

Run: `cd frontend && npm test -- auth-context.test.tsx`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api/client.ts frontend/src/lib/api/client.test.ts frontend/src/lib/api/auth.ts frontend/src/lib/auth-context.tsx frontend/src/lib/auth-context.test.tsx
git commit -m "Add API client, auth endpoints, and session context"
```

---

## Task 4: Auth pages, protected layout, org context

**Files:**
- Create: `frontend/src/lib/api/organizations.ts`
- Create: `frontend/src/lib/org-context.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/RegisterPage.tsx`
- Create: `frontend/src/components/AppLayout.tsx` (top nav + org switcher)
- Create: `frontend/src/routes.tsx` (wires `App.tsx` into `RouterProvider`)
- Test: `frontend/src/lib/org-context.test.tsx`
- Test: `frontend/src/pages/LoginPage.test.tsx`
- Test: `frontend/src/components/AppLayout.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` from Task 3.
- Produces: `listOrganizations(): Promise<Org[]>`, `createOrganization(name: string): Promise<Org>` in `organizations.ts`, where `Org = {id: string, name: string}`.
- Produces: `OrgProvider`, `useOrg(): {orgs: Org[], selectedOrgId: string | null, selectOrg: (id: string) => void, createOrg: (name: string) => Promise<void>, isLoading: boolean}` in `org-context.tsx`. `selectedOrgId` is `null` when `orgs` is empty; every later page must treat `null` as "render the create-org prompt," not fire a request.
- Produces: route tree in `routes.tsx`: `/login`, `/register` (public), everything else under `AppLayout` (redirects to `/login` if `useAuth().user` is `null`).

- [ ] **Step 1: Write the failing `organizations.ts`/`org-context.tsx` tests**

```tsx
test("selectedOrgId is null when the org list is empty", async () => { /* mock listOrganizations -> [] */ });
test("selectedOrgId defaults to the first org when orgs load", async () => { /* ... */ });
test("createOrg adds the new org and selects it", async () => { /* ... */ });
```

- [ ] **Step 2: Run, implement, run** (standard red/green cycle per the step pattern above)

- [ ] **Step 3: Write the failing `LoginPage` test**

```tsx
test("calls login with the entered email and password on submit", async () => { /* render, fill form, click submit, assert mock call args */ });
test("shows the backend's error detail on a failed login", async () => { /* mock login to reject with ApiError */ });
```

- [ ] **Step 4: Implement `LoginPage.tsx`** (React Hook Form + Zod: `email` string email, `password` min length 8, matching the backend's registration constraints) and `RegisterPage.tsx` the same shape.

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Write the failing `AppLayout` test**

```tsx
test("redirects to /login when there is no authenticated user", () => { /* ... */ });
test("shows a Create organization prompt when the org list is empty", async () => { /* ... */ });
test("lists orgs in the switcher and calls selectOrg on choosing one", async () => { /* ... */ });
```

- [ ] **Step 7: Implement `AppLayout.tsx`**: a top nav with the org switcher (shadcn `DropdownMenu` or `Select`, restyled to the design tokens) and an `<Outlet />` for child routes; the empty-org state replaces the outlet with a "Create organization" form.

- [ ] **Step 8: Wire `routes.tsx`** with `createBrowserRouter`, nest `AuthProvider`/`OrgProvider`/`QueryClientProvider` in `main.tsx`.

- [ ] **Step 9: Run full test suite, verify all pass**

Run: `cd frontend && npm test`

- [ ] **Step 10: Commit**

```bash
git add frontend/src
git commit -m "Add auth pages, protected layout, and org context"
```

---

## Task 5: Services list + create/edit/delete

**Files:**
- Create: `frontend/src/lib/api/services.ts`
- Create: `frontend/src/pages/ServicesListPage.tsx`
- Create: `frontend/src/components/ServiceFormDialog.tsx`
- Test: `frontend/src/pages/ServicesListPage.test.tsx`

**Interfaces:**
- Consumes: `useOrg()` from Task 4.
- Produces: `listServices(orgId: string, page: {limit: number, offset: number}): Promise<Page<Service>>`, `createService(orgId: string, data: {name: string, description?: string}): Promise<Service>`, `updateService(orgId: string, serviceId: string, data: Partial<{name: string, description: string}>): Promise<Service>`, `deleteService(orgId: string, serviceId: string): Promise<void>` in `services.ts`, where `Page<T> = {items: T[], total: number, limit: number, offset: number}` and `Service = {id: string, name: string, description: string | null}`.
- Produces: route `/services` rendering a table (name, description, row actions) with a "New service" dialog and pagination controls driven by `Page.total`/`limit`/`offset`.

- [ ] **Step 1: Write the failing `ServicesListPage` tests**

```tsx
test("renders a row per service returned by the API", async () => { /* mock listServices */ });
test("shows the empty state when total is 0", async () => { /* ... */ });
test("shows an error state and a retry action when the request fails", async () => { /* ... */ });
test("removes a service from the list after a successful delete", async () => { /* ... */ });
test("shows a 404 error and refetches the list when deleting an already-gone service", async () => { /* mock deleteService to reject 404 */ });
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `services.ts`**, then `ServiceFormDialog.tsx` (RHF + Zod: `name` required, `description` optional), then `ServicesListPage.tsx` as a table, TanStack Query (`useQuery`/`useMutation`) for data/loading/error, pagination using `limit`/`offset` query params.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add the `/services` route to `routes.tsx`**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/services.ts frontend/src/pages/ServicesListPage.tsx frontend/src/pages/ServicesListPage.test.tsx frontend/src/components/ServiceFormDialog.tsx frontend/src/routes.tsx
git commit -m "Add services list with create, edit, and delete"
```

---

## Task 6: Service detail shell + Overview tab

**Files:**
- Modify: `frontend/src/lib/api/services.ts` (add `getService`)
- Create: `frontend/src/pages/ServiceDetailPage.tsx`
- Test: `frontend/src/pages/ServiceDetailPage.test.tsx`

**Interfaces:**
- Consumes: `Service` type and `services.ts` functions from Task 5.
- Produces: `getService(orgId: string, serviceId: string): Promise<Service>` in `services.ts`. Route `/services/:id` with four tabs (Overview, Alert Rules, Alert Events, Metrics); Overview renders the service's own fields and edit/delete actions; the other three tabs are populated by Tasks 7–9 and render an empty placeholder until then.

- [ ] **Step 1: Write the failing test**

```tsx
test("renders the service name and description in the Overview tab", async () => { /* mock getService */ });
test("shows a not-found state when getService 404s", async () => { /* ... */ });
```

- [ ] **Step 2: Run, implement (shadcn `Tabs`, restyled), run**

- [ ] **Step 3: Add the `/services/:id` route**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/services.ts frontend/src/pages/ServiceDetailPage.tsx frontend/src/pages/ServiceDetailPage.test.tsx frontend/src/routes.tsx
git commit -m "Add service detail page with tabbed layout"
```

---

## Task 7: Alert Rules tab

**Files:**
- Create: `frontend/src/lib/api/alerts.ts`
- Create: `frontend/src/components/AlertRulesTab.tsx`
- Test: `frontend/src/components/AlertRulesTab.test.tsx`

**Interfaces:**
- Consumes: `ServiceDetailPage`'s tab slot from Task 6.
- Produces: `listAlertRules(orgId: string, serviceId: string): Promise<AlertRule[]>`, `createAlertRule(...)`, `updateAlertRule(...)`, `deleteAlertRule(...)` in `alerts.ts`, matching the fields in `backend/app/modules/alerts/schemas.py`'s `AlertRuleOut`/create/update request models (read that file for the exact field set before writing the Zod schema).
- Produces: `AlertRulesTab`, a table of rules scoped to the current service, with create/edit/delete, mounted in `ServiceDetailPage`'s "Alert Rules" tab.

- [ ] **Step 1: Read `backend/app/modules/alerts/schemas.py` to confirm the exact `AlertRuleOut`/create/update field names before writing types**

- [ ] **Step 2: Write the failing `AlertRulesTab` tests** (list renders, empty state, create, delete) mirroring Task 5's test shape

- [ ] **Step 3: Run, implement `alerts.ts` rule functions and `AlertRulesTab.tsx`, run**

- [ ] **Step 4: Mount `AlertRulesTab` in `ServiceDetailPage`'s Alert Rules tab**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/alerts.ts frontend/src/components/AlertRulesTab.tsx frontend/src/components/AlertRulesTab.test.tsx frontend/src/pages/ServiceDetailPage.tsx
git commit -m "Add alert rules tab with create, edit, and delete"
```

---

## Task 8: Alert Events tab

**Files:**
- Modify: `frontend/src/lib/api/alerts.ts` (add event functions)
- Create: `frontend/src/components/AlertEventsTab.tsx`
- Test: `frontend/src/components/AlertEventsTab.test.tsx`

**Interfaces:**
- Produces: `listAlertEvents(orgId: string, serviceId: string, page: {limit: number, offset: number}): Promise<Page<AlertEvent>>`, `updateAlertEventStatus(orgId: string, serviceId: string, eventId: string, status: string): Promise<AlertEvent>` in `alerts.ts` (read `AlertEventOut` in `backend/app/modules/alerts/schemas.py` for exact fields/status values first).
- Produces: `AlertEventsTab`, a paginated table with a status-change control per row, mounted in `ServiceDetailPage`'s "Alert Events" tab.

- [ ] **Step 1: Read the alert event schema/status enum**
- [ ] **Step 2: Write the failing tests** (list renders paginated, status update calls the API and reflects in the row, empty state)
- [ ] **Step 3: Run, implement, run**
- [ ] **Step 4: Mount in `ServiceDetailPage`**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/alerts.ts frontend/src/components/AlertEventsTab.tsx frontend/src/components/AlertEventsTab.test.tsx frontend/src/pages/ServiceDetailPage.tsx
git commit -m "Add alert events tab with pagination and status updates"
```

---

## Task 9: Metrics tab

**Files:**
- Create: `frontend/src/lib/api/metrics.ts`
- Create: `frontend/src/components/MetricsTab.tsx`
- Test: `frontend/src/components/MetricsTab.test.tsx`

**Interfaces:**
- Produces: `listMetrics(orgId: string, serviceId: string, page: {limit: number, offset: number}): Promise<Page<MetricSnapshot>>`, `createMetric(orgId: string, serviceId: string, data: {...}): Promise<MetricSnapshot>` in `metrics.ts` (read `backend/app/modules/metrics/schemas.py` for the exact snapshot fields first).
- Produces: `MetricsTab`, a paginated table plus a "record a snapshot" form, mounted in `ServiceDetailPage`'s "Metrics" tab. Numeric values and timestamps rendered in `font-mono` per the design tokens.

- [ ] **Step 1: Read the metrics schema**
- [ ] **Step 2: Write the failing tests** (list renders, create adds a row, empty state)
- [ ] **Step 3: Run, implement, run**
- [ ] **Step 4: Mount in `ServiceDetailPage`**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/metrics.ts frontend/src/components/MetricsTab.tsx frontend/src/components/MetricsTab.test.tsx frontend/src/pages/ServiceDetailPage.tsx
git commit -m "Add metrics tab with snapshot list and manual recording"
```

---

## Task 10: Incidents list with status/severity filters

**Files:**
- Create: `frontend/src/lib/api/incidents.ts`
- Create: `frontend/src/pages/IncidentsListPage.tsx`
- Create: `frontend/src/components/IncidentFormDialog.tsx`
- Test: `frontend/src/pages/IncidentsListPage.test.tsx`

**Interfaces:**
- Consumes: the `status`/`severity` query params added in Task 1.
- Produces: `listIncidents(orgId: string, filters: {status?: string, severity?: string}, page: {limit: number, offset: number}): Promise<Page<Incident>>`, `createIncident(...)`, `updateIncident(...)`, `deleteIncident(...)` in `incidents.ts`, where `Incident` mirrors `IncidentOut` (`id`, `title`, `severity`, `status`, `serviceId`, `description`, timestamps; confirm exact field names against `backend/app/modules/incidents/schemas.py`).
- Produces: `/incidents` route: filter controls (status, severity dropdowns using shadcn `Select`, restyled), a table with a severity-colored dot per the Global Constraints mapping, pagination, and create/edit/delete.

- [ ] **Step 1: Read `backend/app/modules/incidents/schemas.py` to confirm `IncidentOut` field names**
- [ ] **Step 2: Write the failing tests**

```tsx
test("renders a row per incident with the correct severity dot color", async () => { /* assert sev1 row has the critical-red dot class/style */ });
test("re-fetches with the chosen status in the query params when the status filter changes", async () => { /* assert listIncidents mock called with status: "resolved" */ });
test("shows the empty state (not a broken pagination footer) when a filter combination has zero matches", async () => { /* mock total: 0 */ });
```

- [ ] **Step 3: Run, implement `incidents.ts` and `IncidentsListPage.tsx`, run**
- [ ] **Step 4: Add the `/incidents` route**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/incidents.ts frontend/src/pages/IncidentsListPage.tsx frontend/src/components/IncidentFormDialog.tsx frontend/src/pages/IncidentsListPage.test.tsx frontend/src/routes.tsx
git commit -m "Add incidents list with status and severity filtering"
```

---

## Task 11: Incident detail + status control

**Files:**
- Modify: `frontend/src/lib/api/incidents.ts` (add `getIncident`, `updateIncidentStatus`)
- Create: `frontend/src/pages/IncidentDetailPage.tsx`
- Create: `frontend/src/components/IncidentFactsRail.tsx`
- Test: `frontend/src/pages/IncidentDetailPage.test.tsx`

**Interfaces:**
- Produces: `getIncident(orgId: string, incidentId: string): Promise<Incident>`, `updateIncidentStatus(orgId: string, incidentId: string, status: string): Promise<Incident>` in `incidents.ts`.
- Produces: route `/incidents/:id`, two-column layout: record (title, description) on the left, `IncidentFactsRail` (status control, severity, service, created/updated timestamps in `font-mono`) on the right. Triage history and postmortem (Tasks 12-13) mount below the record.

- [ ] **Step 1: Write the failing tests**

```tsx
test("renders the incident's title, severity, and status", async () => { /* ... */ });
test("changing the status control calls updateIncidentStatus and reflects the new status", async () => { /* ... */ });
test("shows an invalid-transition error from the API without crashing the page", async () => { /* mock a 409/422 from the backend's InvalidStatusTransitionError */ });
```

- [ ] **Step 2: Run, implement, run**
- [ ] **Step 3: Add the `/incidents/:id` route**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/incidents.ts frontend/src/pages/IncidentDetailPage.tsx frontend/src/components/IncidentFactsRail.tsx frontend/src/pages/IncidentDetailPage.test.tsx frontend/src/routes.tsx
git commit -m "Add incident detail page with status control"
```

---

## Task 12: Triage history + run triage

**Files:**
- Create: `frontend/src/lib/api/ai.ts`
- Create: `frontend/src/components/TriageHistory.tsx`
- Test: `frontend/src/components/TriageHistory.test.tsx`

**Interfaces:**
- Consumes: `IncidentDetailPage`'s mount point from Task 11.
- Produces: `listTriages(orgId: string, incidentId: string): Promise<IncidentTriage[]>`, `runTriage(orgId: string, incidentId: string): Promise<IncidentTriage>` in `ai.ts`, where `IncidentTriage` mirrors `IncidentTriageOut` (confirm fields, summary, suggested severity, confidence, created_at, against `backend/app/modules/ai/schemas.py`).
- Produces: `TriageHistory`, a vertical timeline (per the spec, this content is genuinely sequential) of past triage runs, newest first, plus a "Run triage" button, mounted below the incident record in `IncidentDetailPage`.

- [ ] **Step 1: Read `backend/app/modules/ai/schemas.py` to confirm `IncidentTriageOut` fields**
- [ ] **Step 2: Write the failing tests**

```tsx
test("renders one timeline entry per past triage, newest first", async () => { /* ... */ });
test("appends a new entry after a successful Run triage", async () => { /* ... */ });
test("shows the rate-limit message, with the Retry-After value, on a 429 from runTriage", async () => { /* mock a 429 with a Retry-After header */ });
```

- [ ] **Step 3: Run, implement `ai.ts` triage functions and `TriageHistory.tsx`, run**
- [ ] **Step 4: Mount in `IncidentDetailPage`**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/ai.ts frontend/src/components/TriageHistory.tsx frontend/src/components/TriageHistory.test.tsx frontend/src/pages/IncidentDetailPage.tsx
git commit -m "Add triage history timeline and run-triage action"
```

---

## Task 13: Postmortem view + generate

**Files:**
- Modify: `frontend/src/lib/api/ai.ts` (add postmortem functions)
- Create: `frontend/src/components/PostmortemPanel.tsx`
- Test: `frontend/src/components/PostmortemPanel.test.tsx`

**Interfaces:**
- Produces: `listPostmortems(orgId: string, incidentId: string): Promise<Postmortem[]>`, `generatePostmortem(orgId: string, incidentId: string): Promise<Postmortem>` in `ai.ts` (confirm `PostmortemOut` fields against `backend/app/modules/ai/schemas.py`).
- Produces: `PostmortemPanel`, which shows the latest generated postmortem's content (rendered as formatted text, not a raw markdown dump, unless the backend already returns HTML/markdown; check the field's actual content shape first) and a "Generate postmortem" button, mounted in `IncidentDetailPage`.

- [ ] **Step 1: Confirm `PostmortemOut`'s field names and content format**
- [ ] **Step 2: Write the failing tests** (renders latest postmortem, generate adds a new one and displays it, 429 shows the rate-limit message)
- [ ] **Step 3: Run, implement, run**
- [ ] **Step 4: Mount in `IncidentDetailPage`**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/ai.ts frontend/src/components/PostmortemPanel.tsx frontend/src/components/PostmortemPanel.test.tsx frontend/src/pages/IncidentDetailPage.tsx
git commit -m "Add postmortem view and generate action"
```

---

## Task 14: Org members

**Files:**
- Modify: `frontend/src/lib/api/organizations.ts` (add member functions)
- Create: `frontend/src/pages/MembersPage.tsx`
- Test: `frontend/src/pages/MembersPage.test.tsx`

**Interfaces:**
- Produces: `listMembers(orgId: string): Promise<Member[]>`, `addMember(orgId: string, userId: string): Promise<Member>`, `updateMemberRole(orgId: string, userId: string, role: string): Promise<Member>`, `removeMember(orgId: string, userId: string): Promise<void>` in `organizations.ts` (confirm `MembershipOut` fields/role values against `backend/app/modules/organizations/schemas.py`).
- Produces: route `/organizations/:id/members`, a plain list (not paginated, per the spec's non-goal on small human-bounded collections), "Add member" form taking a user ID (labeled as such, not "Invite"), inline role change, remove action.

- [ ] **Step 1: Confirm `MembershipOut`/role fields**
- [ ] **Step 2: Write the failing tests** (list renders, add-by-id adds a row, role change calls the API, remove removes a row, error on adding a nonexistent user ID surfaces the backend's error detail)
- [ ] **Step 3: Run, implement, run**
- [ ] **Step 4: Add the `/organizations/:id/members` route, link to it from `AppLayout`'s nav**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/organizations.ts frontend/src/pages/MembersPage.tsx frontend/src/pages/MembersPage.test.tsx frontend/src/routes.tsx frontend/src/components/AppLayout.tsx
git commit -m "Add org members page with add, role change, and remove"
```

---

## Task 15: Dashboard

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Test: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `listServices` (Task 5) and `listIncidents` (Task 10). The summary level needs no status filtering, just `total` from an unfiltered call. Alert events are per-service with no org-wide endpoint, so "recent alert events" fetches the most recent page from each of the org's services (via `listServices` plus `Promise.all` over `listAlertEvents`) and merges/sorts client-side by timestamp, capped at 10 shown.
- Produces: route `/`, three large plain numbers (service count, open incident count, a count of unresolved alert events) separated by hairlines, no stat cards, plus the merged recent-events list below.

- [ ] **Step 1: Write the failing tests**

```tsx
test("renders the service count and open incident count from the API", async () => { /* mock listServices, listIncidents */ });
test("merges and sorts alert events from multiple services by timestamp, newest first", async () => { /* mock two services each returning events, assert interleaved order */ });
test("shows a Create organization prompt instead of fetching anything when there is no selected org", () => { /* useOrg mock returns selectedOrgId: null */ });
```

- [ ] **Step 2: Run, implement, run**
- [ ] **Step 3: Add the `/` route**
- [ ] **Step 4: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS (every test file in the project)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx frontend/src/routes.tsx
git commit -m "Add dashboard with org summary counts and recent alert events"
```

---

## Self-Review Notes

- **Spec coverage:** every screen in the spec's Decided → Screens list has a task (Tasks 4–15); the one backend change is Task 1; auth/token handling is Task 3; visual tokens are Task 2 and referenced as constraints throughout.
- **Review Focus coverage:** session-expiry (Task 3), empty-filter state (Tasks 1, 10), 429 on AI calls (Tasks 12, 13), stale-404-on-delete (Tasks 5, 10), zero-org state (Task 4, carried through Task 15) each have an explicit test in their owning task.
- **Open naming risk:** `Incident`, `AlertRule`, `AlertEvent`, `MetricSnapshot`, `IncidentTriage`, `Postmortem` field names are deliberately left to be confirmed against the backend schemas at the start of their task rather than guessed here, since guessing wrong in the plan would be worse than a one-line read-first step in the task.
