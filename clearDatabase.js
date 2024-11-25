import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Load the service account key
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com',
  });
}

// Get the database reference
const db = admin.database();

// Function to clear the database
async function clearDatabase() {
  try {
    console.log('Clearing database...');
    await db.ref('/adverts').remove();
    console.log('Database cleared successfully!');
  } catch (error) {
    console.error('Error clearing database:', error);
  }
}

clearDatabase();
