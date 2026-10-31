const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "protocol-city-dev-secret";

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

router.post("/register", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({
      error: "username должен быть минимум 3 символа, пароль минимум 6",
    });
  }

  const exists = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (exists) {
    return res.status(409).json({ error: "пользователь уже существует" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, passwordHash);

  const userId = Number(info.lastInsertRowid);

  db.prepare(
    `
    INSERT OR IGNORE INTO player_states (user_id, x, y, z, rot_y, zone, flags)
    VALUES (?, 0, 0, 12, 0, 'spawn', '{}')
  `
  ).run(userId);

  const token = signToken({ id: userId, username });

  res.json({
    token,
    user: {
      id: userId,
      username,
    },
  });
});

router.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.status(401).json({ error: "неверный логин или пароль" });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);

  if (!ok) {
    return res.status(401).json({ error: "неверный логин или пароль" });
  }

  const token = signToken({ id: user.id, username: user.username });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = {
  router,
  verifyToken,
  authMiddleware,
};