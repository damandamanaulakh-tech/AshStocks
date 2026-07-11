from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ashstocks.api import app


async def request(path: str) -> tuple[int, dict]:
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    await app(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": b"",
            "headers": [],
        },
        receive,
        send,
    )
    status = next(item["status"] for item in messages if item["type"] == "http.response.start")
    body = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    return status, json.loads(body.decode("utf-8"))


async def main() -> None:
    for path in ("/health", "/api/health"):
        status, payload = await request(path)
        assert status == 200, (path, status, payload)
        assert payload["ok"] is True, (path, payload)
        assert payload["broker_write_enabled"] is False, (path, payload)


if __name__ == "__main__":
    asyncio.run(main())
