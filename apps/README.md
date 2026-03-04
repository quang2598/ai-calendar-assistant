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
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

## Folder contract

- `app/`: route pages and layout only (UI entrypoints)
- `src/components/`: reusable presentational components
- `src/features/`: Redux slices, thunks, selectors by domain
- `src/services/`: API/SDK wrappers (Firebase, HTTP, etc.)
- `src/store/`: store setup, provider, typed hooks
- `src/types/`: shared domain types

## Current routes

- `/auth/login`: Google login
- `/auth/signup`: Google signup entrypoint
- `/`: protected page (Hello World placeholder + sign out)

## Architecture rules

- Pages/components do not call Firebase SDK directly.
- Pages/components do not call `fetch` directly for domain logic.
- Async side effects live in thunks and call `src/services/*`.
- Slices own state transitions and reducers only.
- Components read state through selectors and dispatch actions/thunks.

## Add a new feature

1. Add domain types in `src/types`.
2. Add service methods in `src/services/<feature>`.
3. Add `slice + thunks + selectors` in `src/features/<feature>`.
4. Register reducer in `src/store/store.ts`.
5. Build/compose UI in `app/*` and `src/components/*`.
