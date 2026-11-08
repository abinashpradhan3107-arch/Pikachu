export class ApiClientError extends Error {
  status: number;
  details?: unknown;
  code?: string;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

type ApiErrorBody = {
  error?: string;
  message?: string;
  details?: unknown;
  code?: string;
};

export async function apiFetch<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorBody;
    const message =
      body.error ||
      body.message ||
      (response.status === 401
        ? "Your session expired. Please sign in again."
        : `Request failed (${response.status}).`);
    throw new ApiClientError(message, response.status, body.details, body.code);
  }

  return payload as T;
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function patchJson<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteJson<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "DELETE" });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
