"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong. Please try again.";
  }

  const errorMap: Record<string, string> = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/popup-closed-by-user": "Google sign-up was canceled.",
  };

  return errorMap[error.code] ?? "Could not create your account.";
}

export default function SignUpPage() {
  const router = useRouter();
  const { user, loading, signUpWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, router, user]);

  async function handleEmailSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await signUpWithEmail(email.trim(), password);
      router.replace("/");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignUp() {
    setErrorMessage("");
    setIsGoogleLoading(true);

    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsGoogleLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 p-6 md:grid-cols-2 md:gap-6 md:p-10">
        <section className="hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-10 md:flex md:flex-col md:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-cyan-300">
              AI Calendar Assistant
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight">
              Create your account and start planning conversations.
            </h1>
            <p className="mt-4 max-w-md text-slate-400">
              Build your own workspace with secure authentication and a focused
              chat-first UI.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Ready in under a minute with Firebase Authentication.
          </p>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-slate-950/60 backdrop-blur">
            <h2 className="text-2xl font-semibold">Create account</h2>
            <p className="mt-2 text-sm text-slate-400">
              Sign up to access your assistant workspace.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleEmailSignUp}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="Choose a password"
                />
              </div>

              {errorMessage ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Or
              </span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={isSubmitting || isGoogleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGoogleLoading
                ? "Connecting to Google..."
                : "Continue with Google"}
            </button>

            <p className="mt-6 text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link
                href="/signin"
                className="font-medium text-cyan-300 transition hover:text-cyan-200"
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
