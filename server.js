require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const http = require("http");
const { OpenAI } = require("openai");
const db = require("./database");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const openai = new OpenAI({
  apiKey:process.env.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,
  baseURL:process.env.https://integrate.api.nvidia.com/v1,
});

app.use(express.json());
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

const isAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  res.status(401).json({ error: "Unauthorized" });
};

app.post("/api/auth/signup", (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)").run(username, email, hash);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Username or email already exists" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  res.json({ userId: req.session.userId, username: req.session.username });
});

app.post("/api/mood", isAuthenticated, (req, res) => {
  const { emoji_score, note } = req.body;
  db.prepare("INSERT INTO mood_entries (user_id, emoji_score, note) VALUES (?, ?, ?)").run(req.session.userId, emoji_score, note);
  res.json({ success: true });
});

app.get("/api/mood", isAuthenticated, (req, res) => {
  const entries = db.prepare("SELECT * FROM mood_entries WHERE user_id = ? ORDER BY created_at DESC").all(req.session.userId);
  res.json(entries);
});

app.get("/api/ai/history", isAuthenticated, (req, res) => {
  const messages = db.prepare("SELECT role, message FROM conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT 10").all(req.session.userId);
  res.json(messages);
});

app.post("/api/ai/chat", isAuthenticated, async (req, res) => {
  const { message } = req.body;
  const userId = req.session.userId;
  db.prepare("INSERT INTO conversations (user_id, role, message) VALUES (?, ?, ?)").run(userId, "user", message);
  try {
    const response = await openai.chat.completions.create({
      model: "google/gemma-3-27b-it",
      messages: [
        { role: "system", content: "You are Echo, a warm empathetic AI companion in the InnerEcho app. Listen without judgment. Make the user feel heard. Do NOT diagnose or give medical advice. Ask open-ended questions. Reflect feelings back gently. If user mentions self-harm or suicide, respond with warmth and share: iCall helpline 9152987821. Keep replies to 2-4 sentences unless user is in distress. Never say I understand as a standalone sentence." },
        { role: "user", content: message }
      ],
    });
    const aiReply = response.choices[0].message.content;
    db.prepare("INSERT INTO conversations (user_id, role, message) VALUES (?, ?, ?)").run(userId, "assistant", aiReply);
    res.json({ reply: aiReply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI service unavailable" });
  }
});

app.post("/api/circles", isAuthenticated, (req, res) => {
  const { name } = req.body;
  const info = db.prepare("INSERT INTO circles (name, created_by) VALUES (?, ?)").run(name, req.session.userId);
  db.prepare("INSERT INTO circle_members (circle_id, user_id) VALUES (?, ?)").run(info.lastInsertRowid, req.session.userId);
  res.json({ success: true, id: info.lastInsertRowid });
});

app.get("/api/circles", isAuthenticated, (req, res) => {
  const circles = db.prepare("SELECT c.* FROM circles c JOIN circle_members cm ON c.id = cm.circle_id WHERE cm.user_id = ?").all(req.session.userId);
  res.json(circles);
});

app.post("/api/circles/:id/invite", isAuthenticated, (req, res) => {
  const { username } = req.body;
  const circleId = req.params.id;
  const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  const count = db.prepare("SELECT count(*) as total FROM circle_members WHERE circle_id = ?").get(circleId);
  if (count.total >= 5) return res.status(400).json({ error: "Circle full (max 5)" });
  try {
    db.prepare("INSERT INTO circle_members (circle_id, user_id) VALUES (?, ?)").run(circleId, user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "User already in circle" });
  }
});

app.get("/api/circles/:id/messages", isAuthenticated, (req, res) => {
  const messages = db.prepare("SELECT cm.message, u.username, cm.created_at FROM circle_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.circle_id = ? ORDER BY cm.created_at ASC").all(req.params.id);
  res.json(messages);
});

io.on("connection", (socket) => {
  socket.on("join-circle", (circleId) => socket.join(`circle_${circleId}`));
  socket.on("send-circle-msg", ({ circleId, userId, username, message }) => {
    db.prepare("INSERT INTO circle_messages (circle_id, user_id, message) VALUES (?, ?, ?)").run(circleId, userId, message);
    io.to(`circle_${circleId}`).emit("new-circle-msg", { username, message, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`InnerEcho running on http://localhost:${PORT}`));
