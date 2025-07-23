import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Check for authentication token in cookies
  const authToken = request.cookies.get("jellyfin-auth-token");
  const isAuthenticated = !!authToken?.value;

  console.log({ 
    isAuthenticated, 
    hasToken: !!authToken, 
    pathname: request.nextUrl.pathname 
  });

  const isAuthPage = request.nextUrl.pathname === "/auth";
  const isPlaylistPage = request.nextUrl.pathname.startsWith("/playlist/");

  // If user is authenticated and trying to access auth page, redirect to home
  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // For playlist pages, allow access even if not authenticated via cookie
  // The client-side auth check will handle the redirect if needed
  // This prevents breaking deep links when the Zustand store hasn't hydrated yet
  if (isPlaylistPage) {
    console.log("Allowing access to playlist page for client-side auth check");
    return NextResponse.next();
  }

  // For other protected pages, redirect to auth if not authenticated
  if (!isAuthenticated && !isAuthPage) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)",
  ],
};
