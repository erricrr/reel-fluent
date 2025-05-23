
"use client";

import type * as React from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Relies on firebase.ts
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth is not initialized. Auth features will be unavailable."); // Changed from console.error
      setLoading(false);
      // Optionally, show a toast to the user if auth is critical and not just optional
      // toast({ variant: "destructive", title: "Authentication Error", description: "Firebase Auth could not be initialized." });
      return () => {}; // Return an empty cleanup function
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [toast]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      toast({ variant: "destructive", title: "Sign-in Error", description: "Authentication service is not available." });
      console.warn("Attempted to signInWithGoogle, but Firebase Auth is not initialized."); // Changed from console.error
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast({ title: "Signed In", description: "Successfully signed in with Google." });
    } catch (error) {
      console.error("Error signing in with Google:", error);
      toast({ variant: "destructive", title: "Sign-in Error", description: (error as Error).message });
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    if (!auth) {
      toast({ variant: "destructive", title: "Sign-out Error", description: "Authentication service is not available." });
      console.warn("Attempted to signOut, but Firebase Auth is not initialized."); // Changed from console.error
      return;
    }
    try {
      await firebaseSignOut(auth);
      toast({ title: "Signed Out", description: "Successfully signed out." });
    } catch (error) {
      console.error("Error signing out:", error);
      toast({ variant: "destructive", title: "Sign-out Error", description: (error as Error).message });
    }
  }, [toast]);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
