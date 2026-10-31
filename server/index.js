const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const db = require("./db");
const { router: authRouter, verifyToken } = require("./auth");
const { setupGame } = require("./game");

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "protocol-city" });
});

app.get("/api/zones", (req, res) => {
  res.json(db.prepare("SELECT * FROM zones").all());
});

app.use("/api", authRouter);

let server;

try {
  const keyPath = path.join(__dirname, "..", "certs", "key.pem");
  const certPath = path.join(__dirname, "..", "certs", "cert.pem");

  server = https.createServer(
    {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
    app
  );

  console.log("Используется HTTPS");
} catch {
  server = http.createServer(app);
  console.log("Сертификаты не найдены, используется HTTP. Для шифрования добавь сертификаты.");
}

setupGame(server, verifyToken, db);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Protocol City server: https://localhost:${PORT}`);
});