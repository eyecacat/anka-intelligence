/**
 * Anka Intelligence OS — Kiosk Frontend
 *
 * - Lisans anahtarını sessionStorage'da tutar (sekme kapanınca silinir)
 * - Sohbet geçmişini sessionStorage'da tutar (F5 yenilemede korunur)
 * - API key asla localStorage'a yazılmaz (kiosk güvenliği)
 * - Tüm AI yanıtları marked.js ile Markdown olarak render edilir
 * - Hata kodları Toast Notification ile Türkçe gösterilir
 */

"use strict";

// ── Sabitler ──────────────────────────────────────────────
const API_BASE       = "http://127.0.0.1:5050";
const KEY_SESSION    = "anka_license_key";
const HISTORY_PREFIX = "anka_history_";
const ACTIVE_AGENT   = "anka_active_agent";

// ── Durum ─────────────────────────────────────────────────
let currentAgentId    = "genel";
let agents            = [];
let isSending         = false;

// ── DOM Referansları ──────────────────────────────────────
const overlay         = document.getElementById("activation-overlay");
const appShell        = document.getElementById("app");
const licenseInput    = document.getElementById("license-input");
const activateBtn     = document.getElementById("activate-btn");
const toggleKeyVis    = document.getElementById("toggle-key-vis");
const agentList       = document.getElementById("agent-list");
const messagesEl      = document.getElementById("messages");
const userInput       = document.getElementById("user-input");
const sendBtn         = document.getElementById("send-btn");
const agentTitle      = document.getElementById("active-agent-name");
const agentModel      = document.getElementById("active-agent-model");
const clearBtn        = document.getElementById("clear-session-btn");
const logoutBtn       = document.getElementById("logout-btn");

// ═══════════════════════════════════════════════════════════
// TOAST SİSTEMİ
// ═══════════════════════════════════════════════════════════

const TOAST_ICONS = {
  error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>`,
  warn:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

/**
 * Toast göster
 * @param {string} title   - Başlık
 * @param {string} message - Açıklama
 * @param {'error'|'success'|'warn'|'info'} type
 * @param {number} duration - ms (0 = kalıcı)
 */
function showToast(title, message = "", type = "info", duration = 5000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");

  toast.innerHTML = `
    ${TOAST_ICONS[type] || TOAST_ICONS.info}
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${message ? `<div class="toast-message">${escHtml(message)}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Kapat">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  const dismiss = () => {
    toast.classList.add("dismissing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  container.appendChild(toast);

  if (duration > 0) setTimeout(dismiss, duration);
}

// HTTP hata kodu → Türkçe mesaj
function toastFromStatus(status) {
  const map = {
    401: ["Lisans Anahtarı Geçersiz", "Lütfen geçerli bir OpenRouter API anahtarı girin.", "error"],
    402: ["Kota Doldu",               "Hesabınızın kullanım kotası tükendi.",              "warn"],
    429: ["Çok Fazla İstek",          "Lütfen birkaç saniye bekleyip tekrar deneyin.",     "warn"],
    500: ["Sunucu Hatası",            "Yapay zeka servisi geçici bir hata döndürdü.",      "error"],
    503: ["Bağlantı Hatası",          "Sunucuya ulaşılamıyor. Ağ bağlantınızı kontrol edin.", "error"],
    504: ["Zaman Aşımı",              "Sunucu yanıt vermedi. Lütfen tekrar deneyin.",     "warn"],
  };
  const [title, msg, type] = map[status] || ["Beklenmedik Hata", `HTTP ${status}`, "error"];
  showToast(title, msg, type);
}

// ═══════════════════════════════════════════════════════════
// LİSANS AKTİVASYON
// ═══════════════════════════════════════════════════════════

function getLicenseKey() {
  return sessionStorage.getItem(KEY_SESSION) || "";
}

function saveLicenseKey(key) {
  sessionStorage.setItem(KEY_SESSION, key);
}

function clearLicenseKey() {
  sessionStorage.removeItem(KEY_SESSION);
}

function showApp() {
  overlay.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function showOverlay() {
  appShell.classList.add("hidden");
  overlay.classList.remove("hidden");
  licenseInput.value = "";
  licenseInput.classList.remove("error");
}

// Toggle göster/gizle
toggleKeyVis.addEventListener("click", () => {
  const isPass = licenseInput.type === "password";
  licenseInput.type = isPass ? "text" : "password";
  toggleKeyVis.querySelector("svg").style.opacity = isPass ? "1" : "0.5";
});

activateBtn.addEventListener("click", handleActivation);
licenseInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleActivation();
});

async function handleActivation() {
  const key = licenseInput.value.trim();

  if (!key) {
    licenseInput.classList.add("error");
    licenseInput.focus();
    showToast("Anahtar Gerekli", "Lütfen lisans anahtarınızı girin.", "warn");
    return;
  }

  licenseInput.classList.remove("error");
  activateBtn.disabled = true;
  activateBtn.querySelector(".btn-text").textContent = "Doğrulanıyor...";

  // Anahtarı kaydet ve uygulamayı başlat
  saveLicenseKey(key);

  try {
    await loadAgents();
    showApp();
    showToast("Etkinleştirildi", "Anka Intelligence OS hazır.", "success", 3000);
  } catch (err) {
    clearLicenseKey();
    showToast("Bağlantı Hatası", "Backend servisi başlatılamadı.", "error");
  } finally {
    activateBtn.disabled = false;
    activateBtn.querySelector(".btn-text").textContent = "Etkinleştir";
  }
}

// ═══════════════════════════════════════════════════════════
// AJAN YÖNETİMİ
// ═══════════════════════════════════════════════════════════

async function loadAgents() {
  const resp = await fetch(`${API_BASE}/api/agents`);
  if (!resp.ok) throw new Error("Agent listesi alınamadı");
  const data = await resp.json();
  agents = data.agents;
  renderAgentList();

  const savedAgent = sessionStorage.getItem(ACTIVE_AGENT);
  const target = agents.find(a => a.id === savedAgent) || agents[0];
  if (target) switchAgent(target.id);
}

function renderAgentList() {
  agentList.innerHTML = "";
  agents.forEach(agent => {
    const btn = document.createElement("button");
    btn.className = "agent-btn";
    btn.textContent = agent.name;
    btn.dataset.agentId = agent.id;
    btn.setAttribute("aria-label", `${agent.name} ajanına geç`);
    btn.addEventListener("click", () => switchAgent(agent.id));
    agentList.appendChild(btn);
  });
}

function switchAgent(agentId) {
  currentAgentId = agentId;
  sessionStorage.setItem(ACTIVE_AGENT, agentId);

  document.querySelectorAll(".agent-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.agentId === agentId);
  });

  const agent = agents.find(a => a.id === agentId);
  if (agent) {
    agentTitle.textContent = agent.name;
    agentModel.textContent = agent.model;
  }

  loadChatHistory();
}

// ═══════════════════════════════════════════════════════════
// CHAT GEÇMİŞİ (sessionStorage)
// ═══════════════════════════════════════════════════════════

function historyKey(agentId) {
  return `${HISTORY_PREFIX}${agentId}`;
}

function getHistory(agentId) {
  try {
    return JSON.parse(sessionStorage.getItem(historyKey(agentId))) || [];
  } catch { return []; }
}

function saveHistory(agentId, messages) {
  try {
    sessionStorage.setItem(historyKey(agentId), JSON.stringify(messages));
  } catch (e) {
    console.warn("sessionStorage yazma hatası:", e);
  }
}

function clearHistory(agentId) {
  sessionStorage.removeItem(historyKey(agentId));
}

function loadChatHistory() {
  messagesEl.innerHTML = "";
  const history = getHistory(currentAgentId);

  if (history.length === 0) {
    renderEmptyState();
    return;
  }

  history.forEach(msg => {
    appendMessage(msg.role, msg.content, false);
  });

  scrollToBottom();
}

function renderEmptyState() {
  messagesEl.innerHTML = `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
        <path d="M24 4L6 14V34L24 44L42 34V14L24 4Z" stroke="#F59E0B" stroke-width="1.5" fill="none"/>
        <circle cx="24" cy="24" r="5" fill="#F59E0B" opacity="0.5"/>
      </svg>
      <p>Bir şeyler sorun, başlayalım.</p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// MESAJ RENDER
// ═══════════════════════════════════════════════════════════

function appendMessage(role, content, persist = true) {
  // Empty state'i kaldır
  const es = messagesEl.querySelector(".empty-state");
  if (es) es.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "S" : "A";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (role === "assistant") {
    // Markdown render (marked.js mevcutsa)
    if (window.marked && typeof window.marked.parse === "function") {
      bubble.innerHTML = window.marked.parse(content);
    } else {
      bubble.textContent = content;
    }
  } else {
    bubble.textContent = content;
  }

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();

  // Geçmişe kaydet
  if (persist) {
    const history = getHistory(currentAgentId);
    history.push({ role, content });
    saveHistory(currentAgentId, history);
  }
}

function appendTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant typing-indicator";
  wrapper.id = "typing-indicator";

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = "A";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ═══════════════════════════════════════════════════════════
// API İSTEĞİ
// ═══════════════════════════════════════════════════════════

async function sendMessage() {
  if (isSending) return;

  const text = userInput.value.trim();
  if (!text) return;

  const key = getLicenseKey();
  if (!key) {
    showOverlay();
    return;
  }

  // UI
  userInput.value = "";
  resizeTextarea();
  appendMessage("user", text);
  isSending = true;
  sendBtn.disabled = true;

  const typingEl = appendTypingIndicator();

  // Geçmişi API için hazırla
  const history = getHistory(currentAgentId);
  const messages = history.map(m => ({ role: m.role, content: m.content }));

  try {
    const resp = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type":       "application/json",
        "X-Anka-License-Key": key,
      },
      body: JSON.stringify({
        agent_id: currentAgentId,
        messages,
      }),
    });

    typingEl.remove();

    if (!resp.ok) {
      toastFromStatus(resp.status);

      // 401'de anahtarı temizleyip overlay'e dön
      if (resp.status === 401) {
        clearLicenseKey();
        setTimeout(() => showOverlay(), 1500);
      }
      return;
    }

    const data = await resp.json();
    appendMessage("assistant", data.reply);

  } catch (err) {
    typingEl.remove();
    console.error("Fetch hatası:", err);
    showToast("Bağlantı Hatası", "Backend servisine ulaşılamıyor.", "error");
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// ═══════════════════════════════════════════════════════════
// INPUT DAVRANIŞI
// ═══════════════════════════════════════════════════════════

function resizeTextarea() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + "px";
}

userInput.addEventListener("input", resizeTextarea);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// ═══════════════════════════════════════════════════════════
// KONTROL DÜĞMELERİ
// ═══════════════════════════════════════════════════════════

clearBtn.addEventListener("click", () => {
  clearHistory(currentAgentId);
  messagesEl.innerHTML = "";
  renderEmptyState();
  showToast("Temizlendi", "Sohbet geçmişi silindi.", "info", 2500);
});

logoutBtn.addEventListener("click", () => {
  clearLicenseKey();
  // Tüm geçmişleri temizle
  agents.forEach(a => clearHistory(a.id));
  sessionStorage.removeItem(ACTIVE_AGENT);
  showOverlay();
  showToast("Çıkış Yapıldı", "Lisans anahtarı oturumdan silindi.", "info", 3000);
});

// ═══════════════════════════════════════════════════════════
// YARDIMCI
// ═══════════════════════════════════════════════════════════

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════
// BAŞLANGIÇ
// ═══════════════════════════════════════════════════════════

(function init() {
  const existingKey = getLicenseKey();

  if (existingKey) {
    // Oturum açık: doğrudan uygulamayı yükle
    loadAgents()
      .then(() => showApp())
      .catch(() => {
        clearLicenseKey();
        showOverlay();
        showToast("Oturum Hatası", "Oturum yenilenemedi, lütfen tekrar giriş yapın.", "warn");
      });
  } else {
    // Lisans girişi gerekli
    overlay.classList.remove("hidden");
    licenseInput.focus();
  }
})();
