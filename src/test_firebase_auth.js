import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

async function test() {
  try {
    const serviceAccountPath = path.resolve('./src/config/firebase-service-account.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key
        .replace(/\\n/g, '\n')
        .replace(/\\\\n/g, '\n');
    }

    console.log('Project ID:', serviceAccount.project_id);
    console.log('Client Email:', serviceAccount.client_email);
    console.log('Private Key length:', serviceAccount.private_key?.length);

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    const credential = app.options.credential;
    console.log('Fetching access token from Google OAuth2...');

    const token = await credential.getAccessToken();
    console.log('🎉 SUCCESS! Access Token retrieved from Google OAuth2:', token.access_token.slice(0, 25) + '...');
  } catch (err) {
    console.error('❌ FAILURE:', err.message);
  }
}

test();
