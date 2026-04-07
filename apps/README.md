# AI Calendar Assistant

Next.js App Router full-stack application with Redux Toolkit on the client, backend route handlers in `app/api`, and server-only domain logic in `src/server`.

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
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
GOOGLE_OAUTH_STATE_SECRET=
CHROME_EXTENSION_ORIGINS=chrome-extension://<your-extension-id>
AGENT_CHAT_URL=http://localhost:8082/agent/send-chat
```

## Folder contract

- `app/`: App Router pages, layouts, and API route handlers
- `src/features/`: client-side Redux slices, selectors, and thunks
- `src/services/`: client/shared service adapters and SDK wrappers
- `src/server/`: server-only backend business logic
- `src/lib/`: SDK/bootstrap modules for Firebase client and Firebase Admin
- `src/types/`: shared domain types
- `src/store.ts`: Redux store setup
- `src/provider.tsx`: React Redux provider/bootstrap
- `src/hooks.ts`: typed Redux hooks

## Current routes

- `/auth/login`: Google login
- `/auth/signup`: Google signup entrypoint
- `/`: protected chat layout with conversation list + history
- `/api/backend/chat`: backend chat endpoint

## Architecture rules

- Pages/components do not call Firebase SDK directly.
- Pages/components do not call `fetch` directly for domain logic.
- Async side effects live in thunks and call `src/services/*`.
- Slices own state transitions and reducers only.
- Components read state through selectors and dispatch actions/thunks.
- API route handlers are thin HTTP boundaries only.
- Backend business logic lives in `src/server/*`, not inside route files.

## Chat data flow

1. `app/page.tsx` (container) dispatches `startConversationsListener()`.
2. `chatThunks.ts` calls `firestoreChatService.listenToConversations`.
3. Firestore snapshot data is normalized in service layer.
4. Thunk dispatches `conversationsReceived`.
5. `chatSlice.ts` updates Redux state.
6. UI reads via `chatSelectors.ts` and rerenders sidebar.

When a conversation is selected:

1. UI dispatches `setActiveConversation(conversationId)`.
2. UI dispatches `startMessagesListener({ conversationId })`.
3. Thunk calls `firestoreChatService.listenToMessages`.
4. Thunk dispatches `messagesReceived`.
5. Panel renders message history from selectors.

Logout/auth-null path:

1. Auth listener dispatches `stopChatListeners`.
2. Auth listener dispatches `resetChat`.
3. Chat state and active subscriptions are cleaned.

Message send path:

1. `app/page.tsx` dispatches `sendComposerMessage`.
2. `chatThunks.ts` calls `chatApiService.sendMessageToServer`.
3. Browser calls `POST /api/backend/chat` with Firebase ID token.
4. `/api/backend/chat` verifies the Firebase ID token and derives trusted `uid` server-side.
5. `/api/backend/chat` delegates to `src/server/chat/chatService.ts`.
6. Server chat service persists the user message, calls the external agent, persists the system reply, and returns the result.

## Google Calendar OAuth flow

- Frontend button calls `POST /api/integrations/google-calendar/connect` with Firebase ID token.
- Backend verifies Firebase ID token using Firebase Admin and extracts `uid`.
- Backend builds Google OAuth URL with signed state (`uid`, nonce, timestamp).
- User grants consent on Google OAuth screen.
- Google redirects to `/api/integrations/google-calendar/callback` with `code` and `state`.
- Backend verifies state signature and age, exchanges code for tokens, and persists tokens to:
  - `/users/{uid}/tokens/google`
- Refresh token is stored server-side only. Client never reads or stores refresh token.

## External agent endpoint

- Backend chat orchestration calls the external agent through `AGENT_CHAT_URL`.
- Local default:
  - `http://localhost:8082/agent/send-chat`
- Keep this server-only. UI components and pages should continue talking only to this app's own routes.

## Firestore rules for token protection

Apply these rules in Firebase Console so browser clients cannot read/write token docs:

```rules
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /tokens/{tokenId} {
        allow read, write: if false;
      }

      match /conversations/{conversationId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;

        match /messages/{messageId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
```

Important: remove any previous recursive wildcard rule like
`match /users/{userId}/{document=**}` because that would expose `/tokens/*` to clients.

## Integration verification checklist

1. Click `Connect Google Calendar` in sidebar.
2. Complete Google consent and return to app.
3. Confirm doc exists at `/users/{uid}/tokens/google` with metadata and refresh token.
4. Confirm browser client cannot read `/users/{uid}/tokens/google` (permission denied).
5. Confirm chat features still work after OAuth setup.

## Add a new feature

1. Add domain types in `src/types`.
2. Add service methods in `src/services/<feature>`.
3. Add `slice + thunks + selectors` in `src/features/<feature>`.
4. Register reducer in `src/store.ts`.
5. Build/compose UI in `app/*` and `src/components/*`.
6. Add teardown paths for auth/logout/unmount if the feature has listeners.
7. Verify with `npm run lint` and manually test login/logout and route refresh.
