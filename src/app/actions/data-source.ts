'use server';

import { logger } from '@/lib/logger';
import { uploadDataSourceForCurrentUser } from '@/lib/server/data-source';
import { getActionErrorMessage } from '@/lib/server/errors';

export async function uploadDataSourceAction(formData: FormData) {
  try {
    const result = await uploadDataSourceForCurrentUser(formData);
    return { ok: true as const, data: result };
  } catch (error) {
    logger.error('Upload data source action failed', error);
    return {
      ok: false as const,
      error: getActionErrorMessage(error, 'Server Error'),
    };
  }
}
