const PYTHON_API_BASE_URL =
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL?.trim() ||
  'http://127.0.0.1:8000/api/';

interface CleanDataResponse {
  cleanedData?: unknown;
  cleaned_data?: unknown;
  data?: unknown;
  message?: string;
  error?: string;
  detail?: string;
}

interface DataSourceRequest {
  body: BodyInit;
  headers?: HeadersInit;
}

function resolvePythonApiUrl(path: string) {
  const normalizedBase = PYTHON_API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  return new URL(normalizedPath, `${normalizedBase}/`).toString();
}

export function createDataSourceRequest(cleanedData: unknown): DataSourceRequest {
  if (cleanedData instanceof FormData || cleanedData instanceof Blob) {
    return {
      body: cleanedData,
    };
  }

  if (typeof cleanedData === 'string') {
    return {
      body: cleanedData,
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const jsonBody = JSON.stringify(cleanedData);

  if (jsonBody === undefined) {
    throw new Error('Data conversion failed: cleaned data is not serializable.');
  }

  return {
    body: jsonBody,
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

export async function cleanUploadedData(formData: FormData) {
  const response = await fetch(resolvePythonApiUrl('v1/clean_data'), {
    method: 'POST',
    body: formData,
  });
  const result = (await response.json().catch(() => null)) as
    | CleanDataResponse
    | null;

  if (!response.ok) {
    const message = result?.detail ||
      result?.error ||
      result?.message ||
      response.statusText ||
      'Request failed';
    throw new Error(`Data conversion failed: ${message}`);
  }

  const cleanedData =
    result?.cleanedData ?? result?.cleaned_data ?? result?.data;

  if (cleanedData === undefined || cleanedData === null) {
    throw new Error(
      'Data conversion failed: cleaned data missing in response.',
    );
  }

  return cleanedData;
}
