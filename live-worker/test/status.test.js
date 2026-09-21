import test from 'node:test';
import assert from 'node:assert/strict';

import { selectBroadcast, statusPayload } from '../src/status.js';

const broadcasts = [
  {
    id: 'upcoming-later',
    snippet: { title: 'Later', scheduledStartTime: '2026-09-22T18:00:00Z' },
    status: { lifeCycleStatus: 'ready' },
  },
  {
    id: 'upcoming-sooner',
    snippet: { title: 'Sooner', scheduledStartTime: '2026-09-21T18:00:00Z' },
    status: { lifeCycleStatus: 'ready' },
  },
];

test('selectBroadcast prefers an active broadcast over upcoming broadcasts', () => {
  const active = {
    id: 'active',
    snippet: { title: 'Live now', actualStartTime: '2026-09-21T12:00:00Z' },
    status: { lifeCycleStatus: 'live' },
  };

  assert.equal(selectBroadcast([active], broadcasts).id, 'active');
});

test('selectBroadcast chooses the nearest upcoming broadcast', () => {
  assert.equal(selectBroadcast([], broadcasts).id, 'upcoming-sooner');
});

test('statusPayload returns offline with useful latest video data', () => {
  assert.deepEqual(statusPayload({ latestVideo: {
    videoId: 'vod-1',
    title: 'Latest VOD',
    thumbnail: 'https://i.ytimg.com/vi/vod-1/hqdefault.jpg',
  } }), {
    state: 'offline',
    broadcast: null,
    latestVideo: {
      videoId: 'vod-1',
      title: 'Latest VOD',
      thumbnail: 'https://i.ytimg.com/vi/vod-1/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=vod-1',
    },
    stale: false,
    checkedAt: null,
  });
});
