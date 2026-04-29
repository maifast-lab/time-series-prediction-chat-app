export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: string;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;
