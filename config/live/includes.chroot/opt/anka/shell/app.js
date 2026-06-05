const API_BASE = "http://127.0.0.1:7700";

const state = {
  agents: [],
  activeAgentId: null,
  histories: {},
  sending: false,
};

const agentList = document.querySelector("#agentList");
const agentName = document.querySelector("#agentName");
const agentRole = document.querySelector("#agentRole");
const messages = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const connectionStatus = document.querySelector("#connectionStatus");

function setStatus(text, variant = "neutral") {
  connectionStatus.textContent = text;
  connectionStatus.dataset.variant = variant;
}

function activeAgent() {
  return state.agents.find((agent) => agent.id === state.activeAgentId);
}

function historyFor(agentId) {
  if (!state.histories[agentId]) {
    state.histories[agentId] = [
      {
        role: "assistant",
        content: "Merhaba. Ben hazirim. Bugun hangi konuya odaklanalim?",
      },
    ];
  }
  return state.histories[agentId];
}

function renderAgents() {
  agentList.innerHTML = "";

  state.agents.forEach((agent) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "agent-button";
    button.dataset.active = String(agent.id === state.activeAgentId);
    button.innerHTML = `
      <span class="agent-avatar">${agent.name.slice(0, 2).toUpperCase()}</span>
      <span>
        <strong>${agent.name}</strong>
        <small>${agent.role}</small>
      </span>
    `;
    button.addEventListener("click", () => selectAgent(agent.id));
    agentList.appendChild(button);
  });
}

function renderMessages() {
  messages.innerHTML = "";

  historyFor(state.activeAgentId).forEach((message) => {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = message.role === "user" ? "Siz" : activeAgent()?.name || "Anka";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message.content;

    item.append(label, bubble);
    messages.appendChild(item);
  });

  messages.scrollTop = messages.scrollHeight;
}

function selectAgent(agentId) {
  state.activeAgentId = agentId;
  const agent = activeAgent();
  agentName.textContent = agent.name;
  agentRole.textContent = agent.role;
  renderAgents();
  renderMessages();
  messageInput.focus();
}

function setSending(isSending) {
  state.sending = isSending;
  sendButton.disabled = isSending;
  messageInput.disabled = isSending;
  sendButton.textContent = isSending ? "Bekleyin" : "Gonder";
}

async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) {
      throw new Error(`Sunucu ${response.status} dondu`);
    }

    const data = await response.json();
    state.agents = data.agents || [];
    if (!state.agents.length) {
      throw new Error("Ajan listesi bos.");
    }

    setStatus("Hazir", "ok");
    selectAgent(state.agents[0].id);
  } catch (error) {
    setStatus("YON baglantisi yok", "error");
    agentName.textContent = "Baglanti bekleniyor";
    agentRole.textContent = "YON servisi henuz hazir degil. Birazdan tekrar deneyin.";
    messages.innerHTML = `
      <article class="message assistant">
        <span class="message-label">Sistem</span>
        <div class="message-bubble">${error.message}</div>
      </article>
    `;
  }
}

async function sendMessage(text) {
  const agentId = state.activeAgentId;
  const history = historyFor(agentId);

  history.push({ role: "user", content: text });
  renderMessages();
  setSending(true);

  try {
    const apiHistory = history
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(0, -1);

    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        message: text,
        history: apiHistory,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Bilinmeyen hata");
    }

    history.push({ role: "assistant", content: data.answer });
    setStatus("Hazir", "ok");
  } catch (error) {
    history.push({
      role: "assistant",
      content: `Istek tamamlanamadi: ${error.message}`,
    });
    setStatus("Hata", "error");
  } finally {
    setSending(false);
    renderMessages();
  }
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || state.sending || !state.activeAgentId) {
    return;
  }

  messageInput.value = "";
  messageInput.style.height = "auto";
  sendMessage(text);
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
});

loadConfig();
