"""Seed a benchmark org/service/incidents against a running DevPulse API and
print the access token + org_id needed to drive a load test against it.

Usage:
    make up
    make migrate
    python3 scripts/seed_bench_data.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8000/api/v1"
INCIDENT_COUNT = 200


def call(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)  # noqa: S310 -- fixed http(s) localhost URL, not user input
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:  # noqa: S310 -- fixed http(s) localhost URL, not user input
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        print(f"{method} {path} -> {exc.code}: {exc.read().decode()}", file=sys.stderr)  # noqa: T201 -- CLI script output
        raise


def main() -> None:
    email, password = "bench@example.com", "BenchPass123!"
    try:
        tokens = call("POST", "/auth/register", {"email": email, "password": password})
    except urllib.error.HTTPError:
        tokens = call("POST", "/auth/login", {"email": email, "password": password})
    token = tokens["access_token"]

    orgs = call("GET", "/organizations", token=token)
    org = (
        orgs[0]
        if orgs
        else call("POST", "/organizations", {"name": "BenchOrg", "slug": "bench-org"}, token=token)
    )
    org_id = org["id"]

    svc_list = call("GET", f"/organizations/{org_id}/services", token=token)
    services = svc_list["items"] if isinstance(svc_list, dict) else svc_list
    service = (
        services[0]
        if services
        else call(
            "POST",
            f"/organizations/{org_id}/services",
            {"name": "Bench Service", "slug": "bench-service"},
            token=token,
        )
    )
    service_id = service["id"]

    existing = call("GET", f"/organizations/{org_id}/incidents?limit=1", token=token)
    existing_total = existing["total"] if isinstance(existing, dict) else len(existing)
    for i in range(max(0, INCIDENT_COUNT - existing_total)):
        call(
            "POST",
            f"/organizations/{org_id}/incidents",
            {
                "title": f"Bench incident {i}",
                "severity": ["sev1", "sev2", "sev3", "sev4"][i % 4],
                "service_id": service_id,
            },
            token=token,
        )

    print(f"TOKEN={token}")  # noqa: T201 -- CLI script output, consumed by run_bench.sh
    print(f"ORG_ID={org_id}")  # noqa: T201
    print(f"SERVICE_ID={service_id}")  # noqa: T201


if __name__ == "__main__":
    main()
