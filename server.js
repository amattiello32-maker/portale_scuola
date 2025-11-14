

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname))); // Serve index.html

// --- DATABASE ---
const db = new sqlite3.Database("school.db", (err) => {
  if (err) console.error("Errore DB:", err);
  else console.log("Database SQLite caricato.");
});

// Tabelle
const initSQL = `
CREATE TABLE IF NOT EXISTS users(
  email TEXT PRIMARY KEY,
  username TEXT,
  classe TEXT,
  sezione TEXT,
  indirizzo TEXT,
  foto TEXT
);

CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  authorEmail TEXT,
  body TEXT,
  anonymous INTEGER,
  timestamp INTEGER
);
`;

db.exec(initSQL, (err) => {
  if (err) console.log("Errore creazione tabelle:", err);
  else console.log("Tabelle inizializzate.");
});

// --- API ---

// Login (solo controllo formato, password uguale per tutti)
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email.endsWith("@isisleonardodavincipoggiomarino.it")) {
    return res.json({ ok: false, msg: "Email non valida" });
  }
  if (password !== "SG20513") {
    return res.json({ ok: false, msg: "Password errata" });
  }
  return res.json({ ok: true });
});

// Salvataggio profilo
app.post("/api/profile", (req, res) => {
  const { email, username, classe, sezione, indirizzo, foto } = req.body;

  const sql = `INSERT INTO users (email, username, classe, sezione, indirizzo, foto)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(email) DO UPDATE SET
                 username=excluded.username,
                 classe=excluded.classe,
                 sezione=excluded.sezione,
                 indirizzo=excluded.indirizzo,
                 foto=excluded.foto;
              `;

  db.run(sql, [email, username, classe, sezione, indirizzo, foto], (err) => {
    if (err) return res.json({ ok: false, msg: "Errore DB" });
    res.json({ ok: true });
  });
});

// Recupera profilo
app.get("/api/profile/:email", (req, res) => {
  db.get("SELECT * FROM users WHERE email=?", [req.params.email], (err, row) => {
    if (err) return res.json({ ok: false });
    res.json({ ok: true, profile: row });
  });
});

// Pubblicare un post
app.post("/api/post", (req, res) => {
  const { email, body, anonymous } = req.body;
  const sql = `INSERT INTO posts (authorEmail, body, anonymous, timestamp)
               VALUES (?,?,?,?)`;
  db.run(sql, [email, body, anonymous ? 1 : 0, Date.now()], (err) => {
    if (err) return res.json({ ok: false });
    res.json({ ok: true });
  });
});

// Lista post
app.get("/api/posts", (req, res) => {
  const sql = `SELECT posts.*, users.username, users.foto
               FROM posts LEFT JOIN users ON posts.authorEmail = users.email
               ORDER BY timestamp DESC`;

  db.all(sql, [], (err, rows) => {
    if (err) return res.json({ ok: false });
    res.json({ ok: true, posts: rows });
  });
});

// Ricerca profili
app.get("/api/search", (req, res) => {
  const q = `%${req.query.q || ""}%`;
  const sql = `SELECT * FROM users WHERE email LIKE ? OR username LIKE ?`;

  db.all(sql, [q, q], (err, rows) => {
    if (err) return res.json({ ok: false });
    res.json({ ok: true, results: rows });
  });
});

// Recupera tutti i post di un utente
app.get("/api/user-posts/:email", (req, res) => {
  const sql = `SELECT * FROM posts WHERE authorEmail=? ORDER BY timestamp DESC`;
  db.all(sql, [req.params.email], (err, rows) => {
    if (err) return res.json({ ok: false });
    res.json({ ok: true, posts: rows });
  });
});

// Avvio server
app.listen(PORT, () => {
  console.log(`Server avviato su porta ${PORT}`);
});

