require('dotenv').config();

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim()) {
    try {
      // Tolerate a JSON value pasted with newlines/whitespace from the Vercel UI.
      return JSON.parse(raw.replace(/[\r\n\t]/g, ''));
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON: ' + e.message);
    }
  }
  const localPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(localPath)) {
    return require(localPath);
  }
  throw new Error(
    'Firebase credentials missing. On Vercel set the FIREBASE_SERVICE_ACCOUNT environment variable ' +
    '(the full serviceAccountKey.json as a single line of JSON). Locally, provide serviceAccountKey.json.'
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
