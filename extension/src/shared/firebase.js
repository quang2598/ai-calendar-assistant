import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithCredential } from "firebase/auth/web-extension";
import { config } from "../config.js";

const firebaseApp = initializeApp({
  apiKey: config.firebase.apiKey,
  authDomain: config.firebase.authDomain,
  projectId: config.firebase.projectId,
});

export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

/**
 * Sign into Firebase Auth using a Google OAuth access token.
 * Uses firebase/auth/web-extension for proper Chrome extension support.
 */
export async function signIntoFirebase(googleAccessToken) {
  const credential = GoogleAuthProvider.credential(null, googleAccessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user.uid;
}

export { firebaseApp };
