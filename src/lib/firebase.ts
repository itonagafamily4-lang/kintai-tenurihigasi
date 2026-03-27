import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Firebase Admin SDK の初期化（サーバーサイド専用）
if (!admin.apps.length) {
  let serviceAccount: admin.ServiceAccount | null = null;

  // 1. 環境変数から読み込み（Netlify等の本番環境）
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } else {
    // 2. ローカル開発用：firebase-key.json.json ファイルから読み込み
    const keyPath = path.join(process.cwd(), 'firebase-key.json.json');
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath, 'utf-8');
      serviceAccount = JSON.parse(raw);
    }
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    throw new Error('Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_KEY env var or place firebase-key.json.json in project root.');
  }
}

export const firestore = admin.firestore();
export default admin;
