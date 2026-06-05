#!/usr/bin/env python3
import json
import logging
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path("/opt/anka/yon")
CONFIG_PATH = Path("/etc/anka/config.json")
AGENTS_PATH = BASE_DIR / "agents.json"

FALLBACK_CONFIG = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1/chat/completions",
        "model": "openai/gpt-4o",
        "app_name": "Anka Intelligence OS",
        "site_url": "http://localhost:7700",
        "api_keys": [],
    },
    "server": {"host": "127.0.0.1", "port": 7700},
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def load_json(path, fallback):
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        logging.warning("%s bulunamadi, varsayilan degerler kullaniliyor.", path)
        return fallback
    except json.JSONDecodeError as exc:
        logging.error("%s okunamadi: %s", path, exc)
        return fallback


CONFIG = load_json(CONFIG_PATH, FALLBACK_CONFIG)
AGENTS = load_json(AGENTS_PATH, [])
AGENT_MAP = {agent["id"]: agent for agent in AGENTS}

key_lock = threading.Lock()
key_index = 0


def public_agent(agent):
    return {
        "id": agent["id"],
        "name": agent["name"],
        "role": agent["role"],
    }


def next_api_key():
    global key_index
    keys = [
        key.strip()
        for key in CONFIG.get("openrouter", {}).get("api_keys", [])
        if key and not key.startswith("OPENROUTER_API_KEY_")
    ]
    if not keys:
        raise RuntimeError("/etc/anka/config.json icinde gecerli OpenRouter API anahtari yok.")

    with key_lock:
        key = keys[key_index % len(keys)]
        key_index += 1
        return key


def clamp_history(history, max_messages=20):
    if not isinstance(history, list):
        return []

    clean = []
    for item in history[-max_messages:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            clean.append({"role": role, "content": content.strip()})
    return clean


def call_openrouter(agent, message, history):
    openrouter = CONFIG.get("openrouter", {})
    payload = {
        "model": openrouter.get("model", "openai/gpt-4o"),
        "messages": [
            {"role": "system", "content": agent["system_prompt"]},
            *clamp_history(history),
            {"role": "user", "content": message},
        ],
        "temperature": 0.7,
    }

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        openrouter.get("base_url", FALLBACK_CONFIG["openrouter"]["base_url"]),
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {next_api_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": openrouter.get("site_url", "http://localhost:7700"),
            "X-Title": openrouter.get("app_name", "Anka Intelligence OS"),
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenRouter baglanti hatasi: {exc.reason}") from exc

    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"OpenRouter beklenmeyen yanit dondurdu: {data}") from exc


class YonHandler(BaseHTTPRequestHandler):
    server_version = "AnkaYon/1.0"

    def log_message(self, fmt, *args):
        logging.info("%s - %s", self.address_string(), fmt % args)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/config":
            self.send_json(200, {"agents": [public_agent(agent) for agent in AGENTS]})
            return

        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return

        self.send_json(404, {"error": "Bulunamadi"})

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_json(404, {"error": "Bulunamadi"})
            return

        try:
            payload = self.read_json()
            agent_id = payload.get("agent_id")
            message = payload.get("message", "").strip()
            history = payload.get("history", [])

            if agent_id not in AGENT_MAP:
                self.send_json(400, {"error": "Gecersiz ajan secimi."})
                return
            if not message:
                self.send_json(400, {"error": "Mesaj bos olamaz."})
                return

            answer = call_openrouter(AGENT_MAP[agent_id], message, history)
            self.send_json(200, {"answer": answer})
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Gecersiz JSON govdesi."})
        except Exception as exc:
            logging.exception("Sohbet istegi basarisiz oldu.")
            self.send_json(500, {"error": str(exc)})


def main():
    server_config = CONFIG.get("server", {})
    host = server_config.get("host", "127.0.0.1")
    port = int(server_config.get("port", 7700))

    if not AGENTS:
        raise SystemExit("agents.json bos veya okunamadi.")

    httpd = ThreadingHTTPServer((host, port), YonHandler)
    logging.info("Anka YON %s:%s adresinde dinliyor.", host, port)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
