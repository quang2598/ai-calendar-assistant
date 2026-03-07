import { FirebaseError } from "firebase/app";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import type { AuthUser } from "@/src/types/auth";

export async function createUserProfile(user: AuthUser): Promise<void> {
  const profileRef = doc(db, "users", user.uid);

  await setDoc(
    profileRef,
    {
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateUserLastLogin(uid: string): Promise<void> {
  const profileRef = doc(db, "users", uid);
  const snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    return;
  }

  await updateDoc(profileRef, {
    lastLoginAt: serverTimestamp(),
  });
}

export function normalizeUserProfileError(error: unknown): string {
  if (error instanceof FirebaseError) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected user profile error occurred.";
}
