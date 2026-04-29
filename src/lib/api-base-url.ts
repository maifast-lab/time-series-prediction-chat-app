const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, '') || '';

export const API_BASE_URL = configuredBackendUrl || 'http://localhost:3000';

export function resolveApiUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}
