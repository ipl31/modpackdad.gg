import test from 'node:test';
import assert from 'node:assert/strict';

import {
  moderationDirective,
  normalizeTwitchMessage,
  normalizeYouTubeMessage,
  sanitizeText,
} from '../src/normalize.js';

test('sanitizeText strips controls and caps message length', () => {
  const input = `hello\u0000 world ${'x'.repeat(1_200)}`;
  const output = sanitizeText(input);

  assert.equal(output.includes('\u0000'), false);
  assert.equal(output.length, 1_000);
});

test('normalizes a YouTube text message without carrying provider HTML', () => {
  const result = normalizeYouTubeMessage({
    id: 'yt-message-1',
    snippet: {
      type: 'textMessageEvent',
      publishedAt: '2026-09-21T12:00:00Z',
      displayMessage: '<b>hello</b>',
    },
    authorDetails: {
      channelId: 'channel-1',
      channelUrl: 'https://youtube.com/channel/channel-1',
      displayName: 'Alice',
      profileImageUrl: 'https://yt3.ggpht.com/avatar',
      isChatModerator: true,
      isChatOwner: false,
      isChatSponsor: true,
      isVerified: false,
    },
  });

  assert.deepEqual(result, {
    id: 'youtube:yt-message-1',
    platform: 'youtube',
    platformMessageId: 'yt-message-1',
    userId: 'channel-1',
    username: 'Alice',
    displayName: 'Alice',
    avatar: 'https://yt3.ggpht.com/avatar',
    badges: ['moderator', 'member'],
    message: '<b>hello</b>',
    timestamp: '2026-09-21T12:00:00Z',
    metadata: {},
  });
});

test('normalizes a Twitch chat message and preserves useful badge titles', () => {
  const result = normalizeTwitchMessage({
    message_id: 'tw-message-1',
    chatter_user_id: 'user-1',
    chatter_user_login: 'alice',
    chatter_user_name: 'Alice',
    color: '#00FF00',
    badges: [{ set_id: 'moderator', id: '1' }, { set_id: 'subscriber', id: '12' }],
    message: { text: 'Nice build!', fragments: [] },
  }, '2026-09-21T12:00:00Z');

  assert.equal(result.id, 'twitch:tw-message-1');
  assert.equal(result.userId, 'user-1');
  assert.deepEqual(result.badges, ['moderator', 'subscriber']);
  assert.equal(result.message, 'Nice build!');
  assert.equal(result.metadata.color, '#00FF00');
});

test('maps YouTube and Twitch moderation events to provider-neutral directives', () => {
  assert.deepEqual(moderationDirective('youtube', {
    id: 'tombstone-event',
    snippet: { type: 'tombstone' },
  }), {
    type: 'chat.clear',
    platform: 'youtube',
  });

  assert.deepEqual(moderationDirective('twitch', {
    subscriptionType: 'channel.chat.clear_user_messages',
    event: { target_user_id: 'bad-user' },
  }), {
    type: 'chat.clear_user',
    platform: 'twitch',
    userId: 'bad-user',
  });
});
