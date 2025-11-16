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

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    username TEXT,
    classe TEXT,
    sezione TEXT,
    indirizzo TEXT,
    password TEXT,
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

// HOME
app.get("/", (req,res)=>res.sendFile(path.join(__dirname,'index.html')));

// LOGIN
app.post('/login',(req,res)=>{
  const {email,password} = req.body;
  if(!email.endsWith("@isisleonardodavincipoggiomarino.it")) return res.json({success:false,message:'Dominio non valido'});
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(row){
      if(row.password===password){
        let mustChangePassword = (password==="SG20513");
        res.json({success:true,user:row,mustChangePassword});
      }else res.json({success:false,message:'Password errata'});
    } else {
      db.run(`INSERT INTO users (email,password,username) VALUES (?,?,?)`, [email,"SG20513",email.split('@')[0]], function(err){
        if(err) return res.status(500).json({error:err.message});
        db.get(`SELECT * FROM users WHERE id=?`, [this.lastID], (err2,row2)=>res.json({success:true,user:row2,mustChangePassword:true}));
      });
    }
  });
});

// CAMBIO PASSWORD
app.post('/changePassword',(req,res)=>{
  const id=req.query.id;
  const {password} = req.body;
  db.run(`UPDATE users SET password=? WHERE id=?`, [password,id], function(err){
    if(err) return res.status(500).json({error:err.message});
    db.get(`SELECT * FROM users WHERE id=?`, [id], (err,row)=>res.json({success:true,user:row}));
  });
});

// UPDATE PROFILO
app.post('/updateProfile',(req,res)=>{
  const id=req.query.id;
  const {username,classe,sezione,indirizzo,profile_pic} = req.body;
  const updates=[]; const params=[];
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

// POST
app.post('/post',(req,res)=>{
  const {user_id,body,anonymous} = req.body;
  db.run(`INSERT INTO posts (user_id,body,anonymous) VALUES (?,?,?)`, [anonymous?null:user_id,body,anonymous?1:0], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true,post_id:this.lastID});
  });
});

// DELETE POST
app.post('/deletePost',(req,res)=>{
  const id=req.query.id;
  db.run(`DELETE FROM posts WHERE id=?`, [id], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true});
  });
});

// GET POSTS
app.get('/posts',(req,res)=>{
  db.all(`SELECT posts.*, users.username, users.profile_pic FROM posts LEFT JOIN users ON posts.user_id = users.id ORDER BY timestamp DESC`, [], (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// GET USERS
app.get('/users',(req,res)=>{
  db.all(`SELECT id,username,classe,sezione,indirizzo,profile_pic FROM users`,[],(err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// SERVER
app.listen(port,()=>console.log(`Server in ascolto sulla porta ${port}`));
