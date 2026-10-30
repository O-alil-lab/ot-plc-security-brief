import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of defence for the admin area: no session cookie, no admin page.
 * Every admin page, action and API route ALSO verifies the session itself.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasCookie = !!req.cookies.get("brief_session")?.value;
  if (pathname.startsWith("/api/admin") && !hasCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
