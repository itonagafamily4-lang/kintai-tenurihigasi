const admin = require('firebase-admin');
const sqlite3 = require('better-sqlite3');
const serviceAccount = require('../firebase-key.json.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = sqlite3('./dev.db');
const firestore = admin.firestore();

// 移行対象のテーブルとコレクションの対応
const tables = [
  { table: 'Organization', collection: 'organizations' },
  { table: 'Staff', collection: 'staff' },
  { table: 'Attendance', collection: 'attendances' },
  { table: 'LeaveRequest', collection: 'leave_requests' },
  { table: 'LeaveApproval', collection: 'leave_approvals' },
  { table: 'LeaveBalance', collection: 'leave_balances' },
  { table: 'DutyMaster', collection: 'duty_masters' },
  { table: 'SettingMaster', collection: 'setting_masters' },
  { table: 'SpecialLeaveMaster', collection: 'special_leave_masters' },
  { table: 'SpecialLeaveBalance', collection: 'special_leave_balances' },
  { table: 'Schedule', collection: 'schedules' },
  { table: 'LeaveOfAbsenceRecord', collection: 'leave_of_absence_records' },
];

// Booleanとして扱うべきカラム（SQLiteでは0/1になるため）
const booleanFields = [
  'isActive', 'isPaid', 'isWorkOverride', 'isLate', 'isEarlyLeave'
];

async function migrateTable(tableName, collectionName) {
  const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
  console.log(`Migrating ${tableName} -> ${collectionName} (${rows.length} rows)...`);
  
  if (rows.length === 0) return;

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const batch = firestore.batch();
    
    chunk.forEach(row => {
      // データのクリーンアップと型変換
      const data = { ...row };
      
      // 0/1 を Boolean に変換
      Object.keys(data).forEach(key => {
        if (booleanFields.includes(key)) {
          data[key] = data[key] === 1;
        }
        // null値の削除（Firestoreはundefinedを嫌うため、あればnullにする）
        if (data[key] === undefined) {
          data[key] = null;
        }
      });

      const docRef = firestore.collection(collectionName).doc(data.id);
      batch.set(docRef, data);
    });
    
    await batch.commit();
    console.log(`  Uploaded ${Math.min(i + batchSize, rows.length)} rows...`);
  }
}

async function run() {
  for (const item of tables) {
    await migrateTable(item.table, item.collection);
  }
  console.log('Migration completed successfully!');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
