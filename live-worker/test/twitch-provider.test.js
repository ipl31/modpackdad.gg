import test from 'node:test';
import assert from 'node:assert/strict';

import { TwitchChatProvider } from '../src/providers/twitch.js';

test('Twitch provider normalizes EventSub chat notifications', () => {
  const provider = new TwitchChatProvider();
  const output = provider.processNotification({
    subscription: { type: 'channel.chat.message' },
    event: {
      message_id: 'message-1',
      chatter_user_id: 'user-1',
      chatter_user_login: 'alice',
      chatter_user_name: 'Alice',
      badges: [],
      message: { text: 'Hello from Twitch' },
    },
  }, '2026-09-21T12:00:00Z');

  assert.equal(output.message.id, 'twitch:message-1');
  assert.equal(output.directive, null);
});

test('Twitch provider returns a neutral clear-room directive', () => {
  const provider = new TwitchChatProvider();
  const output = provider.processNotification({
    subscription: { type: 'channel.chat.clear' },
    event: { broadcaster_user_id: 'channel-1' },
  });

  assert.equal(output.message, null);
  assert.deepEqual(output.directive, { type: 'chat.clear', platform: 'twitch' });
});
