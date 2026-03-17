export class BackendChatError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "BackendChatError";
    this.code = code;
    this.status = status;
  }
}

export function toBackendChatError(error: unknown): BackendChatError {
  if (error instanceof BackendChatError) {
    return error;
  }

  if (error instanceof Error) {
    return new BackendChatError(error.message, "UNEXPECTED_ERROR", 500);
  }

  return new BackendChatError("Unexpected backend chat error.", "UNEXPECTED_ERROR", 500);
}
