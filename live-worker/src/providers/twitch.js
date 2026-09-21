import { ChatProvider } from './base.js';
import { moderationDirective, normalizeTwitchMessage } from '../normalize.js';

const TWITCH_API = 'https://api.twitch.tv/helix';
const TWITCH_TOKEN_API = 'https://id.twitch.tv/oauth2/token';

export class TwitchChatProvider extends ChatProvider {
  constructor(env = {}, fetchImpl = fetch) {
    super('twitch');
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  processNotification(payload, timestamp = new Date().toISOString()) {
    const subscriptionType = payload?.subscription?.type;
    const event = payload?.event ?? {};
    if (subscriptionType === 'channel.chat.message') {
      return {
        message: normalizeTwitchMessage(event, timestamp),
        directive: null,
      };
    }
    return {
      message: null,
      directive: moderationDirective('twitch', { subscriptionType, event }),
    };
  }

  async getAppAccessToken() {
    if (this.env.TWITCH_APP_ACCESS_TOKEN) return this.env.TWITCH_APP_ACCESS_TOKEN;
    if (this.token && this.tokenExpiresAt > Date.now() + 60_000) return this.token;
    if (!this.env.TWITCH_CLIENT_ID || !this.env.TWITCH_CLIENT_SECRET) {
      throw new Error('Twitch client credentials are not configured');
    }

    const url = new URL(TWITCH_TOKEN_API);
    url.searchParams.set('client_id', this.env.TWITCH_CLIENT_ID);
    url.searchParams.set('client_secret', this.env.TWITCH_CLIENT_SECRET);
    url.searchParams.set('grant_type', 'client_credentials');
    const response = await this.fetchImpl(url, { method: 'POST' });
    if (!response.ok) throw new Error(`Twitch token request failed (${response.status})`);
    const body = await response.json();
    this.token = body.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, (body.expires_in ?? 0) * 1_000);
    return this.token;
  }

  async fetchStreamMetadata() {
    const login = this.env.TWITCH_CHANNEL_LOGIN;
    if (!login) return null;
    const token = await this.getAppAccessToken();
    const url = new URL(`${TWITCH_API}/streams`);
    url.searchParams.set('user_login', login);
    const response = await this.fetchImpl(url, {
      headers: {
        authorization: `Bearer ${token}`,
        'client-id': this.env.TWITCH_CLIENT_ID,
      },
    });
    if (!response.ok) throw new Error(`Twitch stream request failed (${response.status})`);
    const stream = (await response.json()).data?.[0];
    if (!stream) return null;
    return {
      title: stream.title || '',
      category: stream.game_name || '',
      startedAt: stream.started_at || null,
      viewerCount: Number.isFinite(stream.viewer_count) ? stream.viewer_count : null,
    };
  }
}
