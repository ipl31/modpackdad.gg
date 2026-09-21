const encoder = new TextEncoder();

function normalizedOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

export function isAllowedOrigin(origin, configuredOrigins = '') {
  const normalized = normalizedOrigin(origin);
  if (!normalized) return false;
  const allowed = new Set(configuredOrigins.split(',').map((item) => normalizedOrigin(item.trim())).filter(Boolean));
  return allowed.has(normalized);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyTwitchSignature({
  secret,
  messageId,
  timestamp,
  body,
  signature,
}) {
  if (!secret || !messageId || !timestamp || !body || !signature?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const result = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(messageId + timestamp + body),
  );
  const digest = [...new Uint8Array(result)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return constantTimeEqual(`sha256=${digest}`, signature.toLowerCase());
}

export function securityHeaders(origin = '') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  };
}
