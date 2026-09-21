import { DurableObject } from 'cloudflare:workers';

import { ChatBuffer } from './chat-buffer.js';
import { TwitchChatProvider } from './providers/twitch.js';
import { YouTubeChatProvider } from './providers/youtube.js';

const MAX_MESSAGES = 300;
const STATUS_FRESH_MS = 30_000;
const OFFLINE_ALARM_MS = 300_000;
const ACTIVE_ALARM_MS = 60_000;
const MAX_TELEMETRY_DETAIL_LENGTH = 240;
const MAX_WEBSITE_VIEWERS = 500;
const MAX_TELEMETRY_EVENTS_PER_MINUTE = 1_200;
const TWITCH_REPLAY_TTL_MS = 15 * 60 * 1_000;
const TWITCH_CHAT_EVENT_TYPES = new Set([
  'channel.chat.message',
  'channel.chat.message_delete',
  'channel.chat.clear_user_messages',
  'channel.chat.clear',
]);

function parseSuppressedIdentities(value = '') {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function unavailableStatus() {
  return {
    state: 'unavailable',
    broadcast: null,
    latestVideo: null,
    stale: false,
    checkedAt: new Date().toISOString(),
  };
}

export class LiveRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.buffer = new ChatBuffer({
      maxMessages: MAX_MESSAGES,
      suppressedIdentities: parseSuppressedIdentities(env.CHAT_SUPPRESSION_RULES),
    });
    this.youtube = new YouTubeChatProvider(env);
    this.twitch = new TwitchChatProvider(env);
    this.status = null;
    this.statusPromise = null;
    this.youtubePageToken = '';
    this.youtubeChatId = '';
    this.nextYouTubeChatPollAt = 0;
    this.youtubeChatFailureCount = 0;
    this.processedTwitchEvents = new Map();
    this.providerHealth = {
      youtube: this.youtube.getHealth(),
      twitch: this.twitch.getHealth(),
    };

    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(['status', 'providerHealth', 'youtubeState', 'twitchReplayIds']);
      this.status = stored.get('status') ?? null;
      this.providerHealth = stored.get('providerHealth') ?? this.providerHealth;
      const youtubeState = stored.get('youtubeState') ?? {};
      this.youtubePageToken = youtubeState.pageToken || '';
      this.youtubeChatId = youtubeState.chatId || '';
      this.nextYouTubeChatPollAt = youtubeState.nextPollAt || 0;
      this.youtubeChatFailureCount = youtubeState.failureCount || 0;
      const now = Date.now();
      this.processedTwitchEvents = new Map(
        (stored.get('twitchReplayIds') ?? []).filter(([, expiresAt]) => expiresAt > now),
      );
      if (!(await ctx.storage.getAlarm())) await ctx.storage.setAlarm(Date.now() + 1_000);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/chat')) return this.openChat(request);
    if (request.method === 'GET' && url.pathname.endsWith('/status')) return this.getStatusResponse();
    if (request.method === 'GET' && url.pathname.endsWith('/health')) return this.getHealthResponse();
    if (request.method === 'POST' && url.pathname.endsWith('/events/twitch')) return this.handleTwitchEvent(request);
    if (request.method === 'POST' && url.pathname.endsWith('/telemetry')) return this.handleTelemetry(request);
    return json({ error: 'Not found' }, 404);
  }

  async openChat(request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket upgrade required' }, 426);
    }
    if (this.viewerCount() >= MAX_WEBSITE_VIEWERS) {
      return json({ error: 'Live chat is at connection capacity' }, 503);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({
      type: 'snapshot',
      messages: this.buffer.list(),
      status: this.publicStatus(),
      providerHealth: this.providerHealth,
      viewerCount: this.viewerCount(),
    }));
    this.broadcastViewerCount();
    this.ctx.waitUntil((async () => {
      await this.ensureFreshStatus();
      await this.pollYouTubeChat();
      await this.ctx.storage.setAlarm(Date.now() + 1_000);
    })().catch((error) => this.recordError('youtube', error)));

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket) {
    // The Phase 1 protocol is intentionally read-only.
    socket.close(1008, 'Combined chat is read-only.');
  }

  webSocketClose() {
    this.broadcastViewerCount();
  }

  webSocketError() {
    this.broadcastViewerCount();
  }

  viewerCount() {
    return this.ctx.getWebSockets().length;
  }

  broadcast(payload) {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(encoded);
      } catch {
        try { socket.close(1011, 'delivery failed'); } catch { /* already closed */ }
      }
    }
  }

  broadcastViewerCount() {
    this.broadcast({ type: 'viewer.count', count: this.viewerCount() });
  }

  publicStatus() {
    return this.status ?? unavailableStatus();
  }

  youtubeState() {
    return {
      pageToken: this.youtubePageToken,
      chatId: this.youtubeChatId,
      nextPollAt: this.nextYouTubeChatPollAt,
      failureCount: this.youtubeChatFailureCount,
    };
  }

  async getStatusResponse() {
    await this.ensureFreshStatus();
    return json(this.publicStatus());
  }

  async getHealthResponse() {
    return json({
      status: this.status?.state ?? 'unavailable',
      providers: this.providerHealth,
      websiteViewers: this.viewerCount(),
      checkedAt: new Date().toISOString(),
    });
  }

  async ensureFreshStatus(force = false) {
    const checkedAt = this.status?.checkedAt ? new Date(this.status.checkedAt).getTime() : 0;
    if (!force && checkedAt && Date.now() - checkedAt < STATUS_FRESH_MS) return this.status;
    if (this.statusPromise) return this.statusPromise;

    this.statusPromise = this.refreshStatus();
    try {
      return await this.statusPromise;
    } finally {
      this.statusPromise = null;
    }
  }

  async refreshStatus() {
    try {
      const nextStatus = await this.youtube.fetchStatus();
      if (this.youtubeChatFailureCount === 0 || nextStatus.state !== 'live') {
        this.youtube.markHealthy('Broadcast metadata API available.');
      }
      this.providerHealth.youtube = this.youtube.getHealth();

      try {
        const twitchMetadata = await this.twitch.fetchStreamMetadata();
        this.twitch.markHealthy(twitchMetadata ? 'Twitch stream and EventSub API available.' : 'Twitch API available; channel offline.');
        this.providerHealth.twitch = this.twitch.getHealth();
        if (nextStatus.broadcast && twitchMetadata) {
          nextStatus.broadcast.category = twitchMetadata.category || nextStatus.broadcast.category;
        }
      } catch (error) {
        this.twitch.markDegraded(error.message);
        this.providerHealth.twitch = this.twitch.getHealth();
      }

      const nextChatId = nextStatus.state === 'live' ? nextStatus.broadcast?.liveChatId || '' : '';
      if (nextChatId !== this.youtubeChatId) {
        this.youtubeChatId = nextChatId;
        this.youtubePageToken = '';
        this.nextYouTubeChatPollAt = 0;
        this.youtubeChatFailureCount = 0;
      }

      this.status = nextStatus;
      await this.ctx.storage.put({
        status: this.status,
        providerHealth: this.providerHealth,
        youtubeState: this.youtubeState(),
      });
      this.broadcast({ type: 'status', status: this.status });
      this.broadcast({ type: 'provider.health', providers: this.providerHealth });
      return this.status;
    } catch (error) {
      this.recordError('youtube', error);
      if (this.status) {
        this.status = { ...this.status, stale: true };
        await this.ctx.storage.put({ status: this.status, providerHealth: this.providerHealth });
        this.broadcast({ type: 'status', status: this.status });
        return this.status;
      }
      this.status = unavailableStatus();
      await this.ctx.storage.put({ status: this.status, providerHealth: this.providerHealth });
      return this.status;
    }
  }

  recordError(provider, error) {
    const message = String(error?.message || 'Provider request failed').slice(0, MAX_TELEMETRY_DETAIL_LENGTH);
    if (provider === 'youtube') {
      this.youtube.markDegraded(message);
      this.providerHealth.youtube = this.youtube.getHealth();
    } else if (provider === 'twitch') {
      this.twitch.markDegraded(message);
      this.providerHealth.twitch = this.twitch.getHealth();
    }
    console.error(JSON.stringify({ event: 'provider_error', provider, message }));
    this.broadcast({ type: 'provider.health', providers: this.providerHealth });
  }

  applyMessage(message) {
    if (!this.buffer.add(message)) return false;
    this.broadcast({ type: 'chat.message', message });
    return true;
  }

  applyDirective(directive) {
    if (!directive) return;
    if (directive.type === 'chat.delete') this.buffer.delete(directive.messageId);
    if (directive.type === 'chat.clear_user') this.buffer.clearUser(directive.platform, directive.userId);
    if (directive.type === 'chat.clear') this.buffer.clearPlatform(directive.platform);
    this.broadcast(directive);
  }

  async pollYouTubeChat() {
    if (!this.youtubeChatId || this.viewerCount() === 0 || Date.now() < this.nextYouTubeChatPollAt) return;
    try {
      const result = await this.youtube.pollChat(this.youtubeChatId, this.youtubePageToken);
      this.youtube.markHealthy('Live chat connected.');
      this.providerHealth.youtube = this.youtube.getHealth();
      this.youtubePageToken = result.nextPageToken;
      this.nextYouTubeChatPollAt = Date.now() + result.pollingIntervalMillis;
      this.youtubeChatFailureCount = 0;
      for (const directive of result.directives) this.applyDirective(directive);
      for (const message of result.messages) this.applyMessage(message);
      if (result.offlineAt) {
        this.youtubeChatId = '';
        this.youtubePageToken = '';
        this.nextYouTubeChatPollAt = 0;
        await this.ensureFreshStatus(true);
      }
      await this.ctx.storage.put('youtubeState', this.youtubeState());
    } catch (error) {
      this.recordError('youtube', error);
      this.youtubeChatFailureCount += 1;
      const terminalReasons = new Set(['liveChatDisabled', 'liveChatEnded', 'liveChatNotFound', 'forbidden']);
      const terminalFailure = terminalReasons.has(error.reason) || error.status === 404;
      const exponentialDelay = 5_000 * (2 ** Math.min(this.youtubeChatFailureCount - 1, 6));
      const retryDelay = Math.min(300_000, Math.max(5_000, error.retryAfter || exponentialDelay));
      this.nextYouTubeChatPollAt = Date.now() + retryDelay;
      await this.ctx.storage.put('youtubeState', this.youtubeState());
      if (terminalFailure) await this.ensureFreshStatus(true);
    }
  }

  async handleTwitchEvent(request) {
    const payload = await request.json();
    const eventId = payload.eventId;
    if (eventId && this.processedTwitchEvents.has(eventId)) return new Response(null, { status: 204 });
    if (eventId) {
      const now = Date.now();
      for (const [id, expiresAt] of this.processedTwitchEvents) {
        if (expiresAt <= now) this.processedTwitchEvents.delete(id);
      }
      this.processedTwitchEvents.set(eventId, now + TWITCH_REPLAY_TTL_MS);
      while (this.processedTwitchEvents.size > 500) {
        this.processedTwitchEvents.delete(this.processedTwitchEvents.keys().next().value);
      }
      await this.ctx.storage.put('twitchReplayIds', [...this.processedTwitchEvents]);
    }

    const subscriptionType = payload.subscription?.type;
    const condition = payload.subscription?.condition || {};
    if (!TWITCH_CHAT_EVENT_TYPES.has(subscriptionType)) return json({ error: 'Unexpected Twitch subscription type' }, 400);
    if (!this.env.TWITCH_BROADCASTER_USER_ID || !this.env.TWITCH_BOT_USER_ID) {
      return json({ error: 'Twitch EventSub identities are not configured' }, 503);
    }
    if (condition.broadcaster_user_id !== this.env.TWITCH_BROADCASTER_USER_ID) {
      return json({ error: 'Unexpected Twitch broadcaster' }, 403);
    }
    if (condition.user_id !== this.env.TWITCH_BOT_USER_ID) {
      return json({ error: 'Unexpected Twitch bot user' }, 403);
    }
    if (payload.event?.broadcaster_user_id
      && payload.event.broadcaster_user_id !== condition.broadcaster_user_id) {
      return json({ error: 'Mismatched Twitch notification broadcaster' }, 403);
    }

    if (payload.type === 'revocation') {
      this.twitch.markUnavailable(`EventSub revoked: ${payload.subscription?.status || 'unknown reason'}`);
      this.providerHealth.twitch = this.twitch.getHealth();
      this.broadcast({ type: 'provider.health', providers: this.providerHealth });
      return new Response(null, { status: 204 });
    }

    const result = this.twitch.processNotification(payload, payload.timestamp);
    if (result.directive) this.applyDirective(result.directive);
    if (result.message) this.applyMessage(result.message);
    this.twitch.markHealthy('EventSub chat connected.');
    this.providerHealth.twitch = this.twitch.getHealth();
    return new Response(null, { status: 204 });
  }

  async handleTelemetry(request) {
    const payload = await request.json();
    const allowedEvents = new Set([
      'page_view',
      'player_ready',
      'player_error',
      'chat_connected',
      'chat_disconnected',
      'status_error',
    ]);
    if (!allowedEvents.has(payload.event)) return json({ error: 'Unsupported telemetry event' }, 400);
    if (payload.details !== undefined
      && (payload.details === null || Array.isArray(payload.details) || typeof payload.details !== 'object')) {
      return json({ error: 'Telemetry details must be an object' }, 400);
    }
    const detailEntries = Object.entries(payload.details || {}).slice(0, 20);

    const minute = Math.floor(Date.now() / 60_000);
    const telemetryRate = await this.ctx.storage.get('telemetryRate') ?? { minute, count: 0 };
    if (telemetryRate.minute !== minute) {
      telemetryRate.minute = minute;
      telemetryRate.count = 0;
    }
    if (telemetryRate.count >= MAX_TELEMETRY_EVENTS_PER_MINUTE) {
      return json({ error: 'Telemetry rate limit exceeded' }, 429);
    }
    telemetryRate.count += 1;
    await this.ctx.storage.put('telemetryRate', telemetryRate);

    const day = new Date().toISOString().slice(0, 10);
    const telemetry = await this.ctx.storage.get('telemetry') ?? { day, counters: {} };
    if (telemetry.day !== day) {
      telemetry.day = day;
      telemetry.counters = {};
    }
    telemetry.counters[payload.event] = (telemetry.counters[payload.event] || 0) + 1;
    await this.ctx.storage.put('telemetry', telemetry);
    console.log(JSON.stringify({
      event: payload.event,
      occurredAt: payload.occurredAt || new Date().toISOString(),
      details: Object.fromEntries(detailEntries.map(([key, value]) => [
        String(key).slice(0, 40),
        String(value).slice(0, MAX_TELEMETRY_DETAIL_LENGTH),
      ])),
    }));
    return new Response(null, { status: 204 });
  }

  async alarm() {
    try {
      await this.ensureFreshStatus();
      await this.pollYouTubeChat();
    } catch (error) {
      console.error(JSON.stringify({ event: 'alarm_error', message: String(error?.message || error).slice(0, 240) }));
    } finally {
      let delay = this.status?.state === 'offline' && this.viewerCount() === 0
        ? OFFLINE_ALARM_MS
        : ACTIVE_ALARM_MS;
      if (this.youtubeChatId && this.viewerCount() > 0 && this.nextYouTubeChatPollAt) {
        delay = Math.min(delay, Math.max(1_000, this.nextYouTubeChatPollAt - Date.now()));
      }
      await this.ctx.storage.setAlarm(Date.now() + delay);
    }
  }
}
