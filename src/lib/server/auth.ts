import 'server-only';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

import { UnauthorizedError } from './errors';

export async function getCurrentUserDbId() {
  const session = await getServerSession(authOptions);
  return session?.user?.dbId ?? null;
}

export async function requireCurrentUserDbId() {
  const userId = await getCurrentUserDbId();

  if (!userId) {
    throw new UnauthorizedError();
  }

  return userId;
}
