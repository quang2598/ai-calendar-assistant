export type AuthStatus = "anonymous" | "authenticating" | "authenticated";

export type AuthUser = {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export type AuthState = {
  initialized: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
};
