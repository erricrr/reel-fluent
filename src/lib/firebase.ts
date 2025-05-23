
"use client"; // Ensure this module can be used in client components if needed

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firestore: Firestore | undefined;

// --- START: TEMPORARILY DISABLED FIREBASE INITIALIZATION ---
// To re-enable Firebase, uncomment the following block and ensure
// your .env.local file has the correct Firebase configuration.

/*
const firebaseConfigValues = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const requiredKeys: (keyof typeof firebaseConfigValues)[] = [
  'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'
];

const isConfigSufficient = requiredKeys.every(key => {
  const value = firebaseConfigValues[key];
  return typeof value === 'string' && value.trim().length > 0;
});

if (!isConfigSufficient) {
  console.warn(
    'FIREBASE DISABLED: One or more Firebase configuration values are missing or invalid. Please check your .env.local file. Ensure all required NEXT_PUBLIC_FIREBASE_... variables are set with non-empty values and that you have restarted your development server. Firebase will not be initialized.'
  );
} else {
  try {
    const configForFirebaseSDK: { [key: string]: string } = {};
    for (const key in firebaseConfigValues) {
      const typedKey = key as keyof typeof firebaseConfigValues;
      if (firebaseConfigValues[typedKey] !== undefined && typeof firebaseConfigValues[typedKey] === 'string') {
        configForFirebaseSDK[key] = firebaseConfigValues[typedKey] as string;
      }
    }
    
    if (!getApps().length) {
      app = initializeApp(configForFirebaseSDK);
    } else {
      app = getApp();
    }

    if (app) {
      auth = getAuth(app);
      firestore = getFirestore(app);
      console.log("Firebase client SDK initialized.");
    } else {
      console.warn("FIREBASE DISABLED: Firebase app could not be initialized or retrieved despite sufficient config. Auth and Firestore services will be unavailable.");
    }
  } catch (error) {
    console.warn('FIREBASE DISABLED: Critical error during Firebase initialization process:', error);
    app = undefined;
    auth = undefined;
    firestore = undefined;
  }
}
*/

// If Firebase initialization is disabled, app, auth, and firestore will remain undefined.
console.warn("FIREBASE DISABLED: Client-side Firebase initialization is currently commented out in src/lib/firebase.ts. Auth and Firestore features will be unavailable.");

// --- END: TEMPORARILY DISABLED FIREBASE INITIALIZATION ---


export { app, auth, firestore };
