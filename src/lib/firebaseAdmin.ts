
// src/lib/firebaseAdmin.ts
// Server-side Firebase Admin SDK initialization
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

let firestoreAdminInstance: Firestore | undefined;

// --- START: TEMPORARILY DISABLED FIREBASE ADMIN INITIALIZATION ---
// To re-enable Firebase Admin, uncomment the following block and ensure
// your server environment variables (FIREBASE_PROJECT_ID, etc.) are set.

/*
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (projectId && clientEmail && privateKey) {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin SDK initialized.');
      firestoreAdminInstance = admin.firestore();
    } catch (error) {
      console.warn('FIREBASE ADMIN DISABLED: Firebase Admin SDK initialization error:', error);
    }
  } else {
    firestoreAdminInstance = admin.firestore();
  }
} else {
  console.warn(
    'FIREBASE ADMIN DISABLED: Firebase Admin SDK not initialized. Missing one or more required environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Server-side Firestore operations will be unavailable.'
  );
}
*/

// If Firebase Admin initialization is disabled, firestoreAdminInstance will remain undefined.
// Firebase Admin is intentionally disabled for this build.

// --- END: TEMPORARILY DISABLED FIREBASE ADMIN INITIALIZATION ---

export const firestoreAdmin = firestoreAdminInstance;
// export const authAdmin = admin.auth(); // Uncomment if you need admin auth operations (and ensure admin is initialized)
