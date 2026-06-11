import { NextResponse } from 'next/server';

import { clearAuthCookies } from '@/lib/server/auth-cookies';

export async function POST() {
  const response = NextResponse.json({
    ok: true,
    data: {
      message: 'Logged out',
    },
  });

  clearAuthCookies(response);
  response.headers.set('Cache-Control', 'no-store');

  return response;
}
