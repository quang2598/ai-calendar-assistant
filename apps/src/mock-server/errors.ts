export class MockServerError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "MockServerError";
    this.code = code;
    this.status = status;
  }
}

export function toMockServerError(error: unknown): MockServerError {
  if (error instanceof MockServerError) {
    return error;
  }

  if (error instanceof Error) {
    return new MockServerError(error.message, "UNEXPECTED_ERROR", 500);
  }

  return new MockServerError("Unexpected mock server error.", "UNEXPECTED_ERROR", 500);
}
