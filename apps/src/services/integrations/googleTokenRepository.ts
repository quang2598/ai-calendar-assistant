import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/src/lib/firebaseAdmin";

export type PersistGoogleTokenParams = {
  uid: string;
  refreshToken: string | null;
  grantedScopes: string[];
  googleAccountId?: string | null;
};

export type PersistGoogleTokenResult = {
  usedExistingRefreshToken: boolean;
  refreshTokenStored: boolean;
};

export class GoogleTokenRepositoryError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "GoogleTokenRepositoryError";
    this.code = code;
  }
}

function normalizeScopes(scopes: string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

function sanitizeUid(uid: string): string {
  const normalized = uid.trim();
  if (!normalized) {
    throw new GoogleTokenRepositoryError("uid is required.", "INVALID_UID");
  }

  return normalized;
}

function hasStoredRefreshToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function persistGoogleCalendarTokens(
  params: PersistGoogleTokenParams,
): Promise<PersistGoogleTokenResult> {
  const uid = sanitizeUid(params.uid);
  const tokenRef = adminDb.doc(`users/${uid}/tokens/google`);
  const snapshot = await tokenRef.get();

  const grantedScopes = normalizeScopes(params.grantedScopes);
  const refreshToken = params.refreshToken?.trim() ?? null;
  const existingRefreshToken = snapshot.get("refreshToken");

  const baseMetadata = {
    grantedScopes,
    googleAccountId: params.googleAccountId ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    lastConsentAt: FieldValue.serverTimestamp(),
    provider: "google",
  };

  if (refreshToken) {
    await tokenRef.set(
      {
        ...baseMetadata,
        refreshToken,
        connectedAt: snapshot.exists
          ? snapshot.get("connectedAt") ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      usedExistingRefreshToken: false,
      refreshTokenStored: true,
    };
  }

  if (hasStoredRefreshToken(existingRefreshToken)) {
    await tokenRef.set(baseMetadata, { merge: true });

    return {
      usedExistingRefreshToken: true,
      refreshTokenStored: false,
    };
  }

  throw new GoogleTokenRepositoryError(
    "Google did not return a refresh token and no existing token is stored.",
    "MISSING_REFRESH_TOKEN",
  );
}
