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

  const payload = Array.isArray(cleanedData)
    ? { data: cleanedData }
    : cleanedData;
  const jsonBody = JSON.stringify(payload);

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
  const response = await fetch('/api/clean-data', {
    method: 'POST',
    credentials: 'same-origin',
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
