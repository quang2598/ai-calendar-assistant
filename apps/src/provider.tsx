"use client";

import { useEffect, type ReactNode } from "react";
import { Provider } from "react-redux";

import { startAuthListener, stopAuthListener } from "@/src/features/auth/authThunks";
import { useCalendarRealtimeSync } from "@/src/hooks/useCalendarRealtimeSync";

import { useAppDispatch } from "./hooks";
import { store } from "./store";

type ReduxProviderProps = {
  children: ReactNode;
};

function AuthListenerBootstrapper() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(startAuthListener());

    return () => {
      stopAuthListener();
    };
  }, [dispatch]);

  return null;
}

function CalendarRealtimeSyncBootstrapper() {
  useCalendarRealtimeSync();
  return null;
}

export default function ReduxProvider({ children }: ReduxProviderProps) {
  return (
    <Provider store={store}>
      <AuthListenerBootstrapper />
      <CalendarRealtimeSyncBootstrapper />
      {children}
    </Provider>
  );
}
