const admin = require('firebase-admin');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const sa = JSON.parse(fs.readFileSync('./firebase-key.json.json','utf-8'));
if (!admin.apps.length) admin.initializeApp({credential:admin.credential.cert(sa)});
const db = admin.firestore();

async function check() {
  const s = await db.collection('staff').where('loginId','==','kanri').get();
  const data = s.docs[0].data();
  console.log('passwordHash:', data.passwordHash);
  console.log('typeof:', typeof data.passwordHash);
  console.log('length:', data.passwordHash.length);
  
  const result = await bcrypt.compare('password123', data.passwordHash);
  console.log('bcrypt compare result:', result);
  
  // Also check from SQLite
  const sqlite3 = require('better-sqlite3');
  const sqliteDb = sqlite3('./dev.db');
  const row = sqliteDb.prepare("SELECT passwordHash FROM Staff WHERE loginId = 'kanri'").get();
  console.log('\nSQLite passwordHash:', row.passwordHash);
  console.log('SQLite compare:', await bcrypt.compare('password123', row.passwordHash));
  console.log('Hashes match:', data.passwordHash === row.passwordHash);
}
check();
