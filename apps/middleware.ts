import { NextRequest, NextResponse } from "next/server";

const EXTENSION_ORIGINS_ENV = "CHROME_EXTENSION_ORIGINS";
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;
const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, X-OAuth-Mode, X-Stream";
const MAX_AGE_SECONDS = "86400";

function getConfiguredExtensionOrigins(): Set<string> {
  const rawValue = process.env[EXTENSION_ORIGINS_ENV] ?? "";

  return new Set(
    rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAllowedExtensionOrigin(origin: string | null): origin is string {
  if (!origin) {
    return false;
  }

  const configuredOrigins = getConfiguredExtensionOrigins();
  if (configuredOrigins.has(origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    return EXTENSION_ORIGIN_PATTERN.test(origin);
  }

  return false;
}

function applyCorsHeaders(response: NextResponse, origin: string): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  response.headers.set("Access-Control-Max-Age", MAX_AGE_SECONDS);
  response.headers.set("Vary", "Origin");

  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  const isAllowedOrigin = isAllowedExtensionOrigin(origin);

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin || !origin) {
      return new NextResponse(null, { status: 403 });
    }

    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  const response = NextResponse.next();

  if (isAllowedOrigin && origin) {
    applyCorsHeaders(response, origin);
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
