const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({limit:'10mb'}));
app.use(bodyParser.urlencoded({ extended: true }));

// Serve index.html e risorse statiche
app.use(express.static(__dirname));

const db = new sqlite3.Database('school.db');

// Creazione tabelle
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    username TEXT,
    classe TEXT,
    sezione TEXT,
    indirizzo TEXT,
    password TEXT,
    profile_pic TEXT,
    first_login INTEGER DEFAULT 1,
    failed_attempts INTEGER DEFAULT 0
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

// ROUTE HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// LOGIN
app.post('/login', (req,res)=>{
  const { email, password } = req.body;
  if(!email.endsWith('@isisleonardodavincipoggiomarino.it')){
    return res.json({success:false,message:'Email non valida'});
  }

  db.get(`SELECT * FROM users WHERE email=?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error: err.message});

    if(row){
      if(row.first_login && password !== 'SG20513'){
        return res.json({success:false,message:'Inserisci la password iniziale SG20513'});
      }
      if(row.first_login && password === 'SG20513'){
        return res.json({success:true,user:row,first_login:true});
      }
      if(password === row.password){
        // reset tentativi errati
        db.run(`UPDATE users SET failed_attempts=0 WHERE id=?`, [row.id]);
        return res.json({success:true,user:row});
      } else {
        const failed = (row.failed_attempts || 0) + 1;
        db.run(`UPDATE users SET failed_attempts=? WHERE id=?`, [failed,row.id]);
        return res.json({success:false,message:'Password errata',failed_attempts:failed});
      }
    } else {
      // Primo accesso email, crea utente con first_login=1
      db.run(`INSERT INTO users (email,password,username,first_login) VALUES (?,?,?,1)`,
        [email,'SG20513',email.split('@')[0]], function(err){
          if(err) return res.status(500).json({error:err.message});
          db.get(`SELECT * FROM users WHERE id=?`, [this.lastID], (err2,row2)=>res.json({success:true,user:row2,first_login:true}));
      });
    }
  });
});

// AGGIORNA PASSWORD DOPO PRIMO LOGIN
app.post('/updatePassword', (req,res)=>{
  const { user_id, new_password } = req.body;
  if(!new_password) return res.json({success:false,message:'Password non valida'});
  db.run(`UPDATE users SET password=?, first_login=0, failed_attempts=0 WHERE id=?`, [new_password,user_id], function(err){
    if(err) return res.status(500).json({error:err.message});
    db.get(`SELECT * FROM users WHERE id=?`, [user_id], (err,row)=>res.json({success:true,user:row}));
  });
});

// AGGIORNA PROFILO
app.post('/updateProfile', (req,res)=>{
  const id = req.query.id;
  const { username, classe, sezione, indirizzo, profile_pic } = req.body;
  const updates = [];
  const params = [];
  if(username) { updates.push("username=?"); params.push(username); }
  if(classe) { updates.push("classe=?"); params.push(classe); }
  if(sezione) { updates.push("sezione=?"); params.push(sezione); }
  if(indirizzo) { updates.push("indirizzo=?"); params.push(indirizzo); }
  if(profile_pic) { updates.push("profile_pic=?"); params.push(profile_pic); }
  if(updates.length===0) return res.json({success:false,message:'Nessun dato da aggiornare'});
  params.push(id);
  db.run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, params, function(err){
    if(err) return res.status(500).json({error:err.message});
    db.get(`SELECT * FROM users WHERE id=?`, [id], (err,row)=>res.json({success:true,user:row}));
  });
});

// ELIMINA PROFILO
app.post('/deleteProfile', (req,res)=>{
  const { user_id } = req.body;
  db.run(`DELETE FROM posts WHERE user_id=?`, [user_id], function(err){
    if(err) return res.status(500).json({error:err.message});
    db.run(`DELETE FROM users WHERE id=?`, [user_id], function(err2){
      if(err2) return res.status(500).json({error:err2.message});
      res.json({success:true});
    });
  });
});

// POST
app.post('/post', (req,res)=>{
  const { user_id, body, anonymous } = req.body;
  db.run(`INSERT INTO posts (user_id, body, anonymous) VALUES (?,?,?)`, [user_id,body,anonymous?1:0], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true,post_id:this.lastID});
  });
});

// ELIMINA POST
app.post('/deletePost', (req,res)=>{
  const { post_id } = req.body;
  db.run(`DELETE FROM posts WHERE id=?`, [post_id], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true});
  });
});

// GET POSTS
app.get('/posts', (req,res)=>{
  db.all(`SELECT posts.*, users.username, users.profile_pic FROM posts JOIN users ON posts.user_id = users.id ORDER BY timestamp DESC`, [], (err, rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// GET USERS
app.get('/users', (req,res)=>{
  db.all(`SELECT id,username,classe,sezione,indirizzo,profile_pic FROM users`, [], (err, rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// Avvio server
app.listen(port, ()=> console.log(`Server in ascolto sulla porta ${port}`));
