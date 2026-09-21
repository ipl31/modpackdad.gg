import { ChatProvider } from './base.js';
import { moderationDirective, normalizeYouTubeMessage } from '../normalize.js';
import { selectBroadcast, statusPayload } from '../status.js';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const GOOGLE_TOKEN_API = 'https://oauth2.googleapis.com/token';

export class YouTubeChatProvider extends ChatProvider {
  constructor(env = {}, fetchImpl = fetch) {
    super('youtube');
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.uploadsPlaylistId = null;
    this.videoMetadataCache = new Map();
  }

  async getAccessToken() {
    if (this.env.YOUTUBE_ACCESS_TOKEN) return this.env.YOUTUBE_ACCESS_TOKEN;
    if (this.token && this.tokenExpiresAt > Date.now() + 60_000) return this.token;
    if (!this.env.YOUTUBE_CLIENT_ID || !this.env.YOUTUBE_CLIENT_SECRET || !this.env.YOUTUBE_REFRESH_TOKEN) {
      throw new Error('YouTube OAuth credentials are not configured');
    }

    const body = new URLSearchParams({
      client_id: this.env.YOUTUBE_CLIENT_ID,
      client_secret: this.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: this.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });
    const response = await this.fetchImpl(GOOGLE_TOKEN_API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(`YouTube token refresh failed (${response.status})`);
    const payload = await response.json();
    this.token = payload.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, (payload.expires_in ?? 0) * 1_000);
    return this.token;
  }

  async request(path, params = {}) {
    const token = await this.getAccessToken();
    const url = new URL(`${YOUTUBE_API}/${path}`);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    }
    const response = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const error = new Error(`YouTube ${path} request failed (${response.status})`);
      error.status = response.status;
      error.retryAfter = retryAfter ? Number(retryAfter) * 1_000 : null;
      try {
        const payload = await response.json();
        error.reason = payload.error?.errors?.[0]?.reason || '';
      } catch {
        error.reason = '';
      }
      throw error;
    }
    return response.json();
  }

  async fetchBroadcasts(broadcastStatus) {
    const payload = await this.request('liveBroadcasts', {
      part: 'id,snippet,status,contentDetails',
      broadcastStatus,
      broadcastType: 'all',
      maxResults: 10,
    });
    return payload.items ?? [];
  }

  async fetchVideoMetadata(videoId) {
    if (!videoId) return { category: '', embeddable: true, activeLiveChatId: '' };
    if (this.videoMetadataCache.has(videoId)) return this.videoMetadataCache.get(videoId);
    const videoPayload = await this.request('videos', { part: 'snippet,status,liveStreamingDetails', id: videoId });
    const video = videoPayload.items?.[0];
    const categoryId = video?.snippet?.categoryId;
    const categoryPayload = categoryId
      ? await this.request('videoCategories', { part: 'snippet', id: categoryId })
      : { items: [] };
    const metadata = {
      category: categoryPayload.items?.[0]?.snippet?.title || '',
      embeddable: video?.status?.embeddable !== false,
      activeLiveChatId: video?.liveStreamingDetails?.activeLiveChatId || '',
    };
    this.videoMetadataCache.set(videoId, metadata);
    return metadata;
  }

  async fetchUploadsPlaylistId() {
    if (this.uploadsPlaylistId) return this.uploadsPlaylistId;
    const params = { part: 'contentDetails' };
    if (this.env.YOUTUBE_CHANNEL_ID) params.id = this.env.YOUTUBE_CHANNEL_ID;
    else params.mine = true;
    const payload = await this.request('channels', params);
    this.uploadsPlaylistId = payload.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
    return this.uploadsPlaylistId;
  }

  async fetchLatestVideo(excludedVideoId = '') {
    const playlistId = await this.fetchUploadsPlaylistId();
    if (!playlistId) return null;
    const payload = await this.request('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: 10,
    });
    const item = (payload.items ?? []).find((candidate) => {
      const videoId = candidate.contentDetails?.videoId || candidate.snippet?.resourceId?.videoId;
      return videoId && videoId !== excludedVideoId;
    });
    const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
    if (!videoId) return null;
    return {
      videoId,
      title: item.snippet?.title || 'Latest ModPackDad video',
      thumbnail: item.snippet?.thumbnails?.maxres?.url
        || item.snippet?.thumbnails?.high?.url
        || item.snippet?.thumbnails?.medium?.url
        || '',
    };
  }

  async fetchStatus() {
    const [active, upcoming] = await Promise.all([
      this.fetchBroadcasts('active'),
      this.fetchBroadcasts('upcoming'),
    ]);
    const selected = selectBroadcast(active, upcoming);
    const [videoMetadata, latestVideo] = await Promise.all([
      selected ? this.fetchVideoMetadata(selected.id) : Promise.resolve({ category: '', embeddable: true, activeLiveChatId: '' }),
      selected ? Promise.resolve(null) : this.fetchLatestVideo().catch(() => null),
    ]);
    if (selected) {
      selected.embeddable = videoMetadata.embeddable;
      selected.snippet = {
        ...selected.snippet,
        liveChatId: selected.snippet?.liveChatId || videoMetadata.activeLiveChatId || null,
      };
    }
    return statusPayload({
      active,
      upcoming,
      latestVideo,
      category: videoMetadata.category,
      checkedAt: new Date().toISOString(),
    });
  }

  async pollChat(liveChatId, pageToken = '') {
    if (!liveChatId) throw new Error('YouTube live chat ID is required');
    const payload = await this.request('liveChat/messages', {
      liveChatId,
      part: 'id,snippet,authorDetails',
      maxResults: 500,
      pageToken,
    });
    const messages = [];
    const directives = [];
    for (const item of payload.items ?? []) {
      const directive = moderationDirective('youtube', item);
      if (directive) {
        directives.push(directive);
        continue;
      }
      const message = normalizeYouTubeMessage(item);
      if (message) messages.push(message);
    }
    return {
      messages,
      directives,
      nextPageToken: payload.nextPageToken || '',
      pollingIntervalMillis: Math.max(1_000, payload.pollingIntervalMillis || 5_000),
      offlineAt: payload.offlineAt || null,
    };
  }
}
