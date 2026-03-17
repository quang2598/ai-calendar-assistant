import type { RootState } from "@/src/store";

export const selectAuthInitialized = (state: RootState) => state.auth.initialized;
export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectAuthUser = (state: RootState) => state.auth.user;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectIsAuthenticated = (state: RootState) =>
  state.auth.status === "authenticated";
