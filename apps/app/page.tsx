"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import ChatPlaceholder from "@/src/components/chat/ChatPlaceholder";
import {
  selectAuthInitialized,
  selectAuthStatus,
  selectAuthUser,
  selectIsAuthenticated,
} from "@/src/features/auth/authSelectors";
import { signOutUser } from "@/src/features/auth/authThunks";
import { useAppDispatch, useAppSelector } from "@/src/hooks";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
    </div>
  );
}

export default function HomePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const initialized = useAppSelector(selectAuthInitialized);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectAuthUser);

  useEffect(() => {
    if (initialized && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [initialized, isAuthenticated, router]);

  async function handleSignOut() {
    await dispatch(signOutUser());
    router.replace("/auth/login");
  }

  if (!initialized) {
    return <FullScreenSpinner />;
  }

  if (!isAuthenticated || !user) {
    return <FullScreenSpinner />;
  }

  const userLabel = user.displayName ?? user.email ?? "Signed-in user";

  return (
    <ChatPlaceholder
      userLabel={userLabel}
      onSignOut={handleSignOut}
      isSigningOut={status === "authenticating"}
    />
  );
}
