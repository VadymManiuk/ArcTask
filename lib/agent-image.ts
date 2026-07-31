export const maxEmbeddedAgentImageLength = 1_500;

export function isEmbeddedAgentImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxEmbeddedAgentImageLength &&
    /^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}
