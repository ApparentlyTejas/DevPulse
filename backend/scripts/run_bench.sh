#!/usr/bin/env bash
# Reproduces the latency numbers in the README's Benchmarks section.
# Requires: `make up && make migrate` already done, and `ab` (Apache Bench) installed.
set -euo pipefail

cd "$(dirname "$0")/.."

eval "$(python3 scripts/seed_bench_data.py | tail -3)"

echo "== GET /incidents (paginated list, 200 rows seeded) =="
ab -n 500 -c 10 -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/organizations/$ORG_ID/incidents?limit=20"

echo
echo "== POST /incidents (write path) =="
echo '{"title":"ab bench incident","severity":"sev3"}' > /tmp/devpulse_create_body.json
ab -n 300 -c 10 -p /tmp/devpulse_create_body.json -T "application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/organizations/$ORG_ID/incidents"

echo
echo "== POST /auth/login (argon2id hashing cost) =="
echo '{"email":"bench@example.com","password":"BenchPass123!"}' > /tmp/devpulse_login_body.json
ab -n 200 -c 10 -p /tmp/devpulse_login_body.json -T "application/json" \
  "http://localhost:8000/api/v1/auth/login"
