import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/auth";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(415, "Expected a JSON request body.");
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body.");
  }
}

export async function requireApiUser(request?: Request): Promise<AuthContext> {
  if (request && isMutating(request.method)) {
    assertSameOrigin(request);
  }
  const context = await getAuthContext();
  if (!context) throw new ApiError(401, "Please sign in to continue.");
  return context;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  try {
    const originUrl = new URL(origin);
    if (!host || originUrl.host !== host) {
      throw new ApiError(403, "Cross-origin request blocked.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, "Invalid request origin.");
  }
}

function isMutating(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export async function handleRoute<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.status, error.message, error.details);
    }
    if (error instanceof ZodError) {
      return fail(422, "Please check the highlighted fields.", error.flatten());
    }
    console.error("[api]", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    const safeMessage =
      /api key|unauthorized|forbidden|quota|rate limit/i.test(message)
        ? message
        : "Something went wrong while processing that request.";
    return fail(500, safeMessage);
  }
}

type Bucket = { count: number; resetAt: number };

const globalRate = globalThis as typeof globalThis & {
  __cortexRateBuckets?: Map<string, Bucket>;
};

const buckets = (globalRate.__cortexRateBuckets ??= new Map<string, Bucket>());

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) {
    const seconds = Math.ceil((existing.resetAt - now) / 1000);
    throw new ApiError(
      429,
      `Too many requests. Please wait ${seconds} second${seconds === 1 ? "" : "s"}.`,
    );
  }
}
