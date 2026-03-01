"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  ReactNode,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SessionUser } from "./auth-session";
import { auth, googleProvider } from "./firebase";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readSessionUser() {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { user?: SessionUser };
  return data.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const sessionUser = await readSessionUser();
    setUser(sessionUser);
  }, []);

  const createServerSession = useCallback(async (idToken: string) => {
    const response = await fetch("/api/auth/sessionLogin", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      throw new Error("Could not establish a server session.");
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await createServerSession(await credential.user.getIdToken(true));
      await signOut(auth).catch(() => undefined);
      await refreshSession();
    },
    [createServerSession, refreshSession],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await createServerSession(await credential.user.getIdToken(true));
      await signOut(auth).catch(() => undefined);
      await refreshSession();
    },
    [createServerSession, refreshSession],
  );

  const signInWithGoogle = useCallback(async () => {
    const credential = await signInWithPopup(auth, googleProvider);
    await createServerSession(await credential.user.getIdToken(true));
    await signOut(auth).catch(() => undefined);
    await refreshSession();
  }, [createServerSession, refreshSession]);

  const signOutUser = useCallback(async () => {
    await fetch("/api/auth/sessionLogout", {
      method: "POST",
      credentials: "include",
    });

    await signOut(auth).catch(() => undefined);
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const sessionUser = await readSessionUser();
        if (active) {
          setUser(sessionUser);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOutUser,
      refreshSession,
    }),
    [
      loading,
      refreshSession,
      signInWithEmail,
      signInWithGoogle,
      signOutUser,
      signUpWithEmail,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
