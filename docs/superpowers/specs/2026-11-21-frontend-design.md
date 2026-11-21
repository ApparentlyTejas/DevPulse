# DevPulse frontend design

## Why

The backend (auth, orgs, services, incidents, alerts, metrics, Claude-backed
triage/postmortems, MCP server) is built and tested. Phase 3, the frontend,
isn't. For this to work as a recruiter-facing project, someone needs to click
through it, not read FastAPI routes and a docker-compose file.

Order of remaining work: frontend, then deploy, then RAG, then polish. This
doc covers the frontend.

## Goals

- Full CRUD UI over the existing API: orgs/members, services, incidents,
  alert rules/events, metrics.
- Auth flow (register, login, logout, token refresh) against the existing
  JWT endpoints.
- The AI loop made visible: run a triage from an incident, read the triage
  history, generate a postmortem, read it.
- Org-scoped throughout, matching the backend's org-scoped authorization.
- A UI with its own look, not default shadcn.

## Non-goals

- Real-time updates. Lists refresh on navigation and user action.
- Mobile-first. Needs to not break at laptop width; that's the bar.
- A polished org-switching experience. A plain dropdown is enough.

## Anti-goals

- Hardcoded API base URL or token storage, since the backend moves off
  localhost in the next phase.
- A UI that only works with hand-picked seed data and breaks on empty states,
  pagination edges, or a failed AI call.
- CRUD screens that paper over the backend instead of showing it off:
  pagination envelopes, 429s, the forced-tool-call triage/postmortem shapes.

## Constraints

- Build against the API as-is. One exception, below.
- Stack is already decided in the README: React 18, TypeScript, Vite,
  shadcn/ui.
- `API_CORS_ORIGINS` already allows `http://localhost:5173`, so local dev
  needs no backend config change.
- Auth is JWT access/refresh token pairs in response bodies, not cookies. The
  frontend owns storage and refresh.

## Approaches considered

Framework is fixed by the README. The open question was server state and
forms.

1. **TanStack Query + React Hook Form + Zod (chosen).** Query handles
   caching, refetch, and the pagination/429 behavior the backend is built
   around. RHF + Zod gives typed, validated forms across the seven resource
   types without much boilerplate.
2. **Plain fetch + useState/useEffect.** No new dependencies, but every list
   screen reinvents loading/error/pagination/retry by hand, which is exactly
   the logic worth getting right, not rewriting seven times.
3. **Redux Toolkit + RTK Query.** More than this needs. The only client state
   is cached server data plus the selected org.

## Decided

- **Routing:** React Router v6. One list route and one `/:id` detail route
  per resource, under an authenticated layout that redirects to `/login`
  without a valid session.
- **Auth storage:** access token in memory (React context); refresh token in
  localStorage. A fetch-wrapper interceptor refreshes on 401.
- **Org scope:** top-nav org switcher backed by `GET /organizations`. Selected
  org id lives in React context, not per-page state.
- **Screens:**
  - `/login`, `/register`
  - `/` dashboard: service count, open incident count, recent alert events
  - `/services` list + create/edit/delete, `/services/:id` detail with tabs
    for Overview, Alert Rules, Alert Events, Metrics. Alert rules, alert
    events, and metrics are mounted under
    `/organizations/{org_id}/services/{service_id}/...` in the backend, with
    no org-wide list, so they live under the service, not as their own
    top-level nav items.
  - `/incidents` list, paginated and filterable by status/severity through
    new query params on `GET /incidents` (see below), plus create/edit/
    delete. `/incidents/:id` detail: status control, triage history, "run
    triage," postmortem view, "generate postmortem."
  - `/organizations/:id/members` list + add/role-change/remove. `POST
    .../members` takes a `user_id`, not an email, and there's no lookup
    endpoint, so this is "Add member by ID," not "Invite."
- **Error/empty states:** every list screen handles empty, loading, and
  error, including a distinct message for 429 on the AI endpoints.
- **Visual design:** see Visual design, below.
- **Incident filtering (the one backend change):** `GET
  /organizations/{org_id}/incidents` gets optional `status` and `severity`
  query params. Filtering only the loaded page would silently miss matches
  on other pages, so this gets a real backend param instead.
- **First-run org creation:** a new user has zero orgs. The org switcher's
  empty state is "Create organization," not a separate onboarding screen.

## Visual design

DevPulse is a tool someone opens while a service is actually down, to find
out what's broken and what to do about it. It isn't a marketing page, so the
design doesn't borrow marketing-page defaults. Checked against the common
AI-generated tells (warm cream plus terracotta, near-black plus an acid
accent, broadsheet serif columns, identical rounded cards with soft shadows,
ALL-CAPS eyebrows, decorative monospace, arrows tacked onto buttons) and
built away from all of them:

- **Color.** Chosen direction: black, royal blue, orange. `#0B0C0E` base
  (neutral near-black, not blue- or warm-tinted), `#16181C` surface,
  `#E7E9EC` ink, `#2A2D31` hairline. Royal blue `#2E42B8` is the primary
  accent: primary actions, links, focus rings, and incident severity
  "medium" (blue already reads as informational in status systems). Orange
  `#D9732B` is the secondary accent: severity "high," and the one
  highlighted-state color elsewhere (active tab, the single page-load
  moment). Severity "critical" gets its own red, `#C73E34`, since nothing
  else can stand in for that meaning; severity "low" gets no color at all,
  just ink at reduced opacity, so absence of color reads as low urgency.
  Two accents with distinct jobs, rather than one bright color dropped on
  everything, is what keeps this from reading as the generic dark-mode
  default.
- **Type.** IBM Plex Sans for UI text and headings. IBM Plex Mono only for
  literal machine data: incident IDs, timestamps, status codes. Not used for
  ordinary labels; that decorative use of monospace is one of the clearest
  generated-page tells.
- **Layout.** Left-aligned, dense, data-first. The dashboard's counts are
  large plain numbers separated by hairlines, not stat cards. Resource lists
  are tables with row hover, not card grids. An incident's triage/postmortem
  history is a vertical timeline, chosen because that content genuinely is
  sequential, unlike decorative 01/02/03 step markers. Incident detail is two
  columns: the record on the left, a persistent facts rail (status,
  severity, service, timestamps) on the right.
- **Principles.** Color means something (severity/status) or it isn't used.
  Panels differ by what they actually are (table, rail, timeline), not by a
  single card shape reused everywhere. One deliberate motion: a status
  change animates the status dot and confirms inline; nothing animates on
  page load or on hover just to animate.

## Left to the builder

- Component breakdown and folder structure under `frontend/`.
- Which shadcn components per screen, restyled to the tokens above rather
  than left at shadcn defaults.
- Exact type scale (sizes, weights, line-height) built from the Visual
  design type choices.
- Form field layout and validation copy per resource.
- Pagination control style; page-number fits the API's
  `{items, total, limit, offset}` shape.
