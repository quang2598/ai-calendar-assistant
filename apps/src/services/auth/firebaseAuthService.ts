import {
  getAdditionalUserInfo,
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
export type GoogleSignInResult = {
  user: AuthUser | null;
  uid: string | null;
  isNewUser: boolean;
};

function projectFirebaseUser(user: User | null): AuthUser | null {
  if (!user) {
    return null;
  }

  return {
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export function getCurrentAuthUid(): string | null {
  return auth.currentUser?.uid ?? null;
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

export async function signInWithGooglePopup(): Promise<GoogleSignInResult> {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  const user = projectFirebaseUser(credential.user);
  const additionalUserInfo = getAdditionalUserInfo(credential);

  const hasCreationTime = Boolean(credential.user.metadata.creationTime);
  const hasLastSignInTime = Boolean(credential.user.metadata.lastSignInTime);
  const metadataSuggestsNewUser =
    hasCreationTime &&
    hasLastSignInTime &&
    credential.user.metadata.creationTime === credential.user.metadata.lastSignInTime;

  return {
    user,
    uid: credential.user.uid,
    isNewUser: additionalUserInfo?.isNewUser ?? metadataSuggestsNewUser,
  };
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
