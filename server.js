
// server.js — Node/Express + SQLite
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '20mb' })); // supporta base64 immagini
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const db = new sqlite3.Database('school.db');

// Creazione tabelle (se non esistono)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    username TEXT,
    classe TEXT,
    sezione TEXT,
    indirizzo TEXT,
    password TEXT,
    first_login INTEGER DEFAULT 1,
    profile_pic TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    body TEXT,
    anonymous INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// HOME: serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/*
  LOGIN
  - dominio obbligatorio: @isisleonardodavincipoggiomarino.it
  - se utente esiste:
      * se first_login == 1 e password == 'SG20513' => ritorna first_login true (forza cambio)
      * se first_login == 1 e password != 'SG20513' => errore (deve inserire SG20513)
      * se first_login == 0 => controlla password salvata
  - se utente NON esiste:
      * crea solo se password === 'SG20513' (primo accesso)
*/
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ success: false, message: 'Email e password richieste' });

  if (!email.toLowerCase().endsWith('@isisleonardodavincipoggiomarino.it')) {
    return res.json({ success: false, message: 'Deve essere un account @isisleonardodavincipoggiomarino.it' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (row) {
      if (row.first_login === 1) {
        if (password !== 'SG20513') return res.json({ success: false, message: 'Primo accesso: usa SG20513' });
        // corretto primo accesso: ritorna user e indica first_login per forzare cambio
        return res.json({ success: true, user: row, first_login: true });
      } else {
        if (password === row.password) {
          return res.json({ success: true, user: row });
        } else {
          return res.json({ success: false, message: 'Password errata' });
        }
      }
    } else {
      // crea nuovo utente SOLO se password è SG20513
      if (password !== 'SG20513') return res.json({ success: false, message: 'Utente non trovato. Al primo accesso inserire SG20513' });
      const usernameDefault = email.split('@')[0];
      db.run(`INSERT INTO users (email,password,username,first_login) VALUES (?,?,?,1)`,
        [email, 'SG20513', usernameDefault], function (errIns) {
          if (errIns) return res.status(500).json({ success: false, message: errIns.message });
          db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err2, newUser) => {
            if (err2) return res.status(500).json({ success: false, message: err2.message });
            return res.json({ success: true, user: newUser, first_login: true });
          });
        });
    }
  });
});

/*
  CHANGE PASSWORD (dopo primo login)
  richiede: { id, newPassword }
  imposta password e first_login=0
*/
app.post('/changePassword', (req, res) => {
  const { id, newPassword } = req.body;
  if (!id || !newPassword) return res.json({ success: false, message: 'id e newPassword richiesti' });
  db.run(`UPDATE users SET password = ?, first_login = 0 WHERE id = ?`, [newPassword, id], function (err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    db.get(`SELECT * FROM users WHERE id = ?`, [id], (err2, row) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, user: row });
    });
  });
});

/*
  RESET PASSWORD (dopo 3 tentativi)
  body: { email, password }  (password dovrebbe essere 'SG20513')
  imposta password al valore fornito e first_login = 1 (forza nuovo cambio al prossimo login)
*/
app.post('/resetPassword', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ success: false, message: 'email e password richieste' });
  db.run(`UPDATE users SET password = ?, first_login = 1 WHERE email = ?`, [password, email], function (err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, message: 'Password resettata' });
  });
});

/*
  UPDATE PROFILE
  - accetta JSON con username, classe, sezione, indirizzo, profile_pic (base64 string)
  - query param: ?id=USER_ID
*/
app.post('/updateProfile', (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ success: false, message: 'id mancante' });

  const { username, classe, sezione, indirizzo, profile_pic, password } = req.body;
  const updates = [];
  const params = [];

  if (username !== undefined) { updates.push('username=?'); params.push(username); }
  if (classe !== undefined) { updates.push('classe=?'); params.push(classe); }
  if (sezione !== undefined) { updates.push('sezione=?'); params.push(sezione); }
  if (indirizzo !== undefined) { updates.push('indirizzo=?'); params.push(indirizzo); }
  if (profile_pic !== undefined) { updates.push('profile_pic=?'); params.push(profile_pic); }
  if (password !== undefined) { updates.push('password=?'); params.push(password); updates.push('first_login=0'); }

  if (updates.length === 0) return res.json({ success: false, message: 'Nessun campo da aggiornare' });
  params.push(id);

  db.run(`UPDATE users SET ${updates.join(',')} WHERE id = ?`, params, function (err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    db.get(`SELECT * FROM users WHERE id = ?`, [id], (err2, row) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      return res.json({ success: true, user: row });
    });
  });
});

/*
  CREATE POST
  body: { user_id, body, anonymous }
*/
app.post('/post', (req, res) => {
  const { user_id, body, anonymous } = req.body;
  if (!user_id || body === undefined) return res.json({ success: false, message: 'user_id e body richiesti' });
  db.run(`INSERT INTO posts (user_id, body, anonymous) VALUES (?,?,?)`, [user_id, body, anonymous ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, post_id: this.lastID });
  });
});

/*
  GET POSTS
  restituisce posts con username e profile_pic dell'autore
*/
app.get('/posts', (req, res) => {
  db.all(`SELECT posts.*, users.username, users.profile_pic FROM posts LEFT JOIN users ON posts.user_id = users.id ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json(rows);
  });
});

/*
  GET USERS (lista profili senza email)
  restituisce id, username, classe, sezione, indirizzo, profile_pic
*/
app.get('/users', (req, res) => {
  db.all(`SELECT id, username, classe, sezione, indirizzo, profile_pic FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json(rows);
  });
});

/*
  DELETE POST
  body: { id }
*/
app.post('/deletePost', (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, message: 'id richiesto' });
  db.run(`DELETE FROM posts WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true });
  });
});

/*
  DELETE PROFILE (e relativi post)
  body: { id }
*/
app.post('/deleteProfile', (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, message: 'id richiesto' });
  db.run(`DELETE FROM posts WHERE user_id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    db.run(`DELETE FROM users WHERE id = ?`, [id], function (err2) {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      return res.json({ success: true });
    });
  });
});

app.listen(port, () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});
