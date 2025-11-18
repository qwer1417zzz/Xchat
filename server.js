const express = require("express");
const { createServer } = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const DEFAULT_STORE = { users: [], sessions: [], tokens: [] };
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ID_REGEX = /^[A-Z0-9]{8}$/;

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STORE, null, 2));
      return DEFAULT_STORE;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("[store] Failed to load data file:", error);
    return DEFAULT_STORE;
  }
}

const store = loadStore();

function randomId() {
  return Array.from({ length: 8 })
    .map(() => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)])
    .join("");
}

function normalizeStoreIds(store) {
  const users = store.users || [];
  const idMap = new Map();
  const usedIds = new Set(users.map((u) => u.userId));
  users.forEach((user) => {
    if (!ID_REGEX.test(user.userId)) {
      let nextId = randomId();
      while (usedIds.has(nextId)) {
        nextId = randomId();
      }
      usedIds.add(nextId);
      idMap.set(user.userId, nextId);
      user.userId = nextId;
    }
  });
  if (!idMap.size) return false;
  users.forEach((user) => {
    user.friends = (user.friends || []).map((id) => idMap.get(id) || id);
    user.incoming = (user.incoming || user.incomingRequests || []).map(
      (id) => idMap.get(id) || id
    );
    user.outgoing = (user.outgoing || user.outgoingRequests || []).map(
      (id) => idMap.get(id) || id
    );
  });
  (store.sessions || []).forEach((session) => {
    session.ownerId = idMap.get(session.ownerId) || session.ownerId;
    session.members = (session.members || []).map((id) => idMap.get(id) || id);
  });
  (store.tokens || []).forEach((token) => {
    token.userId = idMap.get(token.userId) || token.userId;
  });
  return true;
}

const idsUpdated = normalizeStoreIds(store);

const usersById = new Map();
const usersByName = new Map();
(store.users || []).forEach((user) => {
  const record = {
    userId: user.userId,
    username: user.username,
    passwordHash: user.passwordHash,
    friends: new Set(user.friends || []),
    incoming: new Set(user.incoming || user.incomingRequests || []),
    outgoing: new Set(user.outgoing || user.outgoingRequests || []),
    createdAt: user.createdAt || Date.now(),
  };
  usersById.set(record.userId, record);
  usersByName.set(record.username.toLowerCase(), record.userId);
});

const sessions = new Map();
(store.sessions || []).forEach((session) => {
  sessions.set(session.id, {
    id: session.id,
    name: session.name,
    ownerId: session.ownerId,
    capacity: session.capacity,
    members: new Set(session.members || []),
    keyFingerprint: session.keyFingerprint || null,
    createdAt: session.createdAt || Date.now(),
  });
});

const userTokens = new Map();
const tokenSockets = new Map();

const tokens = new Map(
  (store.tokens || []).map((entry) => [
    entry.token,
    { userId: entry.userId, createdAt: entry.createdAt || Date.now() },
  ])
);

(store.tokens || []).forEach((entry) => {
  userTokens.set(entry.userId, entry.token);
});

if (idsUpdated) {
  saveStore();
}

async function saveStore() {
  const payload = {
    users: Array.from(usersById.values()).map((user) => ({
      userId: user.userId,
      username: user.username,
      passwordHash: user.passwordHash,
      friends: Array.from(user.friends),
      incoming: Array.from(user.incoming),
      outgoing: Array.from(user.outgoing),
      createdAt: user.createdAt,
    })),
    sessions: Array.from(sessions.values()).map((session) => ({
      id: session.id,
      name: session.name,
      ownerId: session.ownerId,
      capacity: session.capacity,
      members: Array.from(session.members),
      keyFingerprint: session.keyFingerprint || null,
      createdAt: session.createdAt,
    })),
    tokens: Array.from(tokens.entries()).map(([token, meta]) => ({
      token,
      userId: meta.userId,
      createdAt: meta.createdAt,
    })),
  };
  await fs.promises.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
}

const PORT = Number(process.env.PORT || 4000);
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const sessionSockets = new Map();
const sessionMessages = new Map();

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function ensureUsernameAvailable(username) {
  if (usersByName.has(username.toLowerCase())) {
    throw new Error("用户名已存在");
  }
}

function generateUserId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  do {
    id = Array.from({ length: 8 })
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join("");
  } while (usersById.has(id));
  return id;
}

function createUser(username, password) {
  ensureUsernameAvailable(username);
  const userId = generateUserId();
  const record = {
    userId,
    username,
    passwordHash: hashPassword(password),
    friends: new Set(),
    incoming: new Set(),
    outgoing: new Set(),
    createdAt: Date.now(),
  };
  usersById.set(userId, record);
  usersByName.set(username.toLowerCase(), userId);
  return record;
}

function issueSessionToken(userId) {
  const oldToken = userTokens.get(userId);
  if (oldToken) {
    tokens.delete(oldToken);
    const oldSockets = tokenSockets.get(oldToken);
    if (oldSockets) {
      for (const socket of oldSockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1008, "账号在其他地方登录");
        }
      }
      tokenSockets.delete(oldToken);
    }
  }
  const token = createToken();
  tokens.set(token, { userId, createdAt: Date.now() });
  userTokens.set(userId, token);
  return token;
}

function serializeUser(record) {
  return {
    userId: record.userId,
    username: record.username,
    friends: Array.from(record.friends),
    incomingRequests: Array.from(record.incoming),
    outgoingRequests: Array.from(record.outgoing),
  };
}

function createSession(ownerId, name, capacity, keyFingerprint) {
  const sessionId = crypto.randomUUID();
  const record = {
    id: sessionId,
    name: name || "未命名会话",
    ownerId,
    capacity,
    members: new Set([ownerId]),
    keyFingerprint: keyFingerprint || null,
    createdAt: Date.now(),
  };
  sessions.set(sessionId, record);
  return record;
}

function serializeSession(session) {
  return {
    id: session.id,
    name: session.name,
    ownerId: session.ownerId,
    capacity: session.capacity,
    members: Array.from(session.members),
    createdAt: session.createdAt,
  };
}

function getUserFromToken(header) {
  if (!header) return null;
  const token = header.replace(/Bearer/i, "").trim();
  const meta = tokens.get(token);
  if (!meta) return null;
  return { token, record: usersById.get(meta.userId) };
}

function authMiddleware(req, res, next) {
  const result = getUserFromToken(req.headers.authorization);
  if (!result) {
    return res.status(401).json({ error: "未授权" });
  }
  req.token = result.token;
  req.user = result.record;
  next();
}

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: "请输入有效的用户名和至少 6 位密码" });
  }
  try {
    const user = createUser(username, password);
    const token = issueSessionToken(user.userId);
    await saveStore();
    res.json({ token, user: serializeUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message || "注册失败" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "请输入用户名和密码" });
  }
  const userId = usersByName.get(username.toLowerCase());
  if (!userId) {
    return res.status(401).json({ error: "账号或密码错误" });
  }
  const record = usersById.get(userId);
  if (hashPassword(password) !== record.passwordHash) {
    return res.status(401).json({ error: "账号或密码错误" });
  }
  const token = issueSessionToken(record.userId);
  await saveStore();
  res.json({ token, user: serializeUser(record) });
});

app.post("/api/logout", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  tokens.delete(req.token);
  userTokens.delete(userId);
  const sockets = tokenSockets.get(req.token);
  if (sockets) {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "用户退出登录");
      }
    }
    tokenSockets.delete(req.token);
  }
  await saveStore();
  res.json({ ok: true });
});

app.get("/api/profile", authMiddleware, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

app.post("/api/friends/request", authMiddleware, async (req, res) => {
  const { targetId } = req.body || {};
  if (!targetId) return res.status(400).json({ error: "缺少目标 ID" });
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: "不能添加自己" });
  }
  const target = usersById.get(targetId);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (req.user.friends.has(targetId)) {
    return res.status(400).json({ error: "已经是好友" });
  }
  if (req.user.outgoing.has(targetId)) {
    return res.status(400).json({ error: "已发送请求" });
  }
  req.user.outgoing.add(targetId);
  target.incoming.add(req.user.userId);
  await saveStore();
  res.json({ user: serializeUser(req.user) });
});

app.post("/api/friends/accept", authMiddleware, async (req, res) => {
  const { requesterId } = req.body || {};
  if (!requesterId) return res.status(400).json({ error: "缺少请求者 ID" });
  if (!req.user.incoming.has(requesterId)) {
    return res.status(404).json({ error: "未找到好友请求" });
  }
  const requester = usersById.get(requesterId);
  if (!requester) return res.status(404).json({ error: "用户不存在" });
  req.user.incoming.delete(requesterId);
  requester.outgoing.delete(req.user.userId);
  req.user.friends.add(requesterId);
  requester.friends.add(req.user.userId);
  await saveStore();
  res.json({ user: serializeUser(req.user) });
});

app.get("/api/friends", authMiddleware, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

app.delete("/api/friends/:friendId", authMiddleware, async (req, res) => {
  const { friendId } = req.params;
  if (!friendId) return res.status(400).json({ error: "缺少好友 ID" });
  if (friendId === req.user.userId) {
    return res.status(400).json({ error: "不能删除自己" });
  }
  if (!req.user.friends.has(friendId)) {
    return res.status(404).json({ error: "不是好友关系" });
  }
  const friend = usersById.get(friendId);
  if (friend) {
    friend.friends.delete(req.user.userId);
  }
  req.user.friends.delete(friendId);
  await saveStore();
  res.json({ user: serializeUser(req.user) });
});

app.post("/api/sessions", authMiddleware, async (req, res) => {
  const { name, capacity, keyFingerprint } = req.body || {};
  const parsed = Number(capacity) || 2;
  if (parsed < 2 || parsed > 12) {
    return res.status(400).json({ error: "容量范围为 2-12" });
  }
  if (!keyFingerprint) {
    return res.status(400).json({ error: "请先生成共享密钥" });
  }
  const session = createSession(req.user.userId, name, parsed, keyFingerprint);
  await saveStore();
  res.json({ session: serializeSession(session) });
});

app.get("/api/sessions", authMiddleware, (req, res) => {
  const { keyFingerprint } = req.query || {};
  const all = Array.from(sessions.values());
  const filtered = all.filter((s) => {
    const isOwner = s.ownerId === req.user.userId;
    const isFriendOwner = req.user.friends.has(s.ownerId);
    if (isOwner || isFriendOwner) {
      return true;
    }
    if (keyFingerprint && s.keyFingerprint) {
      return s.keyFingerprint === keyFingerprint;
    }
    return false;
  });
  const payload = filtered.map((s) => ({
    ...serializeSession(s),
    isOwner: s.ownerId === req.user.userId,
    isMember: s.members.has(req.user.userId),
    keyMatch: !s.keyFingerprint || !keyFingerprint || s.keyFingerprint === keyFingerprint,
  }));
  res.json({ sessions: payload });
});

app.post("/api/sessions/:id/join", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  const { keyFingerprint } = req.body || {};
  if (!keyFingerprint) {
    return res.status(400).json({ error: "请先生成共享密钥" });
  }
  if (session.keyFingerprint && session.keyFingerprint !== keyFingerprint) {
    return res.status(403).json({ error: "密钥不一致，无法加入此会话" });
  }
  let changed = false;
  if (!session.members.has(req.user.userId)) {
    if (session.members.size >= session.capacity) {
      return res.status(403).json({ error: "会话已满员" });
    }
    session.members.add(req.user.userId);
    changed = true;
  }
  if (changed) {
    await saveStore();
    broadcastMembers(session.id);
  }
  res.json({ session: serializeSession(session) });
});

app.post("/api/sessions/:id/leave", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  if (session.ownerId === req.user.userId) {
    return res.status(400).json({ error: "房主不能离开，请解散会话" });
  }
  session.members.delete(req.user.userId);
  await saveStore();
  broadcastMembers(session.id);
  res.json({ session: serializeSession(session) });
});

app.post("/api/sessions/:id/kick/:userId", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  const { userId } = req.params;
  if (!session) return res.status(404).json({ error: "会话不存在" });
  if (session.ownerId !== req.user.userId) {
    return res.status(403).json({ error: "只有房主可以踢人" });
  }
  if (userId === session.ownerId) {
    return res.status(400).json({ error: "不能踢出房主" });
  }
  if (!session.members.has(userId)) {
    return res.status(404).json({ error: "该用户不在会话中" });
  }
  session.members.delete(userId);
  await saveStore();
  broadcastMembers(session.id);
  res.json({ session: serializeSession(session) });
});

app.post("/api/sessions/:id/invite", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  const { friendId } = req.body || {};
  if (!session) return res.status(404).json({ error: "会话不存在" });
  if (session.ownerId !== req.user.userId) {
    return res.status(403).json({ error: "只有房主可以邀请好友" });
  }
  if (!friendId) return res.status(400).json({ error: "缺少好友 ID" });
  if (!req.user.friends.has(friendId)) {
    return res.status(403).json({ error: "只能邀请好友" });
  }
  if (session.members.has(friendId)) {
    return res.status(400).json({ error: "该好友已在会话中" });
  }
  if (session.members.size >= session.capacity) {
    return res.status(403).json({ error: "会话已满员" });
  }
  session.members.add(friendId);
  await saveStore();
  broadcastMembers(session.id);
  res.json({ message: "邀请成功，好友已加入会话", session: serializeSession(session) });
});

app.post("/api/sessions/:id/capacity", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  const { capacity } = req.body || {};
  const parsed = Number(capacity);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  if (session.ownerId !== req.user.userId) {
    return res.status(403).json({ error: "只有房主可以调整容量" });
  }
  if (!parsed || parsed < session.members.size || parsed > 12) {
    return res.status(400).json({ error: "容量需要大于已有人数且不超过 12" });
  }
  session.capacity = parsed;
  await saveStore();
  broadcastMembers(session.id);
  res.json({ session: serializeSession(session) });
});

app.delete("/api/sessions/:id/messages/:messageId", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  if (session.ownerId !== req.user.userId) {
    return res.status(403).json({ error: "只有房主可以撤回消息" });
  }
  const { messageId } = req.params;
  const messages = sessionMessages.get(req.params.id) || [];
  const messageIndex = messages.findIndex((m) => m.messageId === messageId);
  if (messageIndex === -1) {
    return res.status(404).json({ error: "消息不存在" });
  }
  messages.splice(messageIndex, 1);
  sessionMessages.set(req.params.id, messages);
  
  const peers = getSessionSockets(req.params.id);
  const deletePayload = JSON.stringify({
    type: "message-deleted",
    messageId,
  });
  for (const peer of peers) {
    if (peer.readyState === WebSocket.OPEN) {
      peer.send(deletePayload);
    }
  }
  res.json({ ok: true });
});

app.delete("/api/sessions/:id", authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  if (session.ownerId !== req.user.userId) {
    return res.status(403).json({ error: "只有房主可解散会话" });
  }
  sessions.delete(req.params.id);
  sessionMessages.delete(req.params.id);
  await saveStore();
  const peers = sessionSockets.get(req.params.id);
  if (peers) {
    for (const socket of peers) {
      try {
        socket.send(JSON.stringify({ type: "session-deleted" }));
        socket.close(1000, "session deleted");
      } catch {
        /* ignore */
      }
    }
    sessionSockets.delete(req.params.id);
  }
  res.json({ ok: true });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

function getSessionSockets(sessionId) {
  if (!sessionSockets.has(sessionId)) {
    sessionSockets.set(sessionId, new Set());
  }
  return sessionSockets.get(sessionId);
}

function broadcastMembers(sessionId) {
  const session = sessions.get(sessionId);
  const peers = sessionSockets.get(sessionId);
  if (!session || !peers) return;
  const payload = JSON.stringify({
    type: "members",
    members: Array.from(session.members),
    capacity: session.capacity,
  });
  for (const peer of peers) {
    if (peer.readyState === WebSocket.OPEN) {
      peer.send(payload);
    }
  }
}

wss.on("connection", (socket, req) => {
  let authToken = "";
  let sessionId = "";
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    authToken = url.searchParams.get("token") || "";
    sessionId = url.searchParams.get("sessionId") || "";
  } catch {
    socket.close(1008, "invalid request");
    return;
  }

  const auth = getUserFromToken(`Bearer ${authToken}`);
  const session = sessions.get(sessionId);
  if (!auth || !session || !session.members.has(auth.record.userId)) {
    socket.close(1008, "unauthorized");
    return;
  }

  socket.meta = {
    userId: auth.record.userId,
    username: auth.record.username,
    sessionId,
    token: authToken,
  };

  if (!tokenSockets.has(authToken)) {
    tokenSockets.set(authToken, new Set());
  }
  tokenSockets.get(authToken).add(socket);

  const peers = getSessionSockets(sessionId);
  peers.add(socket);
  console.log(`[ws] ${auth.record.username} joined ${session.name} (${sessionId})`);
  broadcastMembers(sessionId);
  
  const history = sessionMessages.get(sessionId) || [];
  if (history.length > 0) {
    for (const msg of history) {
      const historyMsg = JSON.stringify({
        type: "message",
        messageId: msg.messageId,
        ciphertext: msg.ciphertext,
        timestamp: msg.timestamp,
        authorId: msg.authorId,
        authorName: msg.authorName,
      });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(historyMsg);
      }
    }
  }

  socket.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload?.type === "members-request") {
      broadcastMembers(sessionId);
      return;
    }
    if (!payload || typeof payload.ciphertext !== "string") return;
    const messageId = payload.messageId || crypto.randomUUID();
    const timestamp = payload.timestamp || Date.now();
    const messageData = {
      type: "message",
      messageId,
      ciphertext: payload.ciphertext,
      timestamp,
      authorId: socket.meta.userId,
      authorName: socket.meta.username,
    };
    const enriched = JSON.stringify(messageData);
    
    if (!sessionMessages.has(sessionId)) {
      sessionMessages.set(sessionId, []);
    }
    sessionMessages.get(sessionId).push({
      messageId,
      ciphertext: payload.ciphertext,
      timestamp,
      authorId: socket.meta.userId,
      authorName: socket.meta.username,
    });
    
    for (const peer of peers) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(enriched);
      }
    }
  });

  socket.on("close", () => {
    peers.delete(socket);
    if (socket.meta?.token) {
      const tokenSocketSet = tokenSockets.get(socket.meta.token);
      if (tokenSocketSet) {
        tokenSocketSet.delete(socket);
        if (tokenSocketSet.size === 0) {
          tokenSockets.delete(socket.meta.token);
        }
      }
    }
    console.log(`[ws] ${socket.meta.username} left ${session.name} (${sessionId})`);
    broadcastMembers(sessionId);
  });

  socket.on("error", (error) => {
    console.error("[ws] socket error:", error.message);
  });
});

const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
  console.log(`[api] WebSocket server: ws://${HOST}:${PORT}`);
});

