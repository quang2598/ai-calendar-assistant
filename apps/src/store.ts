import { combineReducers, configureStore } from "@reduxjs/toolkit";

import authReducer from "@/src/features/auth/authSlice";

const rootReducer = combineReducers({
  auth: authReducer,
});

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
