// =======================
//  SERVER DEL PORTALE SCUOLA
// =======================

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // serve index.html

// =======================
//  DATABASE SQLITE
// =======================
const db = new sqlite3.Database("./school.db", (err) => {
    if (err) console.error("Errore DB:", err);
    else console.log("Database SQLite pronto");
});

// Creazione tabelle
db.run(`CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    username TEXT,
    classe TEXT,
    sezione TEXT,
    indirizzo TEXT,
    fotoprofilo TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT,
    body TEXT,
    timestamp TEXT,
    anonymous INTEGER
)`);

// =======================
//  ROTTE API
// =======================

// ---- LOGIN ----
app.post("/login", (req, res) => {
    const { email } = req.body;

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (err, row) => {
            if (err) return res.json({ success: false });

            if (!row) {
                // crea utente nuovo se non esiste
                db.run(
                    `INSERT INTO users (email, username) VALUES (?, ?)`,
                    [email, email.split("@")[0]],
                    () => {}
                );
            }

            res.json({ success: true });
        }
    );
});

// ---- SALVA PROFILO ----
app.post("/saveProfile", (req, res) => {
    const { email, username, classe, sezione, indirizzo, fotoprofilo } = req.body;

    db.run(
        `UPDATE users SET username=?, classe=?, sezione=?, indirizzo=?, fotoprofilo=? WHERE email=?`,
        [username, classe, sezione, indirizzo, fotoprofilo, email],
        (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        }
    );
});

// ---- OTTIENI PROFILO ----
app.get("/profile/:email", (req, res) => {
    db.get(
        "SELECT * FROM users WHERE email = ?",
        [req.params.email],
        (err, row) => {
            if (err) return res.json({ success: false });
            res.json(row);
        }
    );
});

// ---- NUOVO POST ----
app.post("/newPost", (req, res) => {
    const { author, body, anonymous } = req.body;

    db.run(
        `INSERT INTO posts (author, body, timestamp, anonymous)
         VALUES (?, ?, datetime('now','localtime'), ?)`,
        [author, body, anonymous ? 1 : 0],
        (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        }
    );
});

// ---- OTTIENI TUTTI I POST ----
app.get("/posts", (req, res) => {
    db.all("SELECT * FROM posts ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.json([]);
        res.json(rows);
    });
});

// ---- CERCA PROFILO + POST ----
app.get("/search/:query", (req, res) => {
    const q = `%${req.params.query}%`;

    db.all(
        `SELECT * FROM users WHERE email LIKE ? OR username LIKE ?`,
        [q, q],
        (err, users) => {
            if (err) return res.json([]);

            // ottieni anche i messaggi di ogni user
            let results = [];

            let remaining = users.length;
            if (remaining === 0) return res.json([]);

            users.forEach((u) => {
                db.all(
                    "SELECT * FROM posts WHERE author=?",
                    [u.email],
                    (err2, posts) => {
                        results.push({ user: u, posts });

                        remaining--;
                        if (remaining === 0) res.json(results);
                    }
                );
            });
        }
    );
});

// =======================
//  SERVE index.html di default
// =======================
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// =======================
//  AVVIO SERVER
// =======================
app.listen(PORT, () => {
    console.log("Server avviato su http://localhost:" + PORT);
});
