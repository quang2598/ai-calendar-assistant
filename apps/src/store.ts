import { combineReducers, configureStore } from "@reduxjs/toolkit";

import authReducer from "@/src/features/auth/authSlice";
import calendarReducer from "@/src/features/calendar/calendarSlice";
import chatReducer from "@/src/features/chat/chatSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  calendar: calendarReducer,
  chat: chatReducer,
});

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
