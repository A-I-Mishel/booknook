require('dotenv').config();

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function normalizePrivateKey(key) {
  // Vercel env vars often contain literal `\n` instead of real newlines.
  return String(key).replace(/\\n/g, '\n');
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim()) {
    const trimmed = raw.trim();
    try {
      // JSON.parse already tolerates whitespace/newlines, so parse directly.
      return JSON.parse(trimmed);
    } catch (e1) {
      // Tolerate base64-encoded JSON (avoids quoting/newline issues in dashboards).
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        if (decoded.trim().startsWith('{')) return JSON.parse(decoded);
      } catch (_) { /* fall through */ }
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON: ' + e1.message +
        '. Paste the full serviceAccountKey.json as a single line, or use ' +
        'FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY instead.'
      );
    }
  }

  // Split-env alternative (easier in Vercel UI than pasting huge JSON).
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      type: 'service_account',
      project_id: projectId,
      private_key: normalizePrivateKey(privateKey),
      client_email: clientEmail,
      token_uri: 'https://oauth2.googleapis.com/token',
    };
  }

  const localPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(localPath)) {
    return require(localPath);
  }
  return null;
}

let db = null;
let firebaseError = null;

try {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      'Firebase credentials missing. On Vercel set FIREBASE_SERVICE_ACCOUNT ' +
      '(full serviceAccountKey.json as single-line JSON) OR set ' +
      'FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY. ' +
      'Locally, provide serviceAccountKey.json.'
    );
  }
  if (serviceAccount.private_key) {
    serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  db = admin.firestore();
} catch (err) {
  // Don't throw at import time — throwing here crashes the whole
  // Vercel serverless function (FUNCTION_INVOCATION_FAILED).
  // Export the error so server.js can show a friendly config page.
  firebaseError = err;
  console.error('[firebase] init failed:', err.message);
}

module.exports = { admin, db, firebaseError };
