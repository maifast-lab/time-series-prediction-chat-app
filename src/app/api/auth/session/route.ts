import { NextResponse } from 'next/server';

import { getServerAuthState } from '@/lib/server/auth';

export async function GET() {
  const authState = await getServerAuthState();

  return NextResponse.json({
    ok: true,
    data: authState
      ? {
          authenticated: true,
          user: authState.user,
          tokenType: authState.tokenType,
          accessTokenExpiresAt: authState.accessTokenExpiresAt,
        }
      : {
          authenticated: false,
          user: null,
          tokenType: 'Bearer',
          accessTokenExpiresAt: null,
        },
  });
}
