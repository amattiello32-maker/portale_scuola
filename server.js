
// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({limit:'20mb'})); // allow base64 images
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const db = new sqlite3.Database('school.db');

// create tables
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

// serve index.html
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname,'index.html'));
});

// LOGIN
app.post('/login', (req,res) => {
  const { email, password } = req.body;
  if(!email || !email.toLowerCase().endsWith('@isisleonardodavincipoggiomarino.it')){
    return res.json({ success:false, message:'Email non valida per il dominio scolastico.' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err,row) => {
    if(err) return res.status(500).json({ success:false, message:err.message });
    if(row){
      // user exists
      if(row.first_login){
        // user must login with SG20513 (first-time)
        if(password !== 'SG20513') return res.json({ success:false, message:'Primo accesso: inserisci SG20513' });
        // allow login but indicate first_login still true (frontend should force change)
        return res.json({ success:true, user:row });
      } else {
        if(password !== row.password) return res.json({ success:false, message:'Password errata' });
        return res.json({ success:true, user:row });
      }
    } else {
      // create new user with initial password SG20513 (only if provided)
      if(password !== 'SG20513') return res.json({ success:false, message:'Al primo accesso devi usare SG20513 (password iniziale)' });
      db.run(`INSERT INTO users (email,password,username,first_login) VALUES (?,?,?,1)`, [email,password,email.split('@')[0]], function(err2){
        if(err2) return res.status(500).json({ success:false, message:err2.message });
        db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err3,row3) => {
          if(err3) return res.status(500).json({ success:false, message:err3.message });
          return res.json({ success:true, user:row3 });
        });
      });
    }
  });
});

// RESET PASSWORD (set to SG20513 and set first_login = 1)
app.post('/resetPassword', (req,res)=>{
  const { email, password } = req.body;
  if(!email) return res.json({ success:false, message:'Email richiesta' });
  db.run(`UPDATE users SET password = ?, first_login = 1 WHERE email = ?`, [password, email], function(err){
    if(err) return res.status(500).json({ success:false, message:err.message });
    return res.json({ success:true });
  });
});

// CHANGE PASSWORD (frontend should call when user sets new password; sets first_login=0)
app.post('/changePassword', (req,res)=>{
  const { id, newPassword } = req.body;
  if(!id || !newPassword) return res.json({ success:false, message:'Dati mancanti' });
  db.run(`UPDATE users SET password = ?, first_login = 0 WHERE id = ?`, [newPassword, id], function(err){
    if(err) return res.status(500).json({ success:false, message:err.message });
    db.get(`SELECT * FROM users WHERE id = ?`, [id], (err2,row)=> {
      if(err2) return res.status(500).json({ success:false, message:err2.message });
      return res.json({ success:true, user: row });
    });
  });
});

// UPDATE PROFILE (accepts JSON; profile_pic can be base64 data URL)
app.post('/updateProfile', (req,res)=>{
  const id = req.query.id;
  if(!id) return res.json({ success:false, message:'ID mancante' });
  const { username, classe, sezione, indirizzo, profile_pic, password } = req.body;
  const updates = [];
  const params = [];
  if(username !== undefined) { updates.push('username=?'); params.push(username); }
  if(classe !== undefined) { updates.push('classe=?'); params.push(classe); }
  if(sezione !== undefined) { updates.push('sezione=?'); params.push(sezione); }
  if(indirizzo !== undefined) { updates.push('indirizzo=?'); params.push(indirizzo); }
  if(profile_pic !== undefined) { updates.push('profile_pic=?'); params.push(profile_pic); }
  if(password !== undefined) { updates.push('password=?'); params.push(password); updates.push('first_login=0'); }

  if(updates.length === 0) return res.json({ success:false, message:'Nessun campo da aggiornare' });
  params.push(id);
  const sql = `UPDATE users SET ${updates.join(',')} WHERE id = ?`;
  db.run(sql, params, function(err){
    if(err) return res.status(500).json({ success:false, message:err.message });
    db.get(`SELECT id,email,username,classe,sezione,indirizzo,first_login,profile_pic FROM users WHERE id = ?`, [id], (err2,row)=> {
      if(err2) return res.status(500).json({ success:false, message:err2.message });
      return res.json({ success:true, user: row });
    });
  });
});

// POST (anonymous posts will have user_id NULL)
app.post('/post', (req,res)=>{
  // allow user_id to be null for anonymous
  const { user_id, body, anonymous } = req.body;
  const uid = (anonymous || user_id === null || user_id === undefined) ? null : user_id;
  db.run(`INSERT INTO posts (user_id, body, anonymous) VALUES (?,?,?)`, [uid, body, anonymous ? 1 : 0], function(err){
    if(err) return res.status(500).json({ success:false, message:err.message });
    return res.json({ success:true, post_id: this.lastID });
  });
});

// GET POSTS (join user fields; for anonymous posts user fields will be null)
app.get('/posts', (req,res)=>{
  db.all(`SELECT posts.id, posts.user_id, posts.body, posts.anonymous, posts.timestamp,
                 users.username, users.profile_pic
          FROM posts
          LEFT JOIN users ON posts.user_id = users.id
          ORDER BY posts.timestamp DESC`, [], (err, rows)=>{
    if(err) return res.status(500).json({ success:false, message:err.message });
    return res.json(rows);
  });
});

// GET USERS (exclude email in response for profile popup per your request)
app.get('/users', (req,res)=>{
  db.all(`SELECT id, username, classe, sezione, indirizzo, profile_pic FROM users`, [], (err, rows)=>{
    if(err) return res.status(500).json({ success:false, message:err.message });
    return res.json(rows);
  });
});

// DELETE POST
app.post('/deletePost', (req,res)=>{
  const { id } = req.body;
  if(!id) return res.json({ success:false, message:'ID mancante' });
  db.run(`DELETE FROM posts WHERE id = ?`, [id], function(err){
    if(err) return res.status(500).json({ success:false, message:err.message });
    return res.json({ success:true });
  });
});

// DELETE PROFILE (and their posts)
app.post('/deleteProfile', (req,res)=>{
  const { id } = req.body;
  if(!id) return res.json({ success:false, message:'ID mancante' });
  db.run(`DELETE FROM users WHERE id = ?`, [id], function(err){
    if(err) return res.status(500).json({ success:false, message:err.message });
    db.run(`DELETE FROM posts WHERE user_id = ?`, [id], ()=>{});
    return res.json({ success:true });
  });
});

// start server
app.listen(port, ()=>console.log(`Server in ascolto sulla porta ${port}`));

