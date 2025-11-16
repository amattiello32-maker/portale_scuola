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

// HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// LOGIN
app.post('/login', (req,res)=>{
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error: err.message});
    if(!email.endsWith('@isisleonardodavincipoggiomarino.it')){
      return res.json({success:false,message:'Usa un account istituzionale valido'});
    }
    if(row){
      if(password === row.password){
        db.run(`UPDATE users SET failed_attempts=0 WHERE id=?`, [row.id]);
        return res.json({success:true,user:row,first_login:row.first_login});
      }else{
        const attempts = (row.failed_attempts || 0) + 1;
        db.run(`UPDATE users SET failed_attempts=? WHERE id=?`, [attempts,row.id]);
        return res.json({success:false,message:'Password errata',failed_attempts:attempts});
      }
    }else{
      // nuovo utente con password generale
      db.run(`INSERT INTO users (email,password,username) VALUES (?,?,?)`, [email,password,email.split('@')[0]], function(err){
        if(err) return res.status(500).json({error:err.message});
        db.get(`SELECT * FROM users WHERE id=?`, [this.lastID], (err2,row2)=>{
          res.json({success:true,user:row2,first_login:1});
        });
      });
    }
  });
});

// RESET PASSWORD DOPO 3 TENTATIVI
app.post('/resetPassword', (req,res)=>{
  const { email } = req.body;
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row) return res.json({success:false,message:'Utente non trovato'});
    db.run(`UPDATE users SET password='SG20513', failed_attempts=0 WHERE id=?`, [row.id], ()=>res.json({success:true,message:'Password resettata'}));
  });
});

// UPDATE PROFILO
app.post('/updateProfile', (req,res)=>{
  const id = req.query.id;
  const { username, classe, sezione, indirizzo, profile_pic } = req.body;
  const updates = [];
  const params = [];
  if(username){ updates.push("username=?"); params.push(username); }
  if(classe){ updates.push("classe=?"); params.push(classe); }
  if(sezione){ updates.push("sezione=?"); params.push(sezione); }
  if(indirizzo){ updates.push("indirizzo=?"); params.push(indirizzo); }
  if(profile_pic){ updates.push("profile_pic=?"); params.push(profile_pic); }
  if(updates.length===0) return res.json({success:false,message:'Nessun dato da aggiornare'});
  params.push(id);
  db.run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, params, function(err){
    if(err) return res.status(500).json({error:err.message});
    db.get(`SELECT * FROM users WHERE id=?`, [id], (err,row)=>res.json({success:true,user:row}));
  });
});

// UPDATE PASSWORD
app.post('/updatePassword', (req,res)=>{
  const { user_id, new_password } = req.body;
  db.run(`UPDATE users SET password=?, first_login=0 WHERE id=?`, [new_password,user_id], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true});
  });
});

// DELETE PROFILE
app.post('/deleteProfile', (req,res)=>{
  const { user_id } = req.body;
  db.run(`DELETE FROM posts WHERE user_id=?`, [user_id]);
  db.run(`DELETE FROM users WHERE id=?`, [user_id], ()=>res.json({success:true}));
});

// INSERIMENTO POST
app.post('/post', (req,res)=>{
  const { user_id, body, anonymous } = req.body;
  const anonValue = anonymous ? 1 : 0;
  db.run(`INSERT INTO posts (user_id, body, anonymous) VALUES (?,?,?)`, [user_id, body, anonValue], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true,post_id:this.lastID});
  });
});

// DELETE POST
app.post('/deletePost', (req,res)=>{
  const { post_id } = req.body;
  db.run(`DELETE FROM posts WHERE id=?`, [post_id], ()=>res.json({success:true}));
});

// OTTIENI POST
app.get('/posts', (req,res)=>{
  db.all(`SELECT posts.*, users.username, users.profile_pic FROM posts JOIN users ON posts.user_id = users.id ORDER BY timestamp DESC`, [], (err, rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// LISTA UTENTI
app.get('/users', (req,res)=>{
  db.all(`SELECT id,username,classe,sezione,indirizzo,profile_pic FROM users`, [], (err, rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

app.listen(port, ()=> console.log(`Server in ascolto sulla porta ${port}`));
