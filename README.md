# DevPulse

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

## Project status

| Phase   | Area                              | Status |
| ------- | --------------------------------- | ------ |
| Phase 1 | Core backend (auth → incidents)   | **Done** (auth, orgs, services, metrics, alerts, incidents) |
| Phase 2 | AI layer (Claude triage, MCP, RAG)| —      |
| Phase 3 | Frontend                          | —      |
| Phase 4 | Production infrastructure (AWS)   | —      |
| Phase 5 | Polish, docs, demo                | —      |
