# `/live` implementation plan

## Existing application

`modpackdad.gg` is a dependency-free static HTML/CSS/JavaScript site deployed from `main` through Cloudflare Pages. It has no backend, authentication, database, analytics integration, environment-variable convention, automated test suite, or repository-owned deployment workflow. Existing Twitch and YouTube integration consists only of outbound links.

The site uses standalone pages with a shared visual language rather than a component framework: dark metallic surfaces, cyan accents, Orbitron headings, Rajdhani body text, responsive cards, and minimal client-side JavaScript.

## Platform decisions

- Use a supported YouTube video-ID embed. Discover active and upcoming broadcasts server-side with the YouTube Live Streaming API; do not rely on the undocumented channel-based `live_stream?channel=...` embed.
- Use YouTube `liveChatMessages.list`, honoring its `pollingIntervalMillis`, because the recommended `streamList` transport is a generated gRPC server stream and is not a natural fit for the Cloudflare Workers runtime.
- Use Twitch EventSub webhooks for chat and moderation events. Do not use legacy IRC.
- Do not use Restream Chat as the primary Twitch/YouTube source because its documented aggregated event stream does not expose the upstream deletion events required for moderation parity.
- Defer Kick and SOOP ingestion. Both have official integration paths, but each requires separate application registration/OAuth and neither should delay the Twitch + YouTube milestone.
- Keep native ModPackDad chat and outbound cross-platform sending out of Phase 1.

## Architecture

1. Add a static, responsive `/live/` page to Cloudflare Pages.
2. Add a separately deployed Cloudflare Worker with one Durable Object for the ModPackDad channel.
3. Route only `/api/live/*` to the Worker, leaving the existing Pages deployment unchanged.
4. The Worker exposes:
   - `GET /api/live/status` for live/upcoming/offline metadata.
   - `GET /api/live/chat` as a read-only WebSocket stream.
   - `POST /api/live/events/twitch` for signed EventSub callbacks.
   - `POST /api/live/telemetry` for bounded, privacy-conscious operational events.
   - `GET /api/live/health` for non-secret provider health.
5. Provider adapters normalize Twitch and YouTube messages into one internal schema. The Durable Object owns deduplication, bounded recent history, suppression rules, available upstream moderation handling, provider health, reconnect/backoff state, and browser fan-out.
6. Secrets remain Worker secrets. No credential is embedded in the static site or committed to Git.

WebSockets are preferable to SSE here because Cloudflare Durable Objects support WebSocket fan-out and hibernation directly. The browser connection is still read-only; no chat-send protocol is implemented.

## Reliability and security

- Video, metadata, and each chat provider fail independently.
- Preserve last-known YouTube metadata so a temporary API failure does not replace a working embed.
- Use exponential backoff and provider-specific retry timing.
- Render all chat text through DOM `textContent`; never inject provider HTML.
- Enforce same-origin WebSocket/API access, signed Twitch webhook verification, message length/history bounds, and server-side suppression rules.
- Propagate Twitch message deletions and clear/ban effects. YouTube currently exposes bans and retrospective tombstones but no real-time deleted-message ID; a tombstone conservatively clears the short YouTube website buffer rather than pretending exact deletion parity.
- Add a `/live/*` Content Security Policy and restrictive browser permissions.

## Verification

- Node built-in tests for normalization, deduplication, moderation events, suppression, bounds, and status selection.
- Wrangler dry-run bundle validation.
- HTML validation and `git diff --check`.
- Chromium desktop and mobile visual QA with mocked live, upcoming, offline, and provider-failure states.

## Production prerequisites

Production activation requires explicit approval to create/deploy the Worker and Durable Object, attach the `/api/live/*` route, and set Cloudflare secrets. It also requires YouTube channel OAuth authorization and Twitch app/bot/broadcaster authorization. This implementation PR does not provision or deploy those resources.

## Official references

- YouTube embedded player: https://developers.google.com/youtube/player_parameters
- YouTube broadcasts: https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/list
- YouTube chat: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list
- Twitch chat and EventSub: https://dev.twitch.tv/docs/chat
- Twitch EventSub subscriptions: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types
- Kick webhook events: https://docs.kick.com/events/event-types
- Restream Chat API: https://developers.restream.io/chat
- SOOP Developers: https://developers.sooplive.com/
- Cloudflare Pages Functions and bindings: https://developers.cloudflare.com/pages/functions/ and https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Durable Object WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
