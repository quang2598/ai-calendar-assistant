import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";

import { auth, googleAuthProvider } from "@/src/lib/firebase";
import type { AuthUser } from "@/src/types/auth";

type AuthStateChangeHandler = (user: AuthUser | null) => void;
type AuthStateErrorHandler = (error: unknown) => void;

function projectFirebaseUser(user: User | null): AuthUser | null {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export function listenToAuthChanges(
  onChange: AuthStateChangeHandler,
  onError?: AuthStateErrorHandler,
): () => void {
  return onAuthStateChanged(
    auth,
    (firebaseUser) => {
      onChange(projectFirebaseUser(firebaseUser));
    },
    onError,
  );
}

export async function signInWithGooglePopup(): Promise<AuthUser | null> {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  return projectFirebaseUser(credential.user);
}

export async function signOutFromFirebase() {
  await signOut(auth);
}

export function normalizeFirebaseAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected authentication error occurred.";
}
