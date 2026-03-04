import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  listenToAuthChanges,
  normalizeFirebaseAuthError,
  signInWithGooglePopup,
  signOutFromFirebase,
} from "@/src/services/auth/firebaseAuthService";
import type { AuthUser } from "@/src/types/auth";

import { authChanged, authError, logoutLocal } from "./authSlice";

let hasAttachedAuthListener = false;
let authListenerUnsubscribe: (() => void) | null = null;

export const startAuthListener = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>(
  "auth/startAuthListener",
  async (_, { dispatch, rejectWithValue }) => {
    if (hasAttachedAuthListener) {
      return;
    }

    try {
      authListenerUnsubscribe = listenToAuthChanges(
        (user) => {
          dispatch(authChanged(user));
        },
        (error) => {
          dispatch(authError(normalizeFirebaseAuthError(error)));
          dispatch(authChanged(null));
        },
      );
      hasAttachedAuthListener = true;
    } catch (error) {
      hasAttachedAuthListener = false;
      authListenerUnsubscribe = null;

      const message = normalizeFirebaseAuthError(error);
      dispatch(authError(message));
      dispatch(authChanged(null));
      return rejectWithValue(message);
    }
  },
);

export const signInWithGoogle = createAsyncThunk<
  AuthUser,
  void,
  { rejectValue: string }
>("auth/signInWithGoogle", async (_, { rejectWithValue }) => {
  try {
    const nextUser = await signInWithGooglePopup();

    if (!nextUser) {
      return rejectWithValue("Could not read Google user.");
    }

    return nextUser;
  } catch (error) {
    return rejectWithValue(normalizeFirebaseAuthError(error));
  }
});

export const signOutUser = createAsyncThunk<void, void, { rejectValue: string }>(
  "auth/signOutUser",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      await signOutFromFirebase();
      dispatch(logoutLocal());
    } catch (error) {
      return rejectWithValue(normalizeFirebaseAuthError(error));
    }
  },
);

export function stopAuthListener() {
  if (!authListenerUnsubscribe) {
    return;
  }

  authListenerUnsubscribe();
  authListenerUnsubscribe = null;
  hasAttachedAuthListener = false;
}
