import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/invent(.*)",
  "/dashboard(.*)",
  "/jobs(.*)",
  "/parts(.*)",
  "/admin(.*)",
]);

// API routes that support admin bypass key — skip Clerk auth when the key is present
const isAdminBypassableRoute = createRouteMatcher([
  "/api/invent(.*)",
  "/api/intake/(.*)",
]);

export default clerkMiddleware((auth, req) => {
  // Allow admin bypass key to skip Clerk auth on bypassable API routes
  if (isAdminBypassableRoute(req)) {
    const bypassKey = req.headers.get("x-admin-bypass-key");
    const adminKey = process.env.ADMIN_BYPASS_KEY;
    if (adminKey && bypassKey === adminKey) {
      // Valid admin bypass — let the request through without Clerk auth
      return NextResponse.next();
    }
  }

  if (isProtectedRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json, icons, images
     * - /little-engineer (public gateway page)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
