import { LiveRoom } from './live-room.js';
import { isAllowedOrigin, securityHeaders, verifyTwitchSignature } from './security.js';

const TWITCH_MAX_AGE_MS = 10 * 60 * 1_000;
const MAX_TWITCH_WEBHOOK_BYTES = 256 * 1_024;
const MAX_TELEMETRY_BYTES = 4_096;
const TWITCH_CHAT_EVENT_TYPES = new Set([
  'channel.chat.message',
  'channel.chat.message_delete',
  'channel.chat.clear_user_messages',
  'channel.chat.clear',
]);

async function readBoundedBody(request, maxBytes) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new RangeError('Payload too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError('Payload too large');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

function addSecurityHeaders(response, origin = '') {
  const output = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders(origin))) {
    if (value) output.headers.set(name, value);
  }
  return output;
}

function roomStub(env) {
  const id = env.LIVE_ROOM.idFromName('modpackdad');
  return env.LIVE_ROOM.get(id);
}

function requestOrigin(request) {
  return request.headers.get('origin') || '';
}

function hasAllowedOrigin(request, env) {
  return isAllowedOrigin(requestOrigin(request), env.ALLOWED_ORIGINS);
}

function validateTwitchSubscription(payload, env) {
  if (!env.TWITCH_BROADCASTER_USER_ID || !env.TWITCH_BOT_USER_ID) {
    return json({ error: 'Twitch EventSub identities are not configured' }, 503);
  }
  const subscription = payload.subscription || {};
  const condition = subscription.condition || {};
  if (!TWITCH_CHAT_EVENT_TYPES.has(subscription.type)) {
    return json({ error: 'Unexpected Twitch subscription type' }, 400);
  }
  if (condition.broadcaster_user_id !== env.TWITCH_BROADCASTER_USER_ID
    || condition.user_id !== env.TWITCH_BOT_USER_ID) {
    return json({ error: 'Unexpected Twitch subscription identity' }, 403);
  }
  return null;
}

async function handleTwitchWebhook(request, env) {
  const messageId = request.headers.get('twitch-eventsub-message-id') || '';
  const timestamp = request.headers.get('twitch-eventsub-message-timestamp') || '';
  const signature = request.headers.get('twitch-eventsub-message-signature') || '';
  const messageType = request.headers.get('twitch-eventsub-message-type') || '';
  let body;
  try {
    body = await readBoundedBody(request, MAX_TWITCH_WEBHOOK_BYTES);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: error.message }, 413);
    throw error;
  }
  const sentAt = new Date(timestamp).getTime();

  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > TWITCH_MAX_AGE_MS) {
    return json({ error: 'Expired Twitch EventSub request' }, 403);
  }

  const verified = await verifyTwitchSignature({
    secret: env.TWITCH_EVENTSUB_SECRET,
    messageId,
    timestamp,
    body,
    signature,
  });
  if (!verified) return json({ error: 'Invalid Twitch EventSub signature' }, 403);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid Twitch EventSub payload' }, 400);
  }

  const subscriptionError = validateTwitchSubscription(payload, env);
  if (subscriptionError) return subscriptionError;

  if (messageType === 'webhook_callback_verification') {
    return new Response(payload.challenge || '', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (!['notification', 'revocation'].includes(messageType)) {
    return json({ error: 'Unsupported Twitch EventSub message type' }, 400);
  }

  const forwarded = {
    ...payload,
    eventId: messageId,
    timestamp,
    type: messageType === 'revocation' ? 'revocation' : 'notification',
  };
  return roomStub(env).fetch(new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(forwarded),
  }));
}

export { LiveRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/live/')) return json({ error: 'Not found' }, 404);

    const origin = requestOrigin(request);
    if (request.method === 'OPTIONS') {
      if (!hasAllowedOrigin(request, env)) return json({ error: 'Origin not allowed' }, 403);
      return new Response(null, { status: 204, headers: securityHeaders(origin) });
    }

    if (url.pathname === '/api/live/events/twitch' && request.method === 'POST') {
      return addSecurityHeaders(await handleTwitchWebhook(request, env));
    }

    if (url.pathname === '/api/live/chat' && request.method === 'GET') {
      if (!hasAllowedOrigin(request, env)) return json({ error: 'Origin not allowed' }, 403);
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return addSecurityHeaders(json({ error: 'WebSocket upgrade required' }, 426), origin);
      }
      return roomStub(env).fetch(request);
    }

    if (url.pathname === '/api/live/telemetry' && request.method === 'POST') {
      if (!hasAllowedOrigin(request, env)) return json({ error: 'Origin not allowed' }, 403);
      let body;
      try {
        body = await readBoundedBody(request, MAX_TELEMETRY_BYTES);
      } catch (error) {
        if (error instanceof RangeError) return json({ error: error.message }, 413);
        throw error;
      }
      try {
        JSON.parse(body);
      } catch {
        return json({ error: 'Invalid JSON payload' }, 400);
      }
      const forwarded = new Request(request.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      return addSecurityHeaders(await roomStub(env).fetch(forwarded), origin);
    }

    if (['/api/live/status', '/api/live/health'].includes(url.pathname) && request.method === 'GET') {
      return addSecurityHeaders(await roomStub(env).fetch(request), hasAllowedOrigin(request, env) ? origin : '');
    }

    return addSecurityHeaders(json({ error: 'Method not allowed' }, 405), hasAllowedOrigin(request, env) ? origin : '');
  },
};
