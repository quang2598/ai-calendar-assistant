import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type GoogleOAuthStatePayload = {
  uid: string;
  nonce: string;
  ts: number;
};

const DEFAULT_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function requireStateSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing required environment variable: GOOGLE_OAUTH_STATE_SECRET");
  }

  return secret;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function createNonce(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

function parseState(state: string): { payloadPart: string; signaturePart: string } {
  const [payloadPart, signaturePart] = state.split(".");

  if (!payloadPart || !signaturePart) {
    throw new Error("Invalid OAuth state format.");
  }

  return { payloadPart, signaturePart };
}

export function createSignedGoogleOAuthState(uid: string): string {
  const trimmedUid = uid.trim();
  if (!trimmedUid) {
    throw new Error("uid is required for OAuth state generation.");
  }

  const payload: GoogleOAuthStatePayload = {
    uid: trimmedUid,
    nonce: createNonce(),
    ts: Date.now(),
  };

  const payloadPart = toBase64Url(JSON.stringify(payload));
  const secret = requireStateSecret();
  const signaturePart = signPayload(payloadPart, secret);

  return `${payloadPart}.${signaturePart}`;
}

export function verifyAndDecodeGoogleOAuthState(
  state: string,
  maxAgeMs = DEFAULT_STATE_MAX_AGE_MS,
): GoogleOAuthStatePayload {
  const { payloadPart, signaturePart } = parseState(state);
  const secret = requireStateSecret();

  const expectedSignature = signPayload(payloadPart, secret);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signaturePart, "utf8");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new Error("Invalid OAuth state signature.");
  }

  let payload: GoogleOAuthStatePayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadPart)) as GoogleOAuthStatePayload;
  } catch {
    throw new Error("Invalid OAuth state payload encoding.");
  }

  if (!payload.uid?.trim()) {
    throw new Error("OAuth state payload missing uid.");
  }

  if (!payload.nonce?.trim()) {
    throw new Error("OAuth state payload missing nonce.");
  }

  if (!Number.isFinite(payload.ts)) {
    throw new Error("OAuth state payload missing timestamp.");
  }

  const ageMs = Date.now() - payload.ts;
  if (ageMs < 0 || ageMs > maxAgeMs) {
    throw new Error("OAuth state has expired.");
  }

  return payload;
}

export { DEFAULT_STATE_MAX_AGE_MS };
