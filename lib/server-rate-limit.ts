import { NextResponse } from "next/server";

type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${options.keyPrefix}:${getClientIp(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs
    });
    return null;
  }

  current.count += 1;
  if (current.count <= options.limit) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Too many requests. Try again shortly."
    },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(1, Math.ceil((current.resetAt - now) / 1000)).toString()
      }
    }
  );
}
