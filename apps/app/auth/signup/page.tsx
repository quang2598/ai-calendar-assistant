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
    "auth/popup-closed-by-user": "Google sign-up was canceled.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };

  return errorMap[error] ?? "Could not create your account. Please try again.";
}

export default function SignupPage() {
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

  async function handleGoogleSignUp() {
    setSubmitting(true);

    try {
      await dispatch(signInWithGoogle()).unwrap();
      router.replace("/");
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
      heroTitle="Create your account and start planning conversations."
      heroDescription="Continue with Google to create your workspace in seconds."
      cardTitle="Create account"
      cardDescription="Continue with Google to get started."
      actionLabel="Continue with Google"
      actionLoadingLabel="Connecting to Google..."
      footerPrompt="Already have an account?"
      footerLinkLabel="Go to sign in"
      footerHref="/auth/login"
      onAction={handleGoogleSignUp}
      actionDisabled={isAuthenticating}
      showActionLoading={isAuthenticating && submitting}
      errorMessage={errorMessage}
    />
  );
}
