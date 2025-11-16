const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Cartella uploads (creazione automatica se non esiste)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configurazione multer per upload immagini
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Database SQLite
const db = new sqlite3.Database('school.db');

db.serialize(() => {
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

// ROUTE HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// LOGIN
app.post('/login', (req,res)=>{
  const { email, password } = req.body;

  if (!email.toLowerCase().endsWith('@isisleonardodavincipoggiomarino.it')) {
    return res.json({success:false,message:'Deve essere un account istituzionale'});
  }

  db.get(`SELECT * FROM users WHERE email=?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error: err.message});

    if(row){
      if(password === row.password) return res.json({success:true,user:row});
      else return res.json({success:false,message:'Password errata'});
    } else {
      // crea nuovo utente con password temporanea uguale a SG20513
      db.run(`INSERT INTO users (email,password,username) VALUES (?,?,?)`,
        [email,'SG20513',email.split('@')[0]],
        function(err){
          if(err) return res.status(500).json({error:err.message});
          db.get(`SELECT * FROM users WHERE id=?`, [this.lastID], (err2,row2)=>res.json({success:true,user:row2}));
        });
    }
  });
});

// UPDATE PROFILO
app.post('/updateProfile', upload.single('profile_pic'), (req,res)=>{
  const id = req.query.id;
  const { username, classe, sezione, indirizzo, password } = req.body;
  const updates = [];
  const params = [];

  if(username){ updates.push("username=?"); params.push(username); }
  if(classe){ updates.push("classe=?"); params.push(classe); }
  if(sezione){ updates.push("sezione=?"); params.push(sezione); }
  if(indirizzo){ updates.push("indirizzo=?"); params.push(indirizzo); }
  if(password){ updates.push("password=?"); params.push(password); }
  if(req.file){ updates.push("profile_pic=?"); params.push('/uploads/' + req.file.filename); }

  if(updates.length===0) return res.json({success:false,message:'Nessun dato da aggiornare'});
  params.push(id);

  db.run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, params, function(err){
    if(err) return res.status(500).json({error:err.message});
    db.get(`SELECT * FROM users WHERE id=?`, [id], (err,row)=>res.json({success:true,user:row}));
  });
});

// INSERIMENTO POST
app.post('/post', (req,res)=>{
  const { user_id, body, anonymous } = req.body;
  db.run(`INSERT INTO posts (user_id, body, anonymous) VALUES (?,?,?)`, [user_id, body, anonymous?1:0], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true,post_id:this.lastID});
  });
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

// ELIMINA PROFILO
app.delete('/deleteUser', (req,res)=>{
  const { id } = req.body;
  db.run(`DELETE FROM users WHERE id=?`, [id], function(err){
    if(err) return res.status(500).json({error:err.message});
    db.run(`DELETE FROM posts WHERE user_id=?`, [id], function(err2){
      if(err2) return res.status(500).json({error:err2.message});
      res.json({success:true});
    });
  });
});

// Avvio server
app.listen(port, ()=> console.log(`Server in ascolto sulla porta ${port}`));

