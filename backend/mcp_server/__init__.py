"""MCP server: exposes DevPulse's incidents/services/triage to MCP clients.

A separate, lightweight process from the FastAPI app (`app/`) — it holds no
database or Redis connection of its own. Every tool call is an HTTP request
against the already-running DevPulse API, authenticated with a token the
operator provides, so it inherits the exact same authorization rules
(org membership, etc.) as every other API client.
"""
