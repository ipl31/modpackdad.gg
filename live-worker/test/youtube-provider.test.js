import test from 'node:test';
import assert from 'node:assert/strict';

import { YouTubeChatProvider } from '../src/providers/youtube.js';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('YouTube provider discovers an active broadcast and category', async () => {
  let categoryRequests = 0;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/liveBroadcasts')) {
      const status = url.searchParams.get('broadcastStatus');
      return response({ items: status === 'active' ? [{
        id: 'live-video',
        snippet: {
          title: 'Live title',
          actualStartTime: '2026-09-21T12:00:00Z',
        },
        status: { lifeCycleStatus: 'live' },
      }] : [] });
    }
    if (url.pathname.endsWith('/videos')) {
      return response({ items: [{
        snippet: { categoryId: '20' },
        status: { embeddable: false },
        liveStreamingDetails: { activeLiveChatId: 'chat-from-video' },
      }] });
    }
    if (url.pathname.endsWith('/videoCategories')) {
      categoryRequests += 1;
      return response({ items: [{ snippet: { title: 'Gaming' } }] });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const provider = new YouTubeChatProvider({ YOUTUBE_ACCESS_TOKEN: 'token' }, fetchImpl);
  const status = await provider.fetchStatus();

  assert.equal(status.state, 'live');
  assert.equal(status.broadcast.videoId, 'live-video');
  assert.equal(status.broadcast.liveChatId, 'chat-from-video');
  assert.equal(status.broadcast.embeddable, false);
  assert.equal(status.broadcast.category, 'Gaming');
  await provider.fetchStatus();
  assert.equal(categoryRequests, 1);
});

test('YouTube provider emits normalized messages and moderation directives', async () => {
  const fetchImpl = async () => response({
    nextPageToken: 'next-page',
    pollingIntervalMillis: 4_500,
    items: [
      {
        id: 'message-1',
        snippet: { type: 'textMessageEvent', displayMessage: 'Hello', publishedAt: '2026-09-21T12:00:00Z' },
        authorDetails: { channelId: 'user-1', displayName: 'Alice' },
      },
      {
        id: 'delete-1',
        snippet: { type: 'messageDeletedEvent', messageDeletedDetails: { deletedMessageId: 'message-0' } },
      },
    ],
  });

  const provider = new YouTubeChatProvider({ YOUTUBE_ACCESS_TOKEN: 'token' }, fetchImpl);
  const result = await provider.pollChat('chat-1', 'previous-page');

  assert.equal(result.messages[0].id, 'youtube:message-1');
  assert.equal(result.directives[0].messageId, 'youtube:message-0');
  assert.equal(result.nextPageToken, 'next-page');
  assert.equal(result.pollingIntervalMillis, 4_500);
});
