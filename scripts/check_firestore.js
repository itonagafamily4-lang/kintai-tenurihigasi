const admin = require('firebase-admin');
const fs = require('fs');
const sa = JSON.parse(fs.readFileSync('./firebase-key.json.json','utf-8'));
if (!admin.apps.length) admin.initializeApp({credential:admin.credential.cert(sa)});
const db = admin.firestore();

async function check() {
  const s = await db.collection('staff').where('loginId','==','kanri').get();
  console.log('Found by loginId:', s.size);
  s.forEach(d => {
    const data = d.data();
    console.log('ID:', d.id, 'Name:', data.name, 'loginId:', data.loginId, 'isActive:', data.isActive);
  });
  
  // Also check first 3 staff
  const all = await db.collection('staff').limit(3).get();
  console.log('\nFirst 3 staff:');
  all.forEach(d => {
    const data = d.data();
    console.log('ID:', d.id, 'loginId:', data.loginId, 'isActive:', data.isActive, 'typeof isActive:', typeof data.isActive);
  });
}
check();
