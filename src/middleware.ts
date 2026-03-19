import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Temporarily disabled for Vercel debugging.
  // Returning NextResponse.next() so middleware does not block routes.
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|asiteamlinklogo.png|companylogo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
