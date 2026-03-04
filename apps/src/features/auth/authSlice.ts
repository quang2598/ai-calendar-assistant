import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AuthState, AuthUser } from "@/src/types/auth";

import { signInWithGoogle, signOutUser, startAuthListener } from "./authThunks";

const initialState: AuthState = {
  initialized: false,
  status: "anonymous",
  user: null,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authChanged(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? "authenticated" : "anonymous";
      state.error = null;
      state.initialized = true;
    },
    authError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    logoutLocal(state) {
      state.user = null;
      state.status = "anonymous";
      state.error = null;
      state.initialized = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startAuthListener.pending, (state) => {
        if (!state.initialized) {
          state.status = "authenticating";
        }
      })
      .addCase(startAuthListener.rejected, (state, action) => {
        state.status = "anonymous";
        state.error = action.payload ?? "Failed to initialize authentication.";
        state.initialized = true;
      })
      .addCase(signInWithGoogle.pending, (state) => {
        state.status = "authenticating";
        state.error = null;
      })
      .addCase(signInWithGoogle.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "authenticated";
        state.error = null;
        state.initialized = true;
      })
      .addCase(signInWithGoogle.rejected, (state, action) => {
        state.status = "anonymous";
        state.error = action.payload ?? "Failed to sign in with Google.";
        state.initialized = true;
      })
      .addCase(signOutUser.pending, (state) => {
        state.status = "authenticating";
        state.error = null;
      })
      .addCase(signOutUser.fulfilled, (state) => {
        state.user = null;
        state.status = "anonymous";
        state.error = null;
        state.initialized = true;
      })
      .addCase(signOutUser.rejected, (state, action) => {
        state.status = state.user ? "authenticated" : "anonymous";
        state.error = action.payload ?? "Failed to sign out.";
      });
  },
});

export const { authChanged, authError, logoutLocal } = authSlice.actions;

export default authSlice.reducer;
