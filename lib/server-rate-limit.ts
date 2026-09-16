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
let lastCleanup = 0;
const maximumBuckets = 10_000;

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  if (now - lastCleanup > 60_000 || buckets.size >= maximumBuckets) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    lastCleanup = now;
  }
  const key = `${options.keyPrefix}:${getClientIp(request)}`;
  if (!buckets.has(key) && buckets.size >= maximumBuckets) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": "60" } });
  }
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
