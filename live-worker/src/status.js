function scheduledTime(broadcast) {
  return new Date(broadcast?.snippet?.scheduledStartTime || 8.64e15).getTime();
}

export function selectBroadcast(active = [], upcoming = []) {
  if (active.length > 0) {
    return [...active].sort((a, b) => {
      const aStarted = new Date(a?.snippet?.actualStartTime || 0).getTime();
      const bStarted = new Date(b?.snippet?.actualStartTime || 0).getTime();
      return bStarted - aStarted;
    })[0];
  }
  return [...upcoming].sort((a, b) => scheduledTime(a) - scheduledTime(b))[0] ?? null;
}

export function normalizeLatestVideo(video) {
  if (!video?.videoId) return null;
  return {
    videoId: video.videoId,
    title: video.title || 'Latest ModPackDad video',
    thumbnail: video.thumbnail || '',
    url: video.url || `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`,
  };
}

export function normalizeBroadcast(broadcast, category = '') {
  if (!broadcast?.id) return null;
  const snippet = broadcast.snippet ?? {};
  return {
    videoId: broadcast.id,
    title: snippet.title || 'ModPackDad Live',
    description: snippet.description || '',
    thumbnail: snippet.thumbnails?.maxres?.url
      || snippet.thumbnails?.high?.url
      || snippet.thumbnails?.medium?.url
      || '',
    scheduledStartTime: snippet.scheduledStartTime || null,
    actualStartTime: snippet.actualStartTime || null,
    liveChatId: snippet.liveChatId || null,
    embeddable: broadcast.embeddable !== false,
    category: category || '',
    watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(broadcast.id)}`,
  };
}

export function statusPayload({
  active = [],
  upcoming = [],
  latestVideo = null,
  category = '',
  stale = false,
  checkedAt = null,
} = {}) {
  const selected = selectBroadcast(active, upcoming);
  const state = active.length > 0 ? 'live' : selected ? 'upcoming' : 'offline';
  return {
    state,
    broadcast: normalizeBroadcast(selected, category),
    latestVideo: normalizeLatestVideo(latestVideo),
    stale,
    checkedAt,
  };
}
