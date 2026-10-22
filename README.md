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
| Phase 2 | AI layer (Claude triage, MCP, RAG)| **In progress** — Claude-backed incident triage shipped; MCP server + RAG next |
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
