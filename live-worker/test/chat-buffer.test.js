import test from 'node:test';
import assert from 'node:assert/strict';

import { ChatBuffer } from '../src/chat-buffer.js';

function message(id, platform = 'twitch', userId = `user-${id}`) {
  return {
    id: `${platform}:${id}`,
    platform,
    platformMessageId: id,
    userId,
    message: `message ${id}`,
    timestamp: `2026-09-21T12:00:${String(id).padStart(2, '0')}Z`,
  };
}

test('deduplicates provider messages and preserves chronological order', () => {
  const buffer = new ChatBuffer({ maxMessages: 10 });

  assert.equal(buffer.add(message('1')), true);
  assert.equal(buffer.add(message('1')), false);
  assert.equal(buffer.add(message('2', 'youtube')), true);
  assert.deepEqual(buffer.list().map((item) => item.id), ['twitch:1', 'youtube:2']);
});

test('evicts the oldest message when the bounded history is full', () => {
  const buffer = new ChatBuffer({ maxMessages: 2 });
  buffer.add(message('1'));
  buffer.add(message('2'));
  buffer.add(message('3'));

  assert.deepEqual(buffer.list().map((item) => item.id), ['twitch:2', 'twitch:3']);
});

test('applies message deletion, user clear, and platform clear', () => {
  const buffer = new ChatBuffer({ maxMessages: 10 });
  buffer.add(message('1', 'twitch', 'same-user'));
  buffer.add(message('2', 'twitch', 'same-user'));
  buffer.add(message('3', 'youtube', 'same-user'));

  assert.equal(buffer.delete('twitch:1'), true);
  assert.deepEqual(buffer.clearUser('twitch', 'same-user'), ['twitch:2']);
  assert.deepEqual(buffer.clearPlatform('youtube'), ['youtube:3']);
  assert.deepEqual(buffer.list(), []);
});

test('suppresses configured users before messages enter history', () => {
  const buffer = new ChatBuffer({
    maxMessages: 10,
    suppressedIdentities: ['twitch:blocked-user'],
  });

  assert.equal(buffer.add(message('1', 'twitch', 'blocked-user')), false);
  assert.equal(buffer.add(message('2', 'youtube', 'blocked-user')), true);
  assert.equal(buffer.list().length, 1);
});
