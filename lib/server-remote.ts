const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i
];

function isPrivate172(hostname: string) {
  const match = /^172\.(\d{1,3})\./.exec(hostname);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

export function isSafeRemoteBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  const hostname = url.hostname;
  if (privateHostPatterns.some((pattern) => pattern.test(hostname)) || isPrivate172(hostname)) {
    return false;
  }

  return true;
}
