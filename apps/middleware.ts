import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN = "chrome-extension://jgnbhhkoeedfncdgeimnpnimlfnfpfcj";

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    if (origin === ALLOWED_ORIGIN) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    return new NextResponse(null, { status: 403 });
  }

  // Handle actual requests
  const response = NextResponse.next();
  if (origin === ALLOWED_ORIGIN) {
    response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
