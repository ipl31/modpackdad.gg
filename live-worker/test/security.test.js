import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { isAllowedOrigin, verifyTwitchSignature } from '../src/security.js';

test('accepts only explicitly configured origins', () => {
  const configured = 'https://modpackdad.gg,https://www.modpackdad.gg';
  assert.equal(isAllowedOrigin('https://modpackdad.gg', configured), true);
  assert.equal(isAllowedOrigin('https://evil.example', configured), false);
  assert.equal(isAllowedOrigin('http://localhost:8787', configured), false);
  assert.equal(isAllowedOrigin('http://localhost:8787', `${configured},http://localhost:8787`), true);
  assert.equal(isAllowedOrigin('', configured), false);
});

test('verifies Twitch EventSub HMAC signatures against the raw request body', async () => {
  const secret = 'test-secret';
  const messageId = 'message-id';
  const timestamp = '2026-09-21T12:00:00Z';
  const body = '{"challenge":"hello"}';
  const digest = createHmac('sha256', secret)
    .update(messageId + timestamp + body)
    .digest('hex');

  assert.equal(await verifyTwitchSignature({
    secret,
    messageId,
    timestamp,
    body,
    signature: `sha256=${digest}`,
  }), true);
  assert.equal(await verifyTwitchSignature({
    secret,
    messageId,
    timestamp,
    body: `${body} `,
    signature: `sha256=${digest}`,
  }), false);
});
