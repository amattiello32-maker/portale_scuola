// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const db = new sqlite3.Database('school.db');

const PASSWORD_INIT = 'SG20513';
const DOMAIN = '@isisleonardodavincipoggiomarino.it';

function passwordOk(pw){
  if(!pw || typeof pw !== 'string') return false;
  if(pw.length < 8) return false;
  if(!/[A-Z]/.test(pw)) return false;
  if(!/[!_\-@]/.test(pw)) return false;
  return true;
}
function usernameOk(u){
  if(!u || typeof u !== 'string') return false;
  if(/\s/.test(u)) return false; // no spaces
  return /^[A-Za-z0-9._\-]+$/.test(u);
}

// Create tables
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

// Serve index.html
app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'index.html')));

// LOGIN
app.post('/login', (req,res) => {
  const { email, password } = req.body;
  if(!email || !email.toLowerCase().endsWith(DOMAIN)){
    return res.json({ success:false, message: `Devi usare un account con dominio ${DOMAIN}` });
  }
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
    if(err) return res.status(500).json({ success:false, message: err.message });
    if(row){
      if(row.first_login){
        // first_login: accept only PASSWORD_INIT
        if(password !== PASSWORD_INIT){
          return res.json({ success:false, message: 'Primo accesso: inserisci la password iniziale' });
        }
        // allow login and inform front-end to force change
        return res.json({ success:true, user:row, first_login:true });
      } else {
        // normal login
        if(password === row.password){
          return res.json({ success:true, user:row, first_login:false });
        } else {
          return res.json({ success:false, message: 'Password errata' });
        }
      }
    } else {
      // create new user record with initial password SG20513 and first_login = 1
      const uname = email.split('@')[0];
      db.run(`INSERT INTO users (email, password, username, first_login) VALUES (?,?,?,1)`, [email, PASSWORD_INIT, uname], function(err2){
        if(err2) return res.status(500).json({ success:false, message: err2.message });
        db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err3, row3) => {
          return res.json({ success:true, user:row3, first_login:true });
        });
      });
    }
  });
});

// CHANGE PASSWORD (after first login)
app.post('/changePassword', (req,res) => {
  const { user_id, newPassword } = req.body;
  if(!user_id || !newPassword) return res.json({ success:false, message:'Dati mancanti' });
  if(!passwordOk(newPassword)) return res.json({ success:false, message:'Password non rispetta la policy' });
  db.run(`UPDATE users SET password = ?, first_login = 0 WHERE id = ?`, [newPassword, user_id], function(err){
    if(err) return res.status(500).json({ success:false, message: err.message });
    db.get(`SELECT * FROM users WHERE id = ?`, [user_id], (err2, row) => {
      if(err2) return res.status(500).json({ success:false, message: err2.message });
      return res.json({ success:true, user:row });
    });
  });
});

// RESET PASSWORD (optional, after >3 attempts front-end triggers)
app.post('/resetPassword', (req,res) => {
  const { email } = req.body;
  if(!email) return res.json({ success:false, message:'Email mancante' });
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err,row) => {
    if(err) return res.status(500).json({ success:false, message:err.message });
    if(!row) return res.json({ success:false, message:'Utente non trovato' });
    db.run(`UPDATE users SET password = ?, first_login = 1 WHERE email = ?`, [PASSWORD_INIT, email], function(err2){
      if(err2) return res.status(500).json({ success:false, message: err2.message });
      return res.json({ success:true, message:'Password resettata a password iniziale' });
    });
  });
});

// UPDATE PROFILE (can accept JSON)
app.post('/updateProfile', (req,res) => {
  const id = req.query.id;
  if(!id) return res.json({ success:false, message:'ID mancante' });
  const { username, classe, sezione, indirizzo, profile_pic, password } = req.body;
  // validate username if provided
  if(username && !usernameOk(username)) return res.json({ success:false, message:'Username non valido' });
  // build updates
  const updates = [];
  const params = [];
  if(username){ updates.push('username=?'); params.push(username); }
  if(classe){ updates.push('classe=?'); params.push(classe); }
  if(sezione){ updates.push('sezione=?'); params.push(sezione); }
  if(indirizzo){ updates.push('indirizzo=?'); params.push(indirizzo); }
  if(profile_pic){ updates.push('profile_pic=?'); params.push(profile_pic); }
  if(password){
    if(!passwordOk(password)) return res.json({ success:false, message:'Password non rispetta la policy' });
    updates.push('password=?'); params.push(password);
    updates.push('first_login=0');
  }
  if(updates.length === 0) return res.json({ success:false, message:'Nessun campo da aggiornare' });
  params.push(id);
  const sql = `UPDATE users SET ${updates.join(',')} WHERE id = ?`;
  db.run(sql, params, function(err){
    if(err) return res.status(500).json({ success:false, message: err.message });
    db.get(`SELECT * FROM users WHERE id = ?`, [id], (err2,row)=>{
      if(err2) return res.status(500).json({ success:false, message: err2.message });
      return res.json({ success:true, user:row });
    });
  });
});

// CREATE POST
app.post('/post', (req,res) => {
  const { user_id, body, anonymous } = req.body;
  if(!user_id || typeof body !== 'string') return res.json({ success:false, message:'Dati mancanti' });
  const anon = anonymous ? 1 : 0;
  db.run(`INSERT INTO posts (user_id, body, anonymous) VALUES (?,?,?)`, [user_id, body, anon], function(err){
    if(err) return res.status(500).json({ success:false, message: err.message });
    return res.json({ success:true, post_id: this.lastID });
  });
});

// GET POSTS (join to get username/profile_pic)
app.get('/posts', (req,res) => {
  // left join so posts from deleted users are handled
  db.all(`SELECT posts.*, users.username, users.profile_pic FROM posts LEFT JOIN users ON posts.user_id = users.id ORDER BY timestamp DESC`, [], (err, rows)=>{
    if(err) return res.status(500).json({ success:false, message: err.message });
    return res.json(rows);
  });
});

// GET USERS
app.get('/users', (req,res) => {
  db.all(`SELECT id, username, classe, sezione, indirizzo, profile_pic FROM users`, [], (err, rows) => {
    if(err) return res.status(500).json({ success:false, message: err.message });
    return res.json(rows);
  });
});

// DELETE POST
app.post('/deletePost', (req,res) => {
  // accept id either in body or query
  const id = req.body.id || req.query.id;
  if(!id) return res.json({ success:false, message:'id mancante' });
  db.run(`DELETE FROM posts WHERE id = ?`, [id], function(err){
    if(err) return res.status(500).json({ success:false, message: err.message });
    return res.json({ success:true });
  });
});

// DELETE PROFILE (and its posts)
app.post('/deleteProfile', (req,res) => {
  const id = req.body.id || req.query.id;
  if(!id) return res.json({ success:false, message:'id mancante' });
  db.run(`DELETE FROM users WHERE id = ?`, [id], function(err){
    if(err) return res.status(500).json({ success:false, message: err.message });
    db.run(`DELETE FROM posts WHERE user_id = ?`, [id], function(){});
    return res.json({ success:true });
  });
});

app.listen(port, () => console.log(`Server in ascolto sulla porta ${port}`));
