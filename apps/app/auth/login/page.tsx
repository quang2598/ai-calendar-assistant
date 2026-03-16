"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthScreen from "@/app/auth/AuthScreen";
import {
  selectAuthError,
  selectAuthInitialized,
  selectAuthStatus,
  selectIsAuthenticated,
} from "@/src/features/auth/authSelectors";
import { signInWithGoogle } from "@/src/features/auth/authThunks";
import { useAppDispatch, useAppSelector } from "@/src/hooks";

function getAuthErrorMessage(error: string | null) {
  if (!error) {
    return "";
  }

  const errorMap: Record<string, string> = {
    "auth/popup-closed-by-user": "Google sign-in was canceled.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/invalid-credential":
      "Google sign-in failed due to invalid credentials configuration. Check Firebase Google auth setup.",
  };

  return errorMap[error] ?? "Could not sign in. Please try again.";
}

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const initialized = useAppSelector(selectAuthInitialized);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  const [submitting, setSubmitting] = useState(false);

  const errorMessage = useMemo(() => getAuthErrorMessage(error), [error]);

  useEffect(() => {
    if (initialized && isAuthenticated) {
      router.replace("/");
    }
  }, [initialized, isAuthenticated, router]);

  async function handleGoogleSignIn() {
    setSubmitting(true);

    try {
      await dispatch(signInWithGoogle()).unwrap();
      router.replace("/");
    } catch {
    } finally {
      setSubmitting(false);
    }
  }

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
      </div>
    );
  }

  const isAuthenticating = status === "authenticating";

  return (
    <AuthScreen
      badgeText="AI Calendar Assistant"
      heroTitle="Plan smarter with a secure personal chat workspace."
      heroDescription="Continue with Google to access your workspace."
      cardTitle="Sign in"
      cardDescription="Continue with Google to enter your workspace."
      actionLabel="Continue with Google"
      actionLoadingLabel="Connecting to Google..."
      footerPrompt="First time here?"
      footerLinkLabel="Go to sign up"
      footerHref="/auth/signup"
      onAction={handleGoogleSignIn}
      actionDisabled={isAuthenticating}
      showActionLoading={isAuthenticating && submitting}
      errorMessage={errorMessage}
    />
  );
}
