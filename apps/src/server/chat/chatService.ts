import type { ChatMessageRole } from "@/src/types/chat";
import {
  AgentChatServiceError,
  requestAgentChatResponse,
} from "@/src/services/chat/agentChatService";

import { getBackendAuthContextByUid } from "./chatAuth";
import { BackendChatError, toBackendChatError } from "./chatErrors";
import type { BackendChatRequest, BackendChatResponse } from "./chatTypes";

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, unknown>;
};

type FirestoreErrorBody = {
  error?: {
    message?: unknown;
    status?: unknown;
  };
};

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

const FALLBACK_AGENT_RESPONSE_TEXT = "Something went wrong. Please try again";

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatConversationTitle(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());

  return `Conversation on ${year}${month}${day}-${hour}${minute}${second}`;
}

function normalizeServiceError(error: unknown): BackendChatError {
  return toBackendChatError(error);
}

function requireProjectId(): string {
  if (!FIREBASE_PROJECT_ID) {
    throw new BackendChatError(
      "FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID) is required.",
      "MISSING_FIREBASE_PROJECT_ID",
      500,
    );
  }

  return FIREBASE_PROJECT_ID;
}

function getFirestoreBaseUrl(): string {
  const projectId = requireProjectId();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
}

function toFirestoreTimestampValue(isoTimestamp: string) {
  return { timestampValue: isoTimestamp };
}

function toFirestoreStringValue(value: string) {
  return { stringValue: value };
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function buildAuthHeaders(idToken: string): HeadersInit {
  if (!idToken.trim()) {
    throw new BackendChatError("Missing Firebase ID token.", "UNAUTHORIZED", 401);
  }

  return {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };
}

async function parseErrorResponse(response: Response): Promise<BackendChatError> {
  let body: FirestoreErrorBody | null = null;

  try {
    body = (await response.json()) as FirestoreErrorBody;
  } catch {
    body = null;
  }

  const code =
    typeof body?.error?.status === "string" ? body.error.status : "FIRESTORE_REQUEST_FAILED";
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message
      : `Firestore request failed with status ${response.status}.`;

  return new BackendChatError(message, code, response.status);
}

function extractDocumentId(documentName: string | undefined): string {
  if (!documentName) {
    throw new BackendChatError(
      "Firestore response is missing document name.",
      "INVALID_FIRESTORE_RESPONSE",
      502,
    );
  }

  const parts = documentName.split("/");
  const id = parts[parts.length - 1];
  if (!id) {
    throw new BackendChatError(
      "Firestore response has invalid document name.",
      "INVALID_FIRESTORE_RESPONSE",
      502,
    );
  }

  return id;
}

async function firestoreGetDocument(params: {
  idToken: string;
  path: string;
}): Promise<FirestoreDocument> {
  const response = await fetch(`${getFirestoreBaseUrl()}/documents/${params.path}`, {
    method: "GET",
    headers: buildAuthHeaders(params.idToken),
    cache: "no-store",
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as FirestoreDocument;
}

async function firestoreCreateDocument(params: {
  idToken: string;
  path: string;
  fields: Record<string, unknown>;
}): Promise<FirestoreDocument> {
  const response = await fetch(`${getFirestoreBaseUrl()}/documents/${params.path}`, {
    method: "POST",
    headers: buildAuthHeaders(params.idToken),
    cache: "no-store",
    body: JSON.stringify({ fields: params.fields }),
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as FirestoreDocument;
}

async function firestorePatchDocument(params: {
  idToken: string;
  path: string;
  fields: Record<string, unknown>;
  updateMaskFieldPaths: string[];
}): Promise<FirestoreDocument> {
  const updateMask = params.updateMaskFieldPaths
    .map((fieldPath) => `updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`)
    .join("&");
  const url = `${getFirestoreBaseUrl()}/documents/${params.path}?${updateMask}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: buildAuthHeaders(params.idToken),
    cache: "no-store",
    body: JSON.stringify({ fields: params.fields }),
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as FirestoreDocument;
}

async function ensureConversation(params: {
  uid: string;
  conversationId: string | null;
  idToken: string;
}): Promise<string> {
  const { uid, conversationId, idToken } = params;
  const userPath = `users/${encodePathSegment(uid)}/conversations`;

  if (!conversationId) {
    const now = new Date().toISOString();
    const created = await firestoreCreateDocument({
      idToken,
      path: userPath,
      fields: {
        createdAt: toFirestoreTimestampValue(now),
        lastUpdated: toFirestoreTimestampValue(now),
        title: toFirestoreStringValue(formatConversationTitle()),
      },
    });

    return extractDocumentId(created.name);
  }

  const conversationPath = `${userPath}/${encodePathSegment(conversationId)}`;
  await firestoreGetDocument({
    idToken,
    path: conversationPath,
  });

  return conversationId;
}

async function saveMessage(params: {
  uid: string;
  conversationId: string;
  role: ChatMessageRole;
  text: string;
  idToken: string;
}): Promise<string> {
  const { uid, conversationId, role, text, idToken } = params;
  const now = new Date().toISOString();

  const messagePath =
    `users/${encodePathSegment(uid)}/conversations/${encodePathSegment(conversationId)}/messages`;

  const created = await firestoreCreateDocument({
    idToken,
    path: messagePath,
    fields: {
      createdAt: toFirestoreTimestampValue(now),
      role: toFirestoreStringValue(role),
      text: toFirestoreStringValue(text),
    },
  });

  const conversationPath =
    `users/${encodePathSegment(uid)}/conversations/${encodePathSegment(conversationId)}`;

  await firestorePatchDocument({
    idToken,
    path: conversationPath,
    fields: {
      lastUpdated: toFirestoreTimestampValue(now),
    },
    updateMaskFieldPaths: ["lastUpdated"],
  });

  return extractDocumentId(created.name);
}

async function resolveAgentResponseText(params: {
  uid: string;
  conversationId: string;
  message: string;
}): Promise<string> {
  try {
    const agentResponse = await requestAgentChatResponse(params);
    return agentResponse.responseMessage.text;
  } catch (error) {
    if (error instanceof AgentChatServiceError) {
      return FALLBACK_AGENT_RESPONSE_TEXT;
    }

    throw error;
  }
}

export async function processBackendChatRequest(
  request: BackendChatRequest,
  idToken: string,
): Promise<BackendChatResponse> {
  try {
    const auth = getBackendAuthContextByUid(request.uid);
    const text = request.message.trim();

    if (!text) {
      throw new BackendChatError("message is required.", "INVALID_MESSAGE", 400);
    }

    const conversationId = await ensureConversation({
      uid: auth.uid,
      conversationId: request.conversationId,
      idToken,
    });

    await saveMessage({
      uid: auth.uid,
      conversationId,
      role: "user",
      text,
      idToken,
    });

    const responseText = await resolveAgentResponseText({
      uid: auth.uid,
      conversationId,
      message: text,
    });

    const responseMessageId = await saveMessage({
      uid: auth.uid,
      conversationId,
      role: "system",
      text: responseText,
      idToken,
    });

    return {
      conversationId,
      responseMessage: {
        id: responseMessageId,
        role: "system",
        text: responseText,
      },
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}
