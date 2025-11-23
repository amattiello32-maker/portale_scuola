// ==========================
//  SERVER.JS PER RENDER
// ==========================

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// =====================================
//  DATABASE CONNECTION (Render Ready)
// =====================================
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://school_db_y3kf_user:KwEOWhQFi4ZCWhqhT53au2odViQ4L8K7@dpg-d4dkkugdl3ps73d3g1n0-a/school_db_y3kf";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// =====================================
//  CREAZIONE TABELLE SE NON ESISTONO
// =====================================
async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        classe TEXT,
        sezione TEXT,
        indirizzo TEXT,
        profile_pic TEXT,
        first_login BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username TEXT,
        profile_pic TEXT,
        body TEXT,
        anonymous BOOLEAN DEFAULT false,
        timestamp TIMESTAMP DEFAULT now()
      );
    `);

    console.log("✔️ Tabelle pronte");
  } catch (err) {
    console.error("Errore nella creazione tabelle:", err);
  }
}
init();

// =====================================
//  API: REGISTRAZIONE
// =====================================
app.post("/api/signup", async (req, res) => {
  const { username, email, password } = req.body;

  if (!email || !password)
    return res.json({ success: false, message: "Email e password richieste" });

  try {
    // controlla se email esiste
    const exists = await pool.query("SELECT id FROM users WHERE email=$1", [
      email,
    ]);
    if (exists.rows.length)
      return res.json({
        success: false,
        message: "Questa email è già registrata",
      });

    const hash = await bcrypt.hash(password, 10);

    const q = await pool.query(
      `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1,$2,$3)
      RETURNING id, username, email, classe, sezione, indirizzo, profile_pic, first_login
    `,
      [username || null, email, hash]
    );

    res.json({ success: true, user: q.rows[0] });
  } catch (error) {
    console.error("Errore signup:", error);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  API: LOGIN
// =====================================
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const q = await pool.query(
      "SELECT * FROM users WHERE email=$1 LIMIT 1",
      [email]
    );

    if (!q.rows.length)
      return res.json({ success: false, message: "Utente non trovato" });

    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.json({ success: false, message: "Password errata" });

    delete user.password_hash;

    res.json({ success: true, user });
  } catch (error) {
    console.error("Errore login:", error);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  API: AGGIORNA PROFILO
// =====================================
app.post("/api/updateProfile", async (req, res) => {
  const { id, username, classe, sezione, indirizzo, profile_pic } = req.body;

  if (!id) return res.json({ success: false, message: "ID mancante" });

  try {
    const q = await pool.query(
      `
      UPDATE users SET
        username = $1,
        classe = $2,
        sezione = $3,
        indirizzo = $4,
        profile_pic = COALESCE($5, profile_pic)
      WHERE id=$6
      RETURNING id, username, email, classe, sezione, indirizzo, profile_pic, first_login
    `,
      [
        username || null,
        classe || null,
        sezione || null,
        indirizzo || null,
        profile_pic || null,
        id,
      ]
    );

    res.json({ success: true, user: q.rows[0] });
  } catch (error) {
    console.error("Errore updateProfile:", error);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  API: CAMBIO PASSWORD
// =====================================
app.post("/api/changePassword", async (req, res) => {
  const { id, oldPassword, newPassword } = req.body;
  if (!id || !oldPassword || !newPassword)
    return res.json({ success: false, message: "Dati mancanti" });

  try {
    const q = await pool.query(
      "SELECT password_hash FROM users WHERE id=$1",
      [id]
    );

    if (!q.rows.length)
      return res.json({ success: false, message: "Utente non trovato" });

    const ok = await bcrypt.compare(oldPassword, q.rows[0].password_hash);
    if (!ok)
      return res.json({ success: false, message: "Password attuale errata" });

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash=$1 WHERE id=$2",
      [newHash, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Errore changePassword:", err);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  API: OTTIENI TUTTI GLI UTENTI
// =====================================
app.get("/api/users", async (req, res) => {
  try {
    const q = await pool.query(
      "SELECT id, username, email, classe, sezione, indirizzo, profile_pic FROM users ORDER BY username NULLS LAST"
    );
    res.json(q.rows);
  } catch (error) {
    console.error("Errore users:", error);
    res.json([]);
  }
});

// =====================================
//  API: CREA POST
// =====================================
app.post("/api/posts", async (req, res) => {
  const { user_id, body, anonymous } = req.body;

  if (!body)
    return res.json({ success: false, message: "Messaggio vuoto" });

  try {
    let username = null;
    let profile_pic = null;

    if (user_id) {
      const u = await pool.query(
        "SELECT username, profile_pic FROM users WHERE id=$1",
        [user_id]
      );
      if (u.rows.length) {
        username = u.rows[0].username;
        profile_pic = u.rows[0].profile_pic;
      }
    }

    await pool.query(
      `
      INSERT INTO posts (user_id, username, profile_pic, body, anonymous)
      VALUES ($1,$2,$3,$4,$5)
    `,
      [user_id || null, username, profile_pic, body, anonymous || false]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Errore create post:", error);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  API: OTTIENI POSTS
// =====================================
app.get("/api/posts", async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT p.*, u.username, u.profile_pic
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.timestamp DESC
    `);

    res.json(q.rows);
  } catch (error) {
    console.error("Errore get posts:", error);
    res.json([]);
  }
});

// =====================================
//  API: ELIMINA POST
// =====================================
app.post("/api/deletePost", async (req, res) => {
  const { id } = req.body;

  if (!id)
    return res.json({ success: false, message: "ID mancante" });

  try {
    await pool.query("DELETE FROM posts WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Errore deletePost:", error);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  API: ELIMINA PROFILO
// =====================================
app.post("/api/deleteProfile", async (req, res) => {
  const { id } = req.body;

  if (!id)
    return res.json({ success: false, message: "ID mancante" });

  try {
    await pool.query("DELETE FROM users WHERE id=$1", [id]);

    res.json({ success: true });
  } catch (error) {
    console.error("Errore deleteProfile:", error);
    res.json({ success: false, message: "Errore server" });
  }
});

// =====================================
//  START SERVER
// =====================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server pronto sulla porta " + PORT));



