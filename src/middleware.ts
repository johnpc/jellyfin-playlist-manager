import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Check for authentication token in cookies
  const authToken = request.cookies.get("jellyfin-auth-token");
  const isAuthenticated = !!authToken?.value;

  console.log({ isAuthenticated, hasToken: !!authToken });

  const isAuthPage = request.nextUrl.pathname === "/auth";

  if (!isAuthenticated && !isAuthPage) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)",
  ],
};
