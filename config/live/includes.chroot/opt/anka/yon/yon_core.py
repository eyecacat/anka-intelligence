#!/usr/bin/env python3
"""
Anka Intelligence OS — Yön Core Backend
API key'ler config.json'da TUTULMAZ.
Her istek için key, HTTP header üzerinden alınır.
"""

import json
import logging
import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger("yon_core")

# ── Config ───────────────────────────────────────────────────────────────────
CONFIG_PATH = "/etc/anka/config.json"

def load_config() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)

CONFIG = load_config()

# ── Flask ─────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_key(req) -> str | None:
    """
    Header'dan API key'i çıkar.
    Önce X-Anka-License-Key, sonra Authorization: Bearer <key> dener.
    """
    key = req.headers.get("X-Anka-License-Key")
    if key:
        return key.strip()

    auth = req.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()

    return None


def _get_agent_model(agent_id: str) -> str:
    for agent in CONFIG["agents"]:
        if agent["id"] == agent_id:
            return agent["model"]
    return CONFIG["agents"][0]["model"]


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "yon_core"}), 200


@app.route("/api/agents", methods=["GET"])
def agents():
    return jsonify({"agents": CONFIG["agents"]}), 200


@app.route("/api/chat", methods=["POST"])
def chat():
    # 1. Key kontrolü
    api_key = _extract_key(request)
    if not api_key:
        log.warning("İstek geldi ancak API key eksik.")
        return jsonify({
            "error": "unauthorized",
            "message": "Lisans anahtarı bulunamadı. Lütfen geçerli bir anahtar girin."
        }), 401

    # 2. Body doğrulama
    body = request.get_json(silent=True) or {}
    messages  = body.get("messages")
    agent_id  = body.get("agent_id", "genel")

    if not messages or not isinstance(messages, list):
        return jsonify({
            "error": "bad_request",
            "message": "Geçersiz istek formatı. 'messages' alanı zorunludur."
        }), 400

    # 3. OpenRouter isteği
    model = _get_agent_model(agent_id)
    or_url = CONFIG["openrouter"]["base_url"]

    headers = {
        "Authorization":  f"Bearer {api_key}",
        "HTTP-Referer":   CONFIG["openrouter"]["site_url"],
        "X-Title":        CONFIG["openrouter"]["site_name"],
        "Content-Type":   "application/json",
    }

    payload = {
        "model":    model,
        "messages": messages,
    }

    try:
        resp = requests.post(or_url, headers=headers, json=payload, timeout=60)
    except requests.exceptions.Timeout:
        log.error("OpenRouter isteği zaman aşımına uğradı.")
        return jsonify({
            "error": "timeout",
            "message": "Yapay zeka sunucusuna bağlanılamadı. Lütfen tekrar deneyin."
        }), 504
    except requests.exceptions.RequestException as e:
        log.error(f"OpenRouter bağlantı hatası: {e}")
        return jsonify({
            "error": "connection_error",
            "message": "Sunucuya ulaşılamıyor. Ağ bağlantınızı kontrol edin."
        }), 503

    # 4. Upstream hata yönetimi
    if resp.status_code == 401:
        log.warning(f"OpenRouter 401 — geçersiz key (son 4: ...{api_key[-4:]})")
        return jsonify({
            "error": "unauthorized",
            "message": "Lisans anahtarı geçersiz veya süresi dolmuş."
        }), 401

    if resp.status_code == 429:
        log.warning("OpenRouter 429 — rate limit aşıldı.")
        return jsonify({
            "error": "rate_limit",
            "message": "Çok fazla istek gönderildi. Lütfen birkaç saniye bekleyin."
        }), 429

    if resp.status_code == 402:
        return jsonify({
            "error": "quota_exceeded",
            "message": "Kullanım kotanız doldu. Lütfen hesabınızı kontrol edin."
        }), 402

    if not resp.ok:
        log.error(f"OpenRouter {resp.status_code}: {resp.text[:200]}")
        return jsonify({
            "error": "upstream_error",
            "message": f"Yapay zeka servisi hata döndürdü (HTTP {resp.status_code})."
        }), 500

    # 5. Başarılı yanıt
    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return jsonify({"reply": content, "model": model}), 200
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        log.error(f"Yanıt parse hatası: {e}")
        return jsonify({
            "error": "parse_error",
            "message": "Yapay zeka yanıtı işlenemedi."
        }), 500


# ── Entry ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    srv = CONFIG["server"]
    log.info(f"Yon Core başlatılıyor: {srv['host']}:{srv['port']}")
    app.run(
        host=srv["host"],
        port=srv["port"],
        debug=srv.get("debug", False)
    )
