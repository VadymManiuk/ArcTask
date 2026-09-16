import https from "node:https";

// Trust is scoped to this worker connection. Never disable global TLS verification.
export function requestWorkerJson(url: URL, options: {
  method?: "GET" | "POST";
  body?: string;
  timeoutMs?: number;
  ca?: string;
} = {}): Promise<Response> {
  if (url.protocol !== "https:") return Promise.reject(new Error("Worker endpoint must use HTTPS."));
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method ?? "GET",
      ca: options.ca ?? process.env.ARCTASK_DELIVERABLE_REMOTE_CA,
      rejectUnauthorized: true,
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      headers: { "Content-Type": "application/json", ...(options.body ? { "Content-Length": Buffer.byteLength(options.body) } : {}) }
    }, response => {
      const status = response.statusCode ?? 502;
      if (status >= 300 && status < 400) {
        response.resume(); reject(new Error("Worker redirects are not allowed.")); return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) { response.destroy(new Error("Worker response exceeds 2 MiB.")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("Worker response was interrupted.")));
      response.on("end", () => {
        const headers = new Headers({ "Content-Type": "application/json" });
        const scope = response.headers["x-arctask-deployment"];
        if (typeof scope === "string") headers.set("x-arctask-deployment", scope);
        resolve(new Response(Buffer.concat(chunks).toString("utf8"), { status, headers }));
      });
    });
    request.on("error", reject);
    request.end(options.body);
  });
}
