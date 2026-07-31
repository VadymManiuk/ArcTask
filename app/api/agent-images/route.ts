import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/server-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxImageBytes = 1024 * 1024;
const uploadDirectory = process.env.ARCTASK_AGENT_IMAGE_DIR ?? path.join(process.cwd(), ".agent-worker", "uploads", "agents");

function detectImageType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

export async function POST(request: Request) {
  const rateLimitResponse = rateLimit(request, { keyPrefix: "agent-image-upload", limit: 8, windowMs: 60 * 60_000 });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Select an image file." }, { status: 400 });
    }

    if (image.size === 0 || image.size > maxImageBytes) {
      return NextResponse.json({ error: "Image must be between 1 byte and 1 MB." }, { status: 400 });
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const imageType = detectImageType(bytes);
    if (!imageType) {
      return NextResponse.json({ error: "Only valid PNG, JPEG, or WebP images are supported." }, { status: 400 });
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    const fileName = `${digest}.${imageType.extension}`;
    await fs.mkdir(uploadDirectory, { recursive: true });
    try {
      await fs.writeFile(path.join(uploadDirectory, fileName), bytes, { flag: "wx", mode: 0o644 });
    } catch (caught) {
      const code = caught && typeof caught === "object" && "code" in caught ? caught.code : undefined;
      if (code !== "EEXIST") throw caught;
    }

    return NextResponse.json({
      ok: true,
      url: `/api/agent-images/${fileName}`,
      mimeType: imageType.mimeType
    });
  } catch {
    return NextResponse.json({ error: "Unable to upload the agent image." }, { status: 500 });
  }
}
