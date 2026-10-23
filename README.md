# DevPulse

![CI](https://github.com/ApparentlyTejas/DevPulse/actions/workflows/ci.yml/badge.svg)

AI-powered engineering operations platform. Centralizes service monitoring,
metrics, incident management, and exposes infrastructure to Claude via the
Model Context Protocol (MCP).



## Stack

- **Backend:** FastAPI, Python 3.12, SQLAlchemy 2.0 (async), Alembic,
  PostgreSQL 16 + pgvector, Redis 7, APScheduler + arq.
- **AI:** Anthropic SDK, MCP Python SDK.
- **Frontend:** React 18 + TypeScript + Vite + shadcn/ui (Phase 3).
- **Infra:** Docker, Docker Compose, GitHub Actions, AWS (EC2/RDS/S3),
  Terraform, Nginx (Phase 4).

## Repository layout

```
devpulse/
├── backend/           FastAPI app, workers, MCP server (one Python package)
├── frontend/          React app (Phase 3)
├── infrastructure/    Terraform, nginx, postgres init scripts
├── docs/              Architecture, ADRs, runbooks
├── docker-compose.yml Local dev orchestration
└── Makefile           Common developer commands
```

See [docs/adr/](docs/adr) for architecture decisions.

## Local development

Requirements: Docker, Docker Compose v2, GNU Make.

```bash
cp .env.example .env       # then edit secrets
make up                    # starts postgres, redis, api
curl http://localhost:8000/healthz
make logs                  # tail container logs
make down                  # stop everything
```

Run tests / lint / typecheck:

```bash
make test
make lint
make typecheck
```

### Running lint / type-check / coverage locally (without Docker)

CI (`.github/workflows/ci.yml`) runs ruff, mypy, and the full pytest suite
with coverage on every push/PR to `main`. You can run the same checks
locally with [uv](https://docs.astral.sh/uv/), from `backend/`:

```bash
cd backend
uv sync --extra dev                 # install runtime + dev dependencies

uv run ruff check .                 # lint
uv run ruff format --check .        # formatting

uv run mypy app                     # strict type check

uv run pytest --cov=app --cov-report=term-missing --cov-report=html
# open backend/htmlcov/index.html for the full coverage report
```

Integration tests spin up ephemeral Postgres/Redis containers via
[testcontainers](https://testcontainers-python.readthedocs.io/), so Docker
must be running locally — no other setup or secrets required.

## Project status

| Phase   | Area                              | Status |
| ------- | --------------------------------- | ------ |
| Phase 1 | Core backend (auth → incidents)   | **Done** (auth, orgs, services, metrics, alerts, incidents) |
| Phase 2 | AI layer (Claude triage, MCP, RAG)| **In progress** — Claude-backed incident triage and an MCP server shipped; RAG next |
| Phase 3 | Frontend                          | —      |
| Phase 4 | Production infrastructure (AWS)   | —      |
| Phase 5 | Polish, docs, demo                | —      |

## AI incident triage

Every incident can be triaged by Claude on demand:

```
POST /api/v1/organizations/{org_id}/incidents/{incident_id}/triage
GET  /api/v1/organizations/{org_id}/incidents/{incident_id}/triage   # history, newest first
```

Claude gets the incident's title, severity, status, linked service (if any),
and description, and returns a structured assessment via a forced tool
call (`summary`, `suggested_severity`, `confidence`) — not freeform text —
so the response shape is reliable regardless of model phrasing. Each
triage run is persisted (`incident_triages` table) rather than overwriting
the last one, so an incident keeps a full triage history as new
information comes in.

Requires `ANTHROPIC_API_KEY` (see `.env.example`). Backed by
`app/modules/ai/`.

## MCP server

`backend/mcp_server/` exposes incidents, services, and triage to any MCP
client (Claude Desktop, or anything else speaking the protocol) as tools:
`list_incidents`, `get_incident`, `create_incident`, `update_incident_status`,
`triage_incident`, `list_incident_triages`, `list_services`.

It's a separate, lightweight process from the API itself — it holds no
database connection of its own. Every tool call is a plain HTTP request
against the already-running DevPulse API, so it inherits the exact same
authorization rules (org membership, etc.) as every other API client,
rather than duplicating that logic.

```bash
cd backend
uv sync --extra dev

DEVPULSE_MCP_ACCESS_TOKEN=<a valid access token>
DEVPULSE_MCP_ORG_ID=<the org to scope every call to>
DEVPULSE_MCP_API_BASE_URL=http://localhost:8000/api/v1   # default; override for a deployed API

uv run devpulse-mcp
```

Point an MCP client's stdio config at `uv run devpulse-mcp` (run from
`backend/`, with the three env vars above set) to connect it.
