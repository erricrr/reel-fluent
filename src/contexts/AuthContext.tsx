
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
      // Firebase Auth is intentionally disabled
      setLoading(false);
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
      // Firebase Auth is intentionally disabled
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
      // Firebase Auth is intentionally disabled
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
