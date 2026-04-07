export function extractGoogleAccountId(idToken: string | null): string | null {
  if (!idToken) {
    return null;
  }

  const tokenParts = idToken.split(".");
  if (tokenParts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(tokenParts[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
