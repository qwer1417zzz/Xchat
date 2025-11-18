const encoder = new TextEncoder();
const decoder = new TextDecoder();

const storageKeys = {
  history: "secure-chat-history",
  profile: "secure-chat-profile",
  connection: "secure-chat-connection",
  token: "secure-chat-token",
};

const state = {
  key: null,
  salt: null,
  name: "我",
  passphrase: null,
  keyFingerprint: null,
  keyCache: new Map(),
  token: localStorage.getItem(storageKeys.token) || null,
  user: null,
  authMode: "login",
  sessions: [],
  sessionMap: new Map(),
  activeSession: null,
  histories: new Map(),
  history: [],
  unreadMessages: new Map(),
  sessionViewMode: localStorage.getItem("sessionViewMode") || "detailed",
  sessionPage: 1,
  sessionPageSize: 5,
  connection: {
    socket: null,
    server: (() => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      const port = window.location.port || (protocol === "wss:" ? "443" : "80");
      if (port && port !== "80" && port !== "443") {
        return `${protocol}//${host}:${port}`;
      }
      return `${protocol}//${host}`;
    })(),
    status: "offline",
    cleanup: null,
    room: null,
  },
};

const pollers = [];

const dom = {
  keyStatus: document.getElementById("keyStatus"),
  setupForm: document.getElementById("setupForm"),
  displayName: document.getElementById("displayName"),
  passphrase: document.getElementById("passphrase"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatHistory: document.getElementById("chatHistory"),
  clearHistory: document.getElementById("clearHistory"),
  refreshSession: document.getElementById("refreshSession"),
  leaveSession: document.getElementById("leaveSession"),
  togglePassword: document.getElementById("togglePassword"),
  chatRoomHeading: document.getElementById("chatRoomHeading"),
  participantLabel: document.getElementById("participantLabel"),
  connectionStatus: document.getElementById("connectionStatus"),
  toast: document.getElementById("toast"),
  template: document.getElementById("messageTemplate"),
  logPanel: document.getElementById("logPanel"),
  clearLog: document.getElementById("clearLog"),
  profileId: document.getElementById("profileId"),
  profileName: document.getElementById("profileName"),
  copyIdBtn: document.getElementById("copyIdBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  friendRequestForm: document.getElementById("friendRequestForm"),
  friendIdInput: document.getElementById("friendIdInput"),
  friendsList: document.getElementById("friendsList"),
  requestsList: document.getElementById("requestsList"),
  sessionCreateForm: document.getElementById("sessionCreateForm"),
  sessionName: document.getElementById("sessionName"),
  sessionCapacity: document.getElementById("sessionCapacity"),
  sessionList: document.getElementById("sessionList"),
  sessionViewMode: document.getElementById("sessionViewMode"),
  sessionPagePrev: document.getElementById("sessionPagePrev"),
  sessionPageNext: document.getElementById("sessionPageNext"),
  serverUrl: document.getElementById("serverUrl"),
  authLayer: document.getElementById("authLayer"),
  authForm: document.getElementById("authForm"),
  authUsername: document.getElementById("authUsername"),
  authPassword: document.getElementById("authPassword"),
  authTitle: document.getElementById("authTitle"),
  authSubmit: document.getElementById("authSubmit"),
  toggleAuthMode: document.getElementById("toggleAuthMode"),
  authError: document.getElementById("authError"),
};

let toastTimer;

function panelStateKey(id) {
  return id ? `panel-state:${id}` : null;
}

function setPanelCollapsed(panel, collapsed) {
  panel.classList.toggle("collapsed", collapsed);
  const toggle = panel.querySelector(".panel__toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "展开" : "收起";
  }
  const key = panelStateKey(panel.id || panel.dataset.panel);
  if (key) {
    localStorage.setItem(key, collapsed ? "collapsed" : "expanded");
  }
}

function restorePanelStates() {
  document.querySelectorAll(".collapsible").forEach((panel) => {
    const key = panelStateKey(panel.id || panel.dataset.panel);
    if (!key) return;
    const stored = localStorage.getItem(key);
    if (stored === "collapsed") {
      setPanelCollapsed(panel, true);
    }
  });
}

function togglePanel(button) {
  const panel = button.closest(".collapsible");
  if (!panel) return;
  const collapsed = !panel.classList.contains("collapsed");
  setPanelCollapsed(panel, collapsed);
}

function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.classList.remove("hidden");
  dom.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("visible");
    dom.toast.classList.add("hidden");
  }, 2600);
}

function logEvent(message, variant = "info") {
  if (!dom.logPanel) return;
  const row = document.createElement("span");
  row.dataset.variant = variant;
  row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  dom.logPanel.appendChild(row);
  dom.logPanel.scrollTop = dom.logPanel.scrollHeight;
}

function historyStoreKey(sessionId) {
  return `${storageKeys.history}:${sessionId || "default"}`;
}

function loadHistoryFor(sessionId) {
  const key = historyStoreKey(sessionId);
  if (state.histories.has(key)) {
    state.history = state.histories.get(key);
    return;
  }
  const raw = localStorage.getItem(key);
  try {
    state.history = raw ? JSON.parse(raw) : [];
  } catch {
    state.history = [];
  }
  state.histories.set(key, state.history);
}

function saveHistoryFor(sessionId) {
  const key = historyStoreKey(sessionId);
  state.histories.set(key, state.history);
  localStorage.setItem(key, JSON.stringify(state.history));
}

function saveProfile() {
  if (!state.salt) return;
  localStorage.setItem(
    storageKeys.profile,
    JSON.stringify({ name: state.name, salt: arrayBufferToBase64(state.salt) })
  );
}

function loadProfilePreferences() {
  const raw = localStorage.getItem(storageKeys.profile);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.name) state.name = data.name;
    if (data.salt) state.salt = base64ToArrayBuffer(data.salt);
  } catch {
    /* ignore */
  }
}

function saveConnectionPrefs() {
  localStorage.setItem(
    storageKeys.connection,
    JSON.stringify({ server: state.connection.server, room: state.connection.room })
  );
}

function loadConnectionPrefs() {
  const raw = localStorage.getItem(storageKeys.connection);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data.server) state.connection.server = data.server;
      if (data.room) state.connection.room = data.room;
    } catch {
      /* ignore */
    }
  }
}

function normalizeServerUrl(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/\/+$/, "");
  if (cleaned.startsWith("ws://") || cleaned.startsWith("wss://")) {
    return cleaned;
  }
  return `ws://${cleaned}`;
}

function resolveApiBase() {
  if (!state.connection.server) return "";
  if (state.connection.server.startsWith("wss://")) {
    return state.connection.server.replace("wss://", "https://");
  }
  if (state.connection.server.startsWith("ws://")) {
    return state.connection.server.replace("ws://", "http://");
  }
  return state.connection.server;
}

async function api(path, { method = "GET", body } = {}) {
  const base = resolveApiBase();
  if (!base) throw new Error("请先配置中继服务器地址");
  const headers = {};
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: payload,
  }).catch((error) => {
    throw new Error(error.message || "无法连接服务器");
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("登录状态已过期");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "操作失败");
  }
  return data;
}

function handleUnauthorized() {
  if (!state.token) return;
  localStorage.removeItem(storageKeys.token);
  state.token = null;
  state.user = null;
  stopPolling();
  showAuthLayer(true);
  disconnectFromRoom("未连接");
  logEvent("登录状态已失效", "error");
}

function showAuthLayer(force) {
  if (!dom.authLayer) return;
  const shouldShow = force || !state.user;
  dom.authLayer.classList.toggle("hidden", !shouldShow);
}

function stopPolling() {
  pollers.forEach((timer) => clearInterval(timer));
  pollers.length = 0;
}

function startPolling() {
  stopPolling();
  pollers.push(setInterval(refreshProfile, 8000));
  pollers.push(setInterval(refreshSessions, 8000));
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === "login";
  dom.authTitle.textContent = isLogin ? "登录账户" : "注册新账户";
  dom.authSubmit.textContent = isLogin ? "登录" : "注册";
  dom.toggleAuthMode.textContent = isLogin ? "切换到注册" : "切换到登录";
}

function onAuthenticated(token, userPayload) {
  state.token = token;
  localStorage.setItem(storageKeys.token, token);
  state.user = userPayload;
  showAuthLayer(false);
  dom.authForm.reset();
  dom.authError.textContent = "";
  state.name = state.user.username || state.name;
  updateKeyStatus(Boolean(state.key));
  updateProfileUI();
  renderFriends();
  renderRequests();
  refreshSessions();
  startPolling();
  logEvent(`已登录：${state.user.username}`);
}

async function refreshProfile() {
  if (!state.token) return;
  try {
    const data = await api("/api/profile");
    state.user = data.user;
    state.name = state.user.username || state.name;
    updateKeyStatus(Boolean(state.key));
    updateProfileUI();
    renderFriends();
    renderRequests();
  } catch (error) {
    logEvent(error.message, "error");
  }
}

function enrichSession(session) {
  return {
    ...session,
    isOwner: session.ownerId === state.user?.userId,
    isMember: session.members.includes(state.user?.userId),
  };
}

async function refreshSessions() {
  if (!state.token) return;
  try {
    const url = state.keyFingerprint 
      ? `/api/sessions?keyFingerprint=${encodeURIComponent(state.keyFingerprint)}`
      : "/api/sessions";
    const data = await api(url);
    state.sessionMap.clear();
    data.sessions.forEach((session) => {
      const enriched = enrichSession(session);
      state.sessionMap.set(enriched.id, enriched);
    });
    state.sessions = Array.from(state.sessionMap.values());
    const totalPages = Math.ceil(state.sessions.length / state.sessionPageSize);
    if (state.sessionPage > totalPages && totalPages > 0) {
      state.sessionPage = totalPages;
    }
    renderSessions();
    if (state.connection.room && state.sessionMap.has(state.connection.room)) {
      setActiveSession(state.connection.room, { autoConnect: false });
    } else if (state.activeSession && !state.sessionMap.has(state.activeSession.id)) {
      setActiveSession(null);
    }
  } catch (error) {
    logEvent(error.message, "error");
  }
}

function updateProfileUI() {
  if (!state.user) return;
  dom.profileId.textContent = state.user.userId || "-";
  dom.profileName.textContent = state.user.username || "-";
}

function renderFriends() {
  if (!dom.friendsList) return;
  const friends = state.user?.friends || [];
  if (!friends.length) {
    dom.friendsList.textContent = "暂无好友";
    dom.friendsList.classList.add("empty");
    return;
  }
  dom.friendsList.classList.remove("empty");
  dom.friendsList.innerHTML = "";
  friends.forEach((friendId) => {
    const row = document.createElement("div");
    row.className = "friend-item";
    row.innerHTML = `
      <span>${friendId}</span>
      <button class="ghost small" data-action="delete-friend" data-friend-id="${friendId}">删除</button>
    `;
    dom.friendsList.appendChild(row);
  });
}

function renderRequests() {
  if (!dom.requestsList) return;
  const incoming = state.user?.incomingRequests || [];
  const outgoing = state.user?.outgoingRequests || [];
  if (!incoming.length && !outgoing.length) {
    dom.requestsList.textContent = "没有新的好友请求";
    dom.requestsList.classList.add("empty");
    return;
  }
  dom.requestsList.classList.remove("empty");
  dom.requestsList.innerHTML = "";
  incoming.forEach((id) => {
    const row = document.createElement("div");
    row.className = "request-row";
    row.innerHTML = `<span>来自 ${id}</span>`;
    const btn = document.createElement("button");
    btn.className = "ghost small";
    btn.dataset.action = "accept-friend";
    btn.dataset.userId = id;
    btn.textContent = "接受";
    row.appendChild(btn);
    dom.requestsList.appendChild(row);
  });
  outgoing.forEach((id) => {
    const row = document.createElement("div");
    row.className = "request-row";
    row.textContent = `已发送给 ${id}`;
    dom.requestsList.appendChild(row);
  });
}

function renderSessions() {
  if (!dom.sessionList) return;
  if (!state.sessions.length) {
    dom.sessionList.classList.add("empty");
    dom.sessionList.textContent = "暂无会话，先创建或加入";
    if (dom.sessionPagePrev) dom.sessionPagePrev.style.display = "none";
    if (dom.sessionPageNext) dom.sessionPageNext.style.display = "none";
    return;
  }
  dom.sessionList.classList.remove("empty");
  dom.sessionList.innerHTML = "";
  
  const sortedSessions = state.sessions
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.createdAt - b.createdAt);
  
  const totalPages = Math.ceil(sortedSessions.length / state.sessionPageSize);
  const startIndex = (state.sessionPage - 1) * state.sessionPageSize;
  const endIndex = startIndex + state.sessionPageSize;
  const paginatedSessions = sortedSessions.slice(startIndex, endIndex);
  
  if (dom.sessionPagePrev && dom.sessionPageNext) {
    dom.sessionPagePrev.style.display = state.sessionPage > 1 ? "inline-block" : "none";
    dom.sessionPageNext.style.display = state.sessionPage < totalPages ? "inline-block" : "none";
  }
  
  const isDetailed = state.sessionViewMode === "detailed";
  if (dom.sessionViewMode) {
    dom.sessionViewMode.textContent = isDetailed ? "详细" : "大概";
    dom.sessionViewMode.dataset.mode = state.sessionViewMode;
  }
  
  paginatedSessions.forEach((session) => {
      const card = document.createElement("article");
      card.className = `session-card ${isDetailed ? "session-card--detailed" : "session-card--compact"}`;
      card.dataset.sessionId = session.id;
      const unreadCount = state.unreadMessages.get(session.id) || 0;
      const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : "";
      
      if (isDetailed) {
        card.innerHTML = `
          <strong>${session.name}${unreadBadge}</strong>
          <div class="session-card__meta">ID：${session.id}</div>
          <div class="session-card__meta">成员 ${session.members.length}/${session.capacity} · 房主 ${session.ownerId}</div>
          <div class="session-card__actions"></div>
        `;
      } else {
        card.innerHTML = `
          <div class="session-card__compact-info">
            <div class="session-card__compact-item">
              <span class="session-card__compact-label">房间：</span>
              <span class="session-card__compact-value">${session.id}</span>
            </div>
            <div class="session-card__compact-item">
              <span class="session-card__compact-label">好友：</span>
              <span class="session-card__compact-value">${session.ownerId}</span>
              ${unreadBadge}
            </div>
          </div>
          <div class="session-card__actions"></div>
        `;
      }
      
      const actions = card.querySelector(".session-card__actions");
      if (isDetailed) {
        if (session.isMember) {
          const enter = document.createElement("button");
          enter.className = "ghost small";
          enter.dataset.action = "enter-session";
          enter.textContent = "进入";
          actions.appendChild(enter);
          if (!session.isOwner) {
            const leave = document.createElement("button");
            leave.className = "ghost small";
            leave.dataset.action = "leave-session";
            leave.textContent = "离开";
            actions.appendChild(leave);
          }
        } else {
          const join = document.createElement("button");
          join.dataset.action = "join-session";
          const ownerIsFriend =
            session.ownerId === state.user?.userId ||
            (state.user?.friends || []).includes(session.ownerId);
          const canJoin = session.members.length < session.capacity && ownerIsFriend;
          join.textContent = canJoin ? "加入" : ownerIsFriend ? "已满员" : "非好友不可加入";
          join.disabled = !canJoin;
          actions.appendChild(join);
        }
        if (session.isOwner) {
          const invite = document.createElement("button");
          invite.className = "ghost small";
          invite.dataset.action = "invite-friend";
          invite.textContent = "邀请";
          actions.appendChild(invite);
          const adjust = document.createElement("button");
          adjust.className = "ghost small";
          adjust.dataset.action = "adjust-capacity";
          adjust.textContent = "调容量";
          actions.appendChild(adjust);
          const del = document.createElement("button");
          del.className = "ghost small danger";
          del.dataset.action = "delete-session";
          del.textContent = "解散";
          actions.appendChild(del);
        }
        if (session.isOwner && session.isMember && session.members.length > 1) {
        const membersList = document.createElement("div");
        membersList.className = "session-members";
        membersList.style.marginTop = "8px";
        membersList.style.paddingTop = "8px";
        membersList.style.borderTop = "1px solid rgba(148, 163, 184, 0.2)";
        session.members.forEach((memberId) => {
          if (memberId === session.ownerId) return;
          const memberRow = document.createElement("div");
          memberRow.className = "member-item";
          memberRow.style.display = "flex";
          memberRow.style.justifyContent = "space-between";
          memberRow.style.alignItems = "center";
          memberRow.style.padding = "4px 0";
          memberRow.innerHTML = `
            <span class="member-name">${memberId}</span>
            <button class="ghost small danger" data-action="kick-member" data-user-id="${memberId}">踢出</button>
          `;
          membersList.appendChild(memberRow);
        });
        if (membersList.children.length > 0) {
          card.appendChild(membersList);
        }
      }
      } else {
        if (session.isMember) {
          const enter = document.createElement("button");
          enter.className = "ghost small";
          enter.dataset.action = "enter-session";
          enter.textContent = "进入";
          actions.appendChild(enter);
        } else {
          const join = document.createElement("button");
          join.className = "ghost small";
          join.dataset.action = "join-session";
          const ownerIsFriend =
            session.ownerId === state.user?.userId ||
            (state.user?.friends || []).includes(session.ownerId);
          const canJoin = session.members.length < session.capacity && ownerIsFriend;
          join.textContent = canJoin ? "加入" : "已满";
          join.disabled = !canJoin;
          actions.appendChild(join);
        }
      }
      dom.sessionList.appendChild(card);
    });
  updateNotificationDots();
}

function flashSessionCard(sessionId) {
  const card = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (card) {
    card.classList.add("has-new-message");
    setTimeout(() => {
      card.classList.remove("has-new-message");
    }, 500);
  }
}

function updateNotificationDots() {
  const sessionsPanel = document.getElementById("sessionsPanel");
  if (!sessionsPanel) return;
  const header = sessionsPanel.querySelector(".panel__header");
  if (!header) return;
  const hasUnread = Array.from(state.unreadMessages.values()).some(count => count > 0);
  if (hasUnread) {
    if (!header.querySelector(".notification-dot")) {
      const dot = document.createElement("span");
      dot.className = "notification-dot";
      header.appendChild(dot);
    }
    header.classList.add("has-notification");
  } else {
    header.classList.remove("has-notification");
  }
}

function updateParticipantLabel() {
  if (!dom.participantLabel) return;
  const session = state.activeSession;
  if (!session) {
    dom.participantLabel.textContent = "成员 0 / 0";
    dom.participantLabel.removeAttribute("title");
    return;
  }
  const members = session.members || [];
  dom.participantLabel.textContent = `成员 ${members.length} / ${session.capacity}`;
  dom.participantLabel.title = members.join(", ");
}

function updateMembersFromServer(sessionId, members, capacity) {
  if (!sessionId) return;
  const session = state.sessionMap.get(sessionId);
  if (session) {
    session.members = members;
    session.capacity = capacity;
    state.sessionMap.set(sessionId, session);
  }
  if (state.activeSession?.id === sessionId) {
    state.activeSession = session || state.activeSession;
    state.activeSession.members = members;
    state.activeSession.capacity = capacity;
    updateParticipantLabel();
  }
  state.sessions = Array.from(state.sessionMap.values());
  renderSessions();
}

function updateConnectionIndicator(status, text) {
  state.connection.status = status;
  if (dom.connectionStatus) {
    dom.connectionStatus.textContent = text || (status === "online" ? "已连接" : "未连接");
    dom.connectionStatus.classList.toggle("online", status === "online");
    dom.connectionStatus.classList.toggle("offline", status !== "online");
  }
}

function renderHistory() {
  const list = state.history;
  dom.chatHistory.innerHTML = "";
  if (!list.length) {
    dom.chatHistory.classList.add("empty");
    dom.chatHistory.innerHTML = `
      <div class="empty-state">
        <h3>等待连接</h3>
        <p>请先选择会话并生成共享密钥。</p>
      </div>`;
    return;
  }
  dom.chatHistory.classList.remove("empty");
  const isOwner = state.activeSession?.ownerId === state.user?.userId;
  const myUserId = state.user?.userId;
  list.forEach((record) => {
    const node = dom.template.content.firstElementChild.cloneNode(true);
    const isMyMessage = record.authorId === myUserId;
    node.classList.add(isMyMessage ? "outgoing" : "incoming");
    node.dataset.messageId = record.messageId || "";
    node.querySelector(".bubble__author").textContent = `${record.authorId || "未知"}`;
    node.querySelector(".bubble__time").textContent = new Date(
      record.timestamp
    ).toLocaleTimeString();
    node.querySelector(".bubble__body").textContent = record.plaintext;
    const deleteBtn = node.querySelector(".bubble__delete");
    if (isOwner && record.messageId) {
      deleteBtn.style.display = "inline-block";
      deleteBtn.dataset.messageId = record.messageId;
    }
    dom.chatHistory.appendChild(node);
  });
  requestAnimationFrame(() => {
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
  });
}

function appendRecord(record) {
  const sessionId = state.activeSession?.id || "default";
  let existingIndex = -1;
  if (record.messageId) {
    existingIndex = state.history.findIndex((r) => r.messageId === record.messageId);
  } else {
    existingIndex = state.history.findIndex(
      (r) =>
        r.timestamp === record.timestamp &&
        r.authorId === record.authorId &&
        r.plaintext === record.plaintext &&
        r.direction === record.direction
    );
  }
  if (existingIndex >= 0) {
    return;
  }
  state.history.push(record);
  saveHistoryFor(sessionId);
  renderHistory();
  const isMyMessage = record.authorId === state.user?.userId;
  if (isMyMessage) {
    if (record.direction === "out") {
      logEvent("已发送消息");
    } else {
      logEvent("已接收消息");
    }
  }
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 250000,
      salt,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function computeKeyFingerprint(passphrase) {
  const data = encoder.encode(passphrase);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return arrayBufferToBase64(hashBuffer);
}

async function generateKey(passphrase) {
  state.passphrase = passphrase;
  state.salt = crypto.getRandomValues(new Uint8Array(16));
  state.key = await deriveKey(passphrase, state.salt);
  state.keyFingerprint = await computeKeyFingerprint(passphrase);
  state.keyCache.clear();
  state.keyCache.set(arrayBufferToBase64(state.salt), state.key);
  saveProfile();
}

async function rehydrateKey(passphrase) {
  if (!state.salt) throw new Error("缺少盐值，无法恢复密钥");
  state.passphrase = passphrase;
  state.key = await deriveKey(passphrase, state.salt);
  state.keyFingerprint = await computeKeyFingerprint(passphrase);
  state.keyCache.clear();
  state.keyCache.set(arrayBufferToBase64(state.salt), state.key);
}

async function getKeyForSalt(saltB64) {
  if (!state.passphrase) throw new Error("请先输入共享口令生成密钥");
  if (state.key && saltB64 === arrayBufferToBase64(state.salt)) {
    return state.key;
  }
  if (state.keyCache.has(saltB64)) {
    return state.keyCache.get(saltB64);
  }
  const saltBuffer = base64ToArrayBuffer(saltB64);
  const key = await deriveKey(state.passphrase, saltBuffer);
  state.keyCache.set(saltB64, key);
  return key;
}

async function encryptMessage(plaintext) {
  if (!state.key) throw new Error("缺少共享密钥");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    state.key,
    encoder.encode(plaintext)
  );
  return [
    "v1",
    arrayBufferToBase64(state.salt),
    arrayBufferToBase64(iv),
    arrayBufferToBase64(ciphertext),
  ].join(":");
}

async function decryptPayload(payload) {
  const parts = payload.split(":");
  if (parts.length !== 4) throw new Error("密文格式不正确");
  const [version, saltB64, ivB64, dataB64] = parts;
  if (version !== "v1") throw new Error("密文版本不兼容");
  const key = await getKeyForSalt(saltB64);
  const iv = base64ToArrayBuffer(ivB64);
  const data = base64ToArrayBuffer(dataB64);
  return decoder.decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    )
  );
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function setActiveSession(sessionId, { autoConnect = true, forceReload = false } = {}) {
  if (sessionId && !state.sessionMap.has(sessionId)) return;
  const nextSession = sessionId ? state.sessionMap.get(sessionId) : null;
  if (state.activeSession?.id === sessionId && !forceReload) {
    state.activeSession = nextSession;
    updateParticipantLabel();
    if (autoConnect) {
      disconnectFromRoom();
      connectSocket();
    }
    return;
  }
  disconnectFromRoom();
  state.activeSession = nextSession;
  state.connection.room = sessionId || null;
  saveConnectionPrefs();
  if (state.activeSession) {
    dom.chatRoomHeading.textContent = state.activeSession.name;
    state.activeSession.members = state.activeSession.members || [];
    const key = historyStoreKey(state.activeSession.id);
    if (forceReload) {
      state.histories.delete(key);
    }
    loadHistoryFor(state.activeSession.id);
    updateParticipantLabel();
    renderHistory();
    if (sessionId) {
      state.unreadMessages.delete(sessionId);
      updateNotificationDots();
      renderSessions();
    }
    if (autoConnect) connectSocket();
  } else {
    dom.chatRoomHeading.textContent = "尚未选择会话";
    state.history = [];
    renderHistory();
    updateParticipantLabel();
  }
}

function disconnectFromRoom(message = "未连接") {
  if (state.connection.socket) {
    try {
      state.connection.socket.close();
    } catch {
      /* ignore */
    }
  }
  if (state.connection.cleanup) {
    state.connection.cleanup();
    state.connection.cleanup = null;
  }
  state.connection.socket = null;
  updateConnectionIndicator("offline", message);
}

function connectSocket() {
  if (!state.activeSession || !state.token) {
    updateConnectionIndicator("offline", "未连接");
    return;
  }
  const server = state.connection.server;
  if (!server) {
    logEvent("请先填写中继服务器地址", "error");
    return;
  }
  const url = `${server}?sessionId=${encodeURIComponent(
    state.activeSession.id
  )}&token=${encodeURIComponent(state.token)}`;
  try {
    const socket = new WebSocket(url);
    const handleOpen = () => {
      updateConnectionIndicator("online", `已连接 ${state.activeSession?.name || ""}`);
      logEvent(`已连接会话 ${state.activeSession?.name || ""}`);
      try {
        socket.send(JSON.stringify({ type: "members-request" }));
      } catch {
        /* ignore */
      }
    };
    const handleMessage = async (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload?.type === "members") {
        updateMembersFromServer(
          state.activeSession?.id,
          payload.members || [],
          payload.capacity || state.activeSession?.capacity || 0
        );
        return;
      }
      if (payload?.type === "session-deleted") {
        showToast("会话已被房主解散");
        const sessionId = state.connection.room;
        if (sessionId) {
          state.history = [];
          saveHistoryFor(sessionId);
          renderHistory();
        }
        setActiveSession(null);
        refreshSessions();
        return;
      }
      if (payload?.type === "message-deleted") {
        const messageId = payload.messageId;
        if (messageId) {
          const index = state.history.findIndex((r) => r.messageId === messageId);
          if (index >= 0) {
            state.history.splice(index, 1);
            const sessionId = state.activeSession?.id || "default";
            saveHistoryFor(sessionId);
            renderHistory();
          }
        }
        return;
      }
      if (payload?.type !== "message" || !payload.ciphertext) return;
      try {
        const plaintext = await decryptPayload(payload.ciphertext);
        const isMyMessage = payload.authorId === state.user?.userId;
        const record = {
          direction: isMyMessage ? "out" : "in",
          messageId: payload.messageId,
          authorId: payload.authorId || payload.authorName,
          authorName: payload.authorName,
          plaintext,
          ciphertext: payload.ciphertext,
          timestamp: payload.timestamp || Date.now(),
        };
        appendRecord(record);
        const currentSessionId = state.activeSession?.id;
        const messageSessionId = state.connection.room;
        if (messageSessionId) {
          const session = state.sessionMap.get(messageSessionId);
          if (session && session.isMember) {
            if (messageSessionId !== currentSessionId) {
              const unreadCount = state.unreadMessages.get(messageSessionId) || 0;
              state.unreadMessages.set(messageSessionId, unreadCount + 1);
              flashSessionCard(messageSessionId);
              updateNotificationDots();
              renderSessions();
            } else {
              const sessionsPanel = document.getElementById("sessionsPanel");
              const isPanelCollapsed = sessionsPanel?.classList.contains("collapsed");
              if (isPanelCollapsed) {
                const unreadCount = state.unreadMessages.get(messageSessionId) || 0;
                state.unreadMessages.set(messageSessionId, unreadCount + 1);
                flashSessionCard(messageSessionId);
                updateNotificationDots();
                renderSessions();
              }
            }
          }
        }
      } catch (error) {
        logEvent(`解密失败：${error.message}`, "error");
      }
    };
    const handleClose = () => {
      if (state.connection.socket === socket) {
        updateConnectionIndicator("offline", "连接已断开");
      }
    };
    const handleError = () => {
      showToast("实时连接异常");
      updateConnectionIndicator("offline", "连接失败");
    };
    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);
    state.connection.cleanup = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
    };
    state.connection.socket = socket;
  } catch (error) {
    updateConnectionIndicator("offline", "连接失败");
    logEvent(error.message, "error");
  }
}

function sendCiphertextToRoom(record, ciphertext) {
  if (!state.connection.socket || state.connection.socket.readyState !== WebSocket.OPEN) {
    logEvent("未连接实时会话，消息仅保存本地", "error");
    return;
  }
  try {
    state.connection.socket.send(
      JSON.stringify({
        ciphertext,
        timestamp: record.timestamp,
        messageId: record.messageId,
      })
    );
  } catch (error) {
    logEvent("发送失败：" + error.message, "error");
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const plaintext = dom.chatInput.value.trim();
  if (!plaintext) return;
  if (!state.activeSession) {
    showToast("请先选择会话");
    return;
  }
  try {
    const ciphertext = await encryptMessage(plaintext);
    const messageId = crypto.randomUUID();
    const record = {
      direction: "out",
      messageId,
      authorId: state.user?.userId || "未知",
      authorName: state.user?.username || state.user?.userId || "未知",
      plaintext,
      ciphertext,
      timestamp: Date.now(),
    };
    appendRecord(record);
    sendCiphertextToRoom(record, ciphertext);
    dom.chatInput.value = "";
    dom.chatInput.focus();
  } catch (error) {
    showToast(error.message || "发送失败");
  }
}

async function handleKeySetup(event) {
  event.preventDefault();
  const passphrase = dom.passphrase.value;
  if (!passphrase || passphrase.length < 8) {
    showToast("共享口令至少 8 个字符");
    return;
  }
  dom.setupForm.querySelector("button").disabled = true;
  try {
    if (state.salt) {
      await rehydrateKey(passphrase);
    } else {
      await generateKey(passphrase);
    }
    updateKeyStatus(true);
    showToast("密钥已就绪");
    logEvent("密钥已准备");
  } catch (error) {
    showToast(error.message || "生成密钥失败");
    logEvent(error.message || "生成密钥失败", "error");
  } finally {
    dom.setupForm.querySelector("button").disabled = false;
  }
}

function updateKeyStatus(ready) {
  if (!dom.keyStatus) return;
  if (ready) {
    const userLabel = state.user?.userId || state.user?.username || "已就绪";
    dom.keyStatus.textContent = `密钥已就绪 · ${userLabel}`;
    dom.keyStatus.classList.add("ready");
  } else {
    dom.keyStatus.textContent = "密钥未准备";
    dom.keyStatus.classList.remove("ready");
  }
}

async function handleFriendRequest(event) {
  event.preventDefault();
  const friendId = dom.friendIdInput.value.trim();
  if (!friendId) return;
  try {
    const data = await api("/api/friends/request", {
      method: "POST",
      body: { targetId: friendId },
    });
    state.user = data.user;
    dom.friendRequestForm.reset();
    renderFriends();
    renderRequests();
    showToast("已发送好友请求");
    refreshProfile();
  } catch (error) {
    showToast(error.message);
  }
}

async function acceptFriend(userId) {
  try {
    const data = await api("/api/friends/accept", {
      method: "POST",
      body: { requesterId: userId },
    });
    state.user = data.user;
    renderFriends();
    renderRequests();
    showToast("已接受好友请求");
    refreshProfile();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteFriend(friendId) {
  if (!confirm(`确定要删除好友 ${friendId} 吗？`)) return;
  try {
    const data = await api(`/api/friends/${friendId}`, {
      method: "DELETE",
    });
    state.user = data.user;
    renderFriends();
    showToast("已删除好友");
    refreshProfile();
  } catch (error) {
    showToast(error.message);
  }
}

async function createSession(event) {
  event.preventDefault();
  const name = dom.sessionName.value.trim();
  const capacity = Number(dom.sessionCapacity.value) || 2;
  if (!name) return;
  if (!state.keyFingerprint) {
    showToast("请先生成共享密钥");
    return;
  }
  try {
    const { session } = await api("/api/sessions", {
      method: "POST",
      body: { name, capacity, keyFingerprint: state.keyFingerprint },
    });
    const enriched = enrichSession(session);
    state.sessionMap.set(enriched.id, enriched);
    state.sessions = Array.from(state.sessionMap.values());
    dom.sessionCreateForm.reset();
    renderSessions();
    setActiveSession(enriched.id);
    showToast("会话创建成功");
  } catch (error) {
    showToast(error.message);
  }
}

async function joinSession(sessionId) {
  if (!state.keyFingerprint) {
    showToast("请先生成共享密钥");
    return;
  }
  try {
    const { session } = await api(`/api/sessions/${sessionId}/join`, {
      method: "POST",
      body: { keyFingerprint: state.keyFingerprint },
    });
    const enriched = enrichSession(session);
    state.sessionMap.set(enriched.id, enriched);
    state.sessions = Array.from(state.sessionMap.values());
    renderSessions();
    setActiveSession(enriched.id);
    showToast("加入成功");
  } catch (error) {
    showToast(error.message);
  }
}

async function leaveSessionById(sessionId) {
  try {
    const { session } = await api(`/api/sessions/${sessionId}/leave`, {
      method: "POST",
    });
    const enriched = enrichSession(session);
    state.sessionMap.set(enriched.id, enriched);
    state.sessions = Array.from(state.sessionMap.values());
    if (state.activeSession?.id === sessionId) {
      setActiveSession(null);
    }
    renderSessions();
    showToast("已离开会话");
  } catch (error) {
    showToast(error.message);
  }
}

async function adjustCapacity(sessionId) {
  const current = state.sessionMap.get(sessionId);
  if (!current) return;
  const next = Number(
    prompt("请输入新的容量（包含房主）", String(current.capacity))
  );
  if (!next || Number.isNaN(next)) return;
  try {
    const { session } = await api(`/api/sessions/${sessionId}/capacity`, {
      method: "POST",
      body: { capacity: next },
    });
    const enriched = enrichSession(session);
    state.sessionMap.set(enriched.id, enriched);
    state.sessions = Array.from(state.sessionMap.values());
    if (state.activeSession?.id === sessionId) {
      state.activeSession = enriched;
      updateParticipantLabel();
    }
    renderSessions();
    showToast("容量已更新");
  } catch (error) {
    showToast(error.message);
  }
}

async function kickMember(sessionId, userId) {
  if (!confirm(`确定要踢出成员 ${userId} 吗？`)) return;
  try {
    const { session } = await api(`/api/sessions/${sessionId}/kick/${userId}`, {
      method: "POST",
    });
    const enriched = enrichSession(session);
    state.sessionMap.set(enriched.id, enriched);
    state.sessions = Array.from(state.sessionMap.values());
    if (state.activeSession?.id === sessionId) {
      state.activeSession = enriched;
      updateParticipantLabel();
    }
    renderSessions();
    showToast("已踢出成员");
    refreshSessions();
  } catch (error) {
    showToast(error.message);
  }
}

async function inviteFriend(sessionId) {
  const friends = state.user?.friends || [];
  if (!friends.length) {
    showToast("没有好友可以邀请");
    return;
  }
  const friendId = prompt(`请输入要邀请的好友ID：\n可用好友：${friends.join(", ")}`);
  if (!friendId) return;
  try {
    const { session, message } = await api(`/api/sessions/${sessionId}/invite`, {
      method: "POST",
      body: { friendId: friendId.trim() },
    });
    const enriched = enrichSession(session);
    state.sessionMap.set(enriched.id, enriched);
    state.sessions = Array.from(state.sessionMap.values());
    if (state.activeSession?.id === sessionId) {
      state.activeSession = enriched;
      updateParticipantLabel();
    }
    renderSessions();
    showToast(message || "邀请成功");
    refreshSessions();
  } catch (error) {
    showToast(error.message);
  }
}

function handleSessionListClick(event) {
  const action = event.target.dataset.action;
  if (!action) return;
  const card = event.target.closest(".session-card");
  if (!card) return;
  const sessionId = card.dataset.sessionId;
  if (!sessionId) return;
  switch (action) {
    case "join-session":
      joinSession(sessionId);
      break;
    case "enter-session":
      setActiveSession(sessionId);
      break;
    case "leave-session":
      leaveSessionById(sessionId);
      break;
    case "adjust-capacity":
      adjustCapacity(sessionId);
      break;
    case "delete-session":
      deleteSession(sessionId);
      break;
    case "invite-friend":
      inviteFriend(sessionId);
      break;
    case "kick-member":
      const userId = event.target.dataset.userId;
      if (userId) kickMember(sessionId, userId);
      break;
    default:
      break;
  }
}

async function deleteSession(sessionId) {
  if (!confirm("确认解散该会话？所有成员将被断开")) return;
  try {
    await api(`/api/sessions/${sessionId}`, { method: "DELETE" });
    state.sessionMap.delete(sessionId);
    state.sessions = Array.from(state.sessionMap.values());
    if (state.activeSession?.id === sessionId) {
      setActiveSession(null);
      showToast("会话已解散");
    }
    renderSessions();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLeaveActiveSession() {
  if (!state.activeSession) return;
  if (state.activeSession.isOwner) {
    showToast("房主暂不支持离开，请调整容量或创建新会话");
    return;
  }
  await leaveSessionById(state.activeSession.id);
}

async function logout() {
  if (state.token) {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
  }
  localStorage.removeItem(storageKeys.token);
  state.token = null;
  state.user = null;
  stopPolling();
  state.sessions = [];
  state.sessionMap.clear();
  setActiveSession(null);
  renderSessions();
  renderFriends();
  renderRequests();
  showAuthLayer(true);
  logEvent("已退出登录");
}

function copyUserId() {
  if (!state.user?.userId) return;
  navigator.clipboard.writeText(state.user.userId);
  showToast("ID 已复制");
}

function handleServerUrlChange() {
  const value = normalizeServerUrl(dom.serverUrl.value);
  state.connection.server = value;
  dom.serverUrl.value = value;
  saveConnectionPrefs();
  logEvent(`服务器已切换：${value}`);
}

function clearChatHistory() {
  if (!state.activeSession) {
    showToast("尚未选择会话");
    return;
  }
  if (confirm("确定要清空当前会话的本地聊天记录吗？")) {
    state.history = [];
    saveHistoryFor(state.activeSession.id);
    renderHistory();
  }
}

async function deleteMessage(messageId) {
  if (!state.activeSession || !messageId) return;
  if (!confirm("确定要撤回这条消息吗？所有成员都会看到消息被删除。")) return;
  try {
    await api(`/api/sessions/${state.activeSession.id}/messages/${messageId}`, {
      method: "DELETE",
    });
    const index = state.history.findIndex((r) => r.messageId === messageId);
    if (index >= 0) {
      state.history.splice(index, 1);
      saveHistoryFor(state.activeSession.id);
      renderHistory();
    }
    showToast("消息已撤回");
  } catch (error) {
    showToast(error.message || "撤回失败");
  }
}

function clearLog() {
  dom.logPanel.innerHTML = "";
  logEvent("日志已清空");
}

function initAuth() {
  dom.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = dom.authUsername.value.trim();
    const password = dom.authPassword.value;
    if (!username || !password) {
      dom.authError.textContent = "请输入账号和密码";
      return;
    }
    try {
      const endpoint = state.authMode === "login" ? "/api/login" : "/api/register";
      const data = await api(endpoint, {
        method: "POST",
        body: { username, password },
      });
      onAuthenticated(data.token, data.user);
      refreshProfile();
    } catch (error) {
      dom.authError.textContent = error.message;
    }
  });

  dom.toggleAuthMode.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "register" : "login");
  });
}

function initEvents() {
  dom.setupForm.addEventListener("submit", handleKeySetup);
  dom.chatForm.addEventListener("submit", handleChatSubmit);
  dom.friendRequestForm.addEventListener("submit", handleFriendRequest);
  dom.requestsList.addEventListener("click", (event) => {
    if (event.target.dataset.action === "accept-friend") {
      acceptFriend(event.target.dataset.userId);
    }
  });
  dom.friendsList.addEventListener("click", (event) => {
    if (event.target.dataset.action === "delete-friend") {
      deleteFriend(event.target.dataset.friendId);
    }
  });
  dom.sessionCreateForm.addEventListener("submit", createSession);
  dom.sessionList.addEventListener("click", handleSessionListClick);
  dom.sessionViewMode?.addEventListener("click", () => {
    state.sessionViewMode = state.sessionViewMode === "detailed" ? "compact" : "detailed";
    localStorage.setItem("sessionViewMode", state.sessionViewMode);
    state.sessionPage = 1;
    renderSessions();
  });
  dom.sessionPagePrev?.addEventListener("click", () => {
    if (state.sessionPage > 1) {
      state.sessionPage--;
      renderSessions();
    }
  });
  dom.sessionPageNext?.addEventListener("click", () => {
    const totalPages = Math.ceil(state.sessions.length / state.sessionPageSize);
    if (state.sessionPage < totalPages) {
      state.sessionPage++;
      renderSessions();
    }
  });
  dom.leaveSession.addEventListener("click", handleLeaveActiveSession);
  dom.clearHistory.addEventListener("click", clearChatHistory);
  dom.refreshSession?.addEventListener("click", () => {
    if (state.activeSession) {
      setActiveSession(state.activeSession.id, { autoConnect: true, forceReload: false });
      showToast("会话已刷新");
    } else {
      showToast("请先选择会话");
    }
  });
  dom.togglePassword?.addEventListener("click", () => {
    const input = dom.passphrase;
    if (input.type === "password") {
      input.type = "text";
      dom.togglePassword.classList.add("active");
    } else {
      input.type = "password";
      dom.togglePassword.classList.remove("active");
    }
  });
  dom.copyIdBtn.addEventListener("click", copyUserId);
  dom.logoutBtn.addEventListener("click", logout);
  dom.clearLog.addEventListener("click", clearLog);
  dom.serverUrl.addEventListener("change", handleServerUrlChange);
  dom.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      dom.chatForm.requestSubmit();
    }
  });
  dom.chatHistory.addEventListener("click", (event) => {
    if (event.target.dataset.action === "delete-message") {
      const messageId = event.target.dataset.messageId;
      if (messageId) {
        deleteMessage(messageId);
      }
    }
  });
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-action='toggle-panel']");
    if (toggle) {
      event.preventDefault();
      togglePanel(toggle);
    }
  });
  window.addEventListener("beforeunload", () => {
    disconnectFromRoom();
  });
}

function bootstrap() {
  loadProfilePreferences();
  loadConnectionPrefs();
  if (dom.serverUrl) dom.serverUrl.value = state.connection.server;
  if (dom.displayName) dom.displayName.value = state.name;
  updateKeyStatus(Boolean(state.key));
  setAuthMode("login");
  initAuth();
  initEvents();
  showAuthLayer(!state.token);
  restorePanelStates();
  if (state.token) {
    refreshProfile();
    refreshSessions();
    startPolling();
  }
  renderHistory();
}

bootstrap();

