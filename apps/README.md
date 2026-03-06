# AI Calendar Assistant Frontend

Next.js App Router UI with Redux Toolkit state management and Firebase Google auth.

## Run locally

```bash
cd apps
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Create `apps/.env` from `apps/.env.example`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Folder contract

- `app/`: route pages and layout only (UI entrypoints)
- `app/components/`: route-local presentational components
- `src/components/`: reusable presentational components
- `src/features/`: Redux slices, thunks, selectors by domain
- `src/services/`: API/SDK wrappers (Firebase, HTTP, etc.)
- `src/store.ts`: Redux store setup
- `src/provider.tsx`: React Redux provider/bootstrap
- `src/hooks.ts`: typed Redux hooks
- `src/types/`: shared domain types

## Current routes

- `/auth/login`: Google login
- `/auth/signup`: Google signup entrypoint
- `/`: protected chat layout with conversation list + history + send placeholder

## Architecture rules

- Pages/components do not call Firebase SDK directly.
- Pages/components do not call `fetch` directly for domain logic.
- Async side effects live in thunks and call `src/services/*`.
- Slices own state transitions and reducers only.
- Components read state through selectors and dispatch actions/thunks.

## Chat data flow

1. `app/page.tsx` (container) dispatches `startConversationsListener(uid)`.
2. `chatThunks.ts` calls `firestoreChatService.listenToConversations`.
3. Firestore snapshot data is normalized in service layer.
4. Thunk dispatches `conversationsReceived`.
5. `chatSlice.ts` updates Redux state.
6. UI reads via `chatSelectors.ts` and rerenders sidebar.

When a conversation is selected:

1. UI dispatches `setActiveConversation(conversationId)`.
2. UI dispatches `startMessagesListener({ uid, conversationId })`.
3. Thunk calls `firestoreChatService.listenToMessages`.
4. Thunk dispatches `messagesReceived`.
5. Panel renders message history from selectors.

Logout/auth-null path:

1. Auth listener dispatches `stopChatListeners`.
2. Auth listener dispatches `resetChat`.
3. Chat state and active subscriptions are cleaned.

## Add a new feature

1. Add domain types in `src/types`.
2. Add service methods in `src/services/<feature>`.
3. Add `slice + thunks + selectors` in `src/features/<feature>`.
4. Register reducer in `src/store.ts`.
5. Build/compose UI in `app/*` and `src/components/*`.
6. Add teardown paths for auth/logout/unmount if the feature has listeners.
7. Verify with `npm run lint` and manually test login/logout and route refresh.
