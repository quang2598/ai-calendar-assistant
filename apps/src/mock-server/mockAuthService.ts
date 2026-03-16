import { MockServerError } from "./errors";
import type { MockAuthContext } from "./types";

export function getAuthContextByUid(uid: string): MockAuthContext {
  const normalizedUid = uid.trim();

  if (!normalizedUid) {
    throw new MockServerError("uid is required.", "INVALID_UID", 400);
  }

  return { uid: normalizedUid };
}
