# ModPackDad live Worker

This directory contains the separately deployed Cloudflare Worker and Durable Object behind `/api/live/*`. The public `/live/` page remains a static Cloudflare Pages asset.

No production resource, route, OAuth grant, or secret is created by this repository alone.

## API

- `GET /api/live/status` — active, upcoming, offline, or temporarily unavailable stream metadata.
- `GET /api/live/chat` — read-only WebSocket with normalized chat events.
- `POST /api/live/events/twitch` — signed Twitch EventSub webhook callback.
- `POST /api/live/telemetry` — allowlisted operational events with no user identity or IP persisted by application code.
- `GET /api/live/health` — public provider and website-viewer health summary.

## Local checks

```sh
npm ci
npm test
npm run check
```

`npm run check` runs the tests and a Wrangler dry-run bundle. It does not deploy.

For local development, create an uncommitted `.dev.vars` file in this directory and run `npm run dev`. `.dev.vars` is ignored by Git. A browser preview origin must be explicitly added to `ALLOWED_ORIGINS` in that local file, for example `http://localhost:4173`; local origins are never implicitly trusted by production code.

## Required production secrets

Set these with `wrangler secret put NAME`; never commit their values:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_EVENTSUB_SECRET` — a random webhook-signing secret between 10 and 100 characters.

Optional secret:

- `CHAT_SUPPRESSION_RULES` — JSON array (or comma-separated list) of identities such as `twitch:123456`, `youtube:UC...`, or a single message such as `twitch:message:message-id`. Matching messages never enter the website feed.

The committed channel ID and public origins in `wrangler.jsonc` are not secrets.

Set `TWITCH_BROADCASTER_USER_ID` and `TWITCH_BOT_USER_ID` as non-secret Worker variables in the production environment. Incoming signed notifications are rejected until both are configured and then checked against them. `keep_vars` is enabled so a Wrangler deploy preserves these dashboard-managed values.

## YouTube authorization

Create a Google OAuth client for the YouTube channel owner and grant `https://www.googleapis.com/auth/youtube.readonly`. Store the resulting refresh token as `YOUTUBE_REFRESH_TOKEN`. The Worker refreshes short-lived access tokens server-side.

The OAuth grant lets the Worker use `liveBroadcasts.list` for reliable active/upcoming discovery and obtain `snippet.liveChatId`. It polls `liveChatMessages.list` only while the channel is live and website viewers are connected, and always honors YouTube's returned `pollingIntervalMillis`.

## Twitch authorization and EventSub

Register a Twitch application. The bot user needs the current chat-reading grants (`user:read:chat` and `user:bot`), and the broadcaster must grant `channel:bot` or make the bot a moderator, as required by Twitch's EventSub chat authorization rules.

After those user grants exist for the application, webhook subscriptions are created with an app access token, as required by Twitch's hosted-webhook flow. The setup script obtains that short-lived app token through client credentials; it does not replace the prerequisite user grants.

After the Worker is deployed and routed, export the following values only in the operator shell:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_BROADCASTER_USER_ID`
- `TWITCH_BOT_USER_ID`
- `TWITCH_EVENTSUB_SECRET`
- `TWITCH_CALLBACK_URL=https://modpackdad.gg/api/live/events/twitch`

Then run:

```sh
node scripts/setup-twitch-eventsub.mjs
```

The script requests webhook subscriptions for chat messages, message deletions, per-user clears, and room clears. It does not write credentials to disk.

## Cloudflare production activation

After explicit deployment approval:

1. Authenticate Wrangler with a narrowly scoped Cloudflare API token.
2. Run `npm ci && npm run check`.
3. Set all Worker secrets.
4. Run `npm run deploy` to create the Worker and `LiveRoom` Durable Object migration.
5. Attach only the `modpackdad.gg/api/live/*` (and, if used, `www.modpackdad.gg/api/live/*`) route to this Worker in the existing zone.
6. Add Cloudflare rate-limiting/WAF rules for `/api/live/chat` and `/api/live/telemetry`. The Worker also enforces a room connection cap, bounded request bodies, and an aggregate telemetry limit; `Origin` alone is not treated as an abuse-control boundary.
7. Complete YouTube and Twitch authorization, then create Twitch EventSub subscriptions.
8. Verify `/api/live/health`, a live/upcoming/offline status, both chat providers, an upstream deletion event, and the Cloudflare Pages `/live/` page.

Do not add the live API route to a Pages preview hostname unless that environment has separate non-production credentials.

## Chat protocol

The Worker sends JSON messages with these event types:

- `snapshot`
- `chat.message`
- `chat.delete`
- `chat.clear_user`
- `chat.clear`
- `status`
- `provider.health`
- `viewer.count`

The Phase 1 browser socket is read-only. Client messages are ignored; cross-platform sending and native MPD chat are deliberately not implemented.

Messages are held only in a bounded in-memory buffer. They are not written to Durable Object storage, so the website does not create a persistent second archive of upstream chat. Status, aggregate telemetry counters, and provider health are stored; message content is not.
