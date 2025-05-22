
"use client"; // Ensure this module can be used in client components if needed

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firestore: Firestore | undefined;

// Structure to hold config values from environment variables
const firebaseConfigValues = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // This one is optional
};

// Define which keys are absolutely required for initialization
const requiredKeys: (keyof typeof firebaseConfigValues)[] = [
  'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'
];

// Check if all required keys have valid, non-empty string values
const isConfigSufficient = requiredKeys.every(key => {
  const value = firebaseConfigValues[key];
  return typeof value === 'string' && value.trim().length > 0;
});

if (!isConfigSufficient) {
  console.error(
    'One or more Firebase configuration values are missing or invalid. Please check your .env.local file. Ensure all required NEXT_PUBLIC_FIREBASE_... variables are set with non-empty values and that you have restarted your development server. Firebase will not be initialized.'
  );
  // app, auth, firestore will remain undefined
} else {
  try {
    // Prepare a config object for initializeApp, filtering out any keys that might be undefined (like an optional measurementId)
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
    } else {
       // This case should ideally not be reached if isConfigSufficient is true and initializeApp doesn't throw
      console.error("Firebase app could not be initialized or retrieved despite sufficient config. Auth and Firestore services will be unavailable.");
    }
  } catch (error) {
    console.error('Critical error during Firebase initialization process:', error);
    // Ensure app, auth, and firestore are explicitly undefined on error
    app = undefined;
    auth = undefined;
    firestore = undefined;
  }
}

export { app, auth, firestore };
