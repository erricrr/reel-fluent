
"use client"; // Ensure this module can be used in client components if needed

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

let app: FirebaseApp | undefined = undefined;
let auth: Auth | undefined = undefined;
let firestore: Firestore | undefined = undefined;

if (!firebaseConfig.apiKey) {
  console.error(
    'Firebase API key is missing. Please check your .env.local file and ensure NEXT_PUBLIC_FIREBASE_API_KEY is set and that you have restarted your development server.'
  );
} else {
  if (!getApps().length) {
    try {
      app = initializeApp(firebaseConfig);
      console.log("Firebase app initialized successfully.");
    } catch (error) {
      console.error('Firebase initialization error:', error);
      // Do not re-throw here to allow the rest of the app to load
    }
  } else {
    app = getApp();
    console.log("Firebase app already initialized, getting existing app.");
  }

  if (app) {
    try {
      auth = getAuth(app);
      firestore = getFirestore(app);
      console.log("Firebase Auth and Firestore services initialized.");
    } catch (error) {
      console.error('Firebase services (Auth, Firestore) initialization error:', error);
      // Services might remain undefined
    }
  } else {
    console.error("Firebase app was not initialized. Auth and Firestore services cannot be initialized.");
  }
}

export { app, auth, firestore };
