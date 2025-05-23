// src/lib/firebaseAdmin.ts
// Server-side Firebase Admin SDK initialization
import * as admin from 'firebase-admin'; // This line will fail if 'firebase-admin' is not installed/found
import type { Firestore } from 'firebase-admin/firestore';

let firestoreAdminInstance: Firestore | undefined;

// Check if the essential environment variables for server-side admin are present
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY; // Raw private key

if (projectId && clientEmail && privateKey) {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'), // Replace escaped newlines
        }),
        // databaseURL: `https_//${projectId}.firebaseio.com` // Optional: if using Realtime Database
      });
      console.log('Firebase Admin SDK initialized.');
      firestoreAdminInstance = admin.firestore();
    } catch (error) {
      console.error('Firebase Admin SDK initialization error:', error);
      // firestoreAdminInstance remains undefined
    }
  } else {
    // App is already initialized, get firestore instance
    firestoreAdminInstance = admin.firestore();
  }
} else {
  console.warn(
    'Firebase Admin SDK not initialized. Missing one or more required environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Server-side Firestore operations will be unavailable.'
  );
  // firestoreAdminInstance remains undefined
}

export const firestoreAdmin = firestoreAdminInstance;
// export const authAdmin = admin.auth(); // Uncomment if you need admin auth operations
