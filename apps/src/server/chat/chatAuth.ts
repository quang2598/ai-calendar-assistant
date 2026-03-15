import { BackendChatError } from "./chatErrors";
import type { BackendAuthContext } from "./chatTypes";

export function getBackendAuthContextByUid(uid: string): BackendAuthContext {
  const normalizedUid = uid.trim();

  if (!normalizedUid) {
    throw new BackendChatError("uid is required.", "INVALID_UID", 400);
  }

  return { uid: normalizedUid };
}
