import { maxEmbeddedAgentImageLength } from "@/lib/agent-image";

const outputAttempts = [
  { size: 96, quality: 0.78 },
  { size: 80, quality: 0.7 },
  { size: 64, quality: 0.62 },
  { size: 56, quality: 0.55 },
  { size: 48, quality: 0.48 }
] as const;

export async function createEmbeddedAgentImage(file: File) {
  const image = await loadImage(file);
  try {
    for (const attempt of outputAttempts) {
      const dataUrl = renderSquareImage(image, attempt.size, attempt.quality);
      if (dataUrl.length <= maxEmbeddedAgentImageLength) {
        return dataUrl;
      }
    }
  } finally {
    URL.revokeObjectURL(image.src);
  }

  throw new Error("This image could not be optimized for onchain metadata. Choose a simpler image.");
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error("Unable to read this image."));
    };
    image.src = URL.createObjectURL(file);
  });
}

function renderSquareImage(image: HTMLImageElement, size: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not supported by this browser.");
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) {
    return webp;
  }

  return canvas.toDataURL("image/jpeg", quality);
}
