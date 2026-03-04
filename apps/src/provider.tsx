"use client";

import { useEffect, type ReactNode } from "react";
import { Provider } from "react-redux";

import { startAuthListener } from "@/src/features/auth/authThunks";

import { useAppDispatch } from "./hooks";
import { store } from "./store";

type ReduxProviderProps = {
  children: ReactNode;
};

function AuthListenerBootstrapper() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(startAuthListener());
  }, [dispatch]);

  return null;
}

export default function ReduxProvider({ children }: ReduxProviderProps) {
  return (
    <Provider store={store}>
      <AuthListenerBootstrapper />
      {children}
    </Provider>
  );
}
