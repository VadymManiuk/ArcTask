import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uploadDirectory = process.env.ARCTASK_AGENT_IMAGE_DIR ?? path.join(process.cwd(), ".agent-worker", "uploads", "agents");
const fileNamePattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/;

export async function GET(_request: Request, context: { params: { id: string } }) {
  const fileName = context.params.id;
  if (!fileNamePattern.test(fileName)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await fs.readFile(path.join(uploadDirectory, fileName));
    const extension = fileName.slice(fileName.lastIndexOf(".") + 1);
    const contentType = extension === "png" ? "image/png" : extension === "jpg" ? "image/jpeg" : "image/webp";
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
        "Content-Length": bytes.length.toString(),
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
