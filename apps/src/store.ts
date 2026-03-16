import { combineReducers, configureStore } from "@reduxjs/toolkit";

import authReducer from "@/src/features/auth/authSlice";
import chatReducer from "@/src/features/chat/chatSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  chat: chatReducer,
});

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
